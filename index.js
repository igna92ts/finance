const synaptic = require('synaptic'),
  chart = require('./chart'),
  jsondb = require('./jsondb'),
  moment = require('moment'),
  binance = require('./binance'),
  { diffTimes, roundTime, memoize, logit, sigmoid } = require('./helpers');

const lstmNetwork = new synaptic.Architect.LSTM(5, 5, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const TEST_ITERATIONS = 20000;
const LIVE_ITERATIONS = 10;
const PREDICTION_TIME = 120;
const LIVE_TRAINING_SIZE = 15000;

const movingAvg = (rows, avgTime, tag = 'price') => {
  const avgRows = [];
  let finishTime = rows[rows.length - 1]['time'];
  for (let i = rows.length - 1; i >= 0; i--) {
    const newTime = rows[i]['time'];
    if (rows[i]) {
      if (diffTimes(finishTime, newTime) <= avgTime)
        avgRows.push(rows[i][tag]);
      else
        break;
    }
  }
  return avgRows.reduce(memoize((t, e) => t + e), 0) / avgRows.length;
};

const getPricesPerSecond = historicalTrades => {
  let initialTime = roundTime(historicalTrades[0].time, 1, 'seconds', 'floor');
  const pricesPerSecond = [historicalTrades[0].price];
  historicalTrades.forEach(t => {
    const roundedTime = roundTime(t.time, 1, 'seconds', 'floor')
    const timeDifference = moment(roundedTime).diff(initialTime, 'seconds');
    const latestPrice = pricesPerSecond[pricesPerSecond.length - 1];
    if (timeDifference > 1) {
      for (let i = 0; i < timeDifference - 1; i++) {
        pricesPerSecond.push(latestPrice)
      }
      initialTime = roundedTime;
      pricesPerSecond.push(t.price);
    }
  });
  return pricesPerSecond;
};

const getPriceInNSeconds = (initialTime, trades, seconds) => {
  let price = 0;
  for (let i = 0; i < trades.length; i++) {
    if (moment(trades[i].time).diff(initialTime, 'seconds') >= seconds) {
      return price;
    } else {
      price = trades[i].price;
    }
  }
  return false;
};

const getTradeIndexNSecondsAgo = (finishTime, trades, seconds) => {
  for (let i = trades.length - 1; i >= 0; i--) {
    if (moment(finishTime).diff(trades[i].time, 'seconds') >= seconds) {
      return i;
    } else {
      return trades.length - 1;
    }
  };
};

const getTrainingSet = rows => {
  return rows.reduce((resultSet, row, index) => {
    let output = 0;
    const futurePrice = getPriceInNSeconds(row.time, rows, PREDICTION_TIME);
    if (futurePrice) {
      output = sigmoid(Math.log10(futurePrice)); // el precio
      const response = {
        input: [Math.sin(row.time), Math.log10(row.price), Math.log10(row.volume), Math.log10(movingAvg(rows.slice(0, index + 1), 1)), Math.log10(movingAvg(rows.slice(0, index + 1), 2))],
        output: [output]
      }
      resultSet.push(response);
      return resultSet;
    } else
      return resultSet;
  }, []);
};

const runProcess = () => {
  chart.setGraphingServer().then(sendGraphData => {
    binance.fetchTrades().then(trainingRows => {
      const trainingSet = getTrainingSet(trainingRows);
      // const pricesPerSecond = getPricesPerSecond(trainingRows);
      
      trainer.train(trainingSet, {
        error: .00000000005,
      	log: 1,
      	iterations: TEST_ITERATIONS,
      	rate: 0.03
      });
      const graphData = {
        realPrice: trainingRows[trainingRows.length - 1].price,
        predictedPrice: 0
      };
      sendGraphData(graphData);
      binance.watchTrades(trade => {
        const input = [Math.sin(trade.time), Math.log10(trade.price), Math.log10(trade.volume), Math.log10(movingAvg(trainingRows, 1)), Math.log10(movingAvg(trainingRows, 2))];
        const result = lstmNetwork.activate(input)[0];
        
        const lastRelevantTradeIndex = getTradeIndexNSecondsAgo(trade.time, trainingRows, PREDICTION_TIME);
        if (trainingSet.length > LIVE_TRAINING_SIZE)
          trainingSet.shift();
        trainingSet.push({
          input: [
            Math.sin(trainingRows[lastRelevantTradeIndex].time),
            Math.log10(trainingRows[lastRelevantTradeIndex].price),
            Math.log10(trainingRows[lastRelevantTradeIndex].volume),
            Math.log10(movingAvg(trainingRows.slice(0, lastRelevantTradeIndex + 1), 1)),  // ESTOS 2 ESTAN MAL TIENEN QUE SER DESDE EL lastRelevantTrade
            Math.log10(movingAvg(trainingRows.slice(0, lastRelevantTradeIndex + 1), 2))
          ],
          output: [sigmoid(Math.log10(trade.price))]
        });
        
        if (trainingRows.length > LIVE_TRAINING_SIZE)
          trainingRows.shift();
        trainingRows.push(trade);
          
        trainer.train(trainingSet, {
          error: .00000000005,
        	iterations: LIVE_ITERATIONS,
        	rate: 0.03
        });
        graphData.realPrice = trade.price;
        graphData.predictedPrice = Math.pow(10, logit(result));
      });
    });
  });
};

runProcess();

module.exports = {
  getPricesPerSecond,
  getTrainingSet,
  movingAvg
};