const synaptic = require('synaptic'),
  chart = require('./chart'),
  jsondb = require('./jsondb'),
  moment = require('moment'),
  binance = require('./binance');

const lstmNetwork = new synaptic.Architect.LSTM(5, 5, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const sigmoid = t => {
  return 1 / (1 + Math.exp(-t));
};
const logit = t => -Math.log(1 / t - 1);

const memoize = func => {
  let memo = {};
  let slice = Array.prototype.slice;

  return function() {
    let args = slice.call(arguments);

    if (args in memo)
      return memo[args];
    else
      return (memo[args] = func.apply(this, args));
  }
}

const diffTimes = memoize((finish, oldtime) => {
  return moment.duration(moment(finish).diff(moment(oldtime))).asMinutes()
});

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

const round = (date, unit, amount, method) => {
  const duration = moment.duration(unit, amount);
  return moment(Math[method]((+date) / (+duration)) * (+duration)); 
}

const getPricesPerSecond = historicalTrades => {
  let initialTime = round(historicalTrades[0].time, 1, 'seconds', 'floor');
  const pricesPerSecond = [historicalTrades[0].price];
  historicalTrades.forEach(t => {
    const roundedTime = round(t.time, 1, 'seconds', 'floor')
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

const getTrainingSet = rows => {
  return rows.map((row, index) => {
    let output = 0;
    if (rows[index + 1])
      output = sigmoid(Math.log10(rows[index + 1]['price'])); // el precio
    else
      output = sigmoid(Math.log10(row.price));
    const response = {
      input: [Math.sin(row.time), Math.log10(row.price), Math.log10(row.volume), Math.log10(movingAvg(rows, 1)), Math.log10(movingAvg(rows, 10))],
      output: [output]
    }
    return response;
  });
};

const runProcess = () => {
  chart.setGraphingServer().then(sendGraphData => {
    binance.fetchTrades().then(trainingRows => {
      const trainingSet = getTrainingSet(trainingRows);
      const pricesPerSecond = getPricesPerSecond(trainingRows);
      
      trainer.train(trainingSet, {
        error: .00000000005,
      	log: 1,
      	iterations: 20000,
      	rate: 0.03
      });
      binance.watchTrades(trade => {
        const lastTrade = trainingRows[trainingRows.length - 1];
        const input = [Math.sin(lastTrade.time), Math.log10(lastTrade.price), Math.log10(lastTrade.volume), Math.log10(movingAvg(trainingRows, 1)), Math.log10(movingAvg(trainingRows, 10))];
        const result = lstmNetwork.activate(input)[0];
        
        trainingSet.shift();
        trainingSet.push({
          input,
          output: [sigmoid(Math.log10(trade.price))]
        });
          
        trainingRows.shift();
        trainingRows.push(trade);
          
        trainer.train(trainingSet, {
          error: .00000000005,
        	iterations: 1,
        	rate: 0.03
        });
        // console.log((Math.abs(trade.price - Math.pow(10, logit(result)))) * 100 / trade.price)
        sendGraphData({
          time: moment(trade.time).format("HH:mm"),
          realPrice: trade.price,
          predictedPrice: Math.pow(10, logit(result))
        });
      });
    });
  });
};

module.exports = {
  getPricesPerSecond,
  getTrainingSet,
  round,
  movingAvg,
  diffTimes,
  sigmoid
};