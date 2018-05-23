const synaptic = require('synaptic'),
  chart = require('./chart'),
  jsondb = require('./jsondb'),
  moment = require('moment'),
  binance = require('./binance'),
  { diffTimes, roundTime, memoize, logit, sigmoid } = require('./helpers');

const lstmNetwork = new synaptic.Architect.LSTM(2, 5, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const TEST_ITERATIONS = 20000;
const LIVE_ITERATIONS = 10;
const PREDICTION_TIME = 1;
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
  const pricesPerSecond = [{
    price: historicalTrades[0].price,
    time: initialTime
  }];
  historicalTrades.forEach(t => {
    const roundedTime = roundTime(t.time, 1, 'seconds', 'floor');
    const timeDifference = moment(roundedTime).diff(initialTime, 'seconds');
    const latestPrice = pricesPerSecond[pricesPerSecond.length - 1].price;
    if (timeDifference > 1) {
      for (let i = 0; i < timeDifference - 1; i++) {
        pricesPerSecond.push({
          price: latestPrice,
          time: initialTime + i * 1000 // 1 second
        })
      }
      initialTime = roundedTime;
      pricesPerSecond.push({
        price: t.price,
        time: roundedTime
      });
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
    if (rows.length > index + 1) {
      output = sigmoid(Math.log10(rows[index + 1].price)); // el precio
      const response = {
        input: [Math.sin(row.time), Math.log10(row.price)],
        output: [output]
      }
      resultSet.push(response);
      return resultSet;
    } else
      return resultSet;
  }, []);
};

const addPriceSeconds = (pricesPerSecond, trade) => {
  const lastPrice = pricesPerSecond[pricesPerSecond.length - 1];
  const roundedTime = roundTime(trade.time, 1, 'seconds', 'floor');
  const timeDifference = moment(roundedTime).diff(lastPrice.time, 'seconds');
  const newSeconds = [];
  if (timeDifference > 1) {
    for (let i = 0; i < timeDifference - 1; i++) {
      newSeconds.push({
        price: lastPrice.price,
        time: lastPrice.time + i * 1000 // 1 second
      });
    }
    newSeconds.push({
      price: trade.price,
      time: roundedTime
    });
  }
  return newSeconds;
};

const runProcess = () => {
  chart.setGraphingServer().then(sendGraphData => {
    binance.fetchTrades().then(trainingRows => {
      
      let pricesPerSecond = getPricesPerSecond(trainingRows);
      const trainingSet = getTrainingSet(pricesPerSecond);
      
      trainer.train(trainingSet, {
        error: .00000000005,
      	log: 1000,
      	iterations: TEST_ITERATIONS,
      	rate: 0.03,
      	shuffle: true
      });
      binance.watchTrades(trade => {
        const newSeconds = addPriceSeconds(pricesPerSecond, trade);
        
        if (newSeconds.length > 0) {
          const start = newSeconds[0];
          const input = [Math.sin(start.time), Math.log10(start.price)];
          let result = lstmNetwork.activate(input)[0];
          const predictions = [Math.pow(10, logit(result))];
          for (let i = 1; i < newSeconds.length; i++) {
            result = lstmNetwork.activate([Math.sin(start.time + 1000 * i), Math.log10(Math.pow(10, logit(result)))])[0]
            predictions.push(Math.pow(10, logit(result)));
          }
          
          for (let i = 0; i < newSeconds.length - 1; i ++) {
            if (trainingSet.length > LIVE_TRAINING_SIZE)
                trainingSet.shift();
              
            trainingSet.push({
              input: [
                Math.sin(newSeconds[i].time),
                Math.log10(newSeconds[i].price)
              ],
              output: [sigmoid(Math.log10(newSeconds[i + 1].price))]
            });
          }
            
          trainer.train(trainingSet, {
            error: .00000000005,
          	iterations: LIVE_ITERATIONS,
          	rate: 0.03
          });
          const temp = [...pricesPerSecond, ...newSeconds];
          pricesPerSecond = temp.slice(temp.length - LIVE_TRAINING_SIZE);
          sendGraphData(newSeconds, predictions);
        }
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