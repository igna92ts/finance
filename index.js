const synaptic = require('synaptic'),
  graph = require('./render'),
  csvReader = require('./csv_reader'),
  jsondb = require('./jsondb'),
  moment = require('moment');

const lstmNetwork = new synaptic.Architect.LSTM(5, 5, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const sigmoid = t => {
  return 1 / (1 + Math.exp(-t));
};
const logit = t => -Math.log(1 / t - 1);

const percentageVariance = (previousPrice, newPrice) => {
  const difference = newPrice - previousPrice;
  const percentage = (difference * 100) / previousPrice;
  return percentage;
};

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
  return moment.duration(moment.unix(finish).diff(moment.unix(oldtime))).asMinutes()
});

const movingAvg2 = (rows, index, avgTime, tag = 'price') => {
  const avgRows = [];
  let finishTime = rows[index]['time'];
  for (let i = index; i >= 0; i--) {
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

csvReader.readCsv().then(rows => {
  // Math.pow(10, logit(sigmoid(Math.log10(714.3869))))
  const trainRows = rows.slice(0, 1000);
  const testRows = rows.slice(1000);
  const x = testRows.map(r => moment.unix(parseInt(r.time)).format("YYYY-MM-DD HH:mm"));
  
  const trainingSet = trainRows.map((row, index) => {
    let output = 0;
    if (trainRows[index + 1])
      output = sigmoid(Math.log10(trainRows[index + 1]['price'])); // el precio
    else
      output = sigmoid(Math.log10(row.price));
    const response = {
      // dividir ordenes y precio por lo que los dejaria entre 1 y 0
      input: [Math.sin(row.time), Math.log10(row.price), Math.log10(row.volume), Math.log10(movingAvg2(trainRows, index, 1)), Math.log10(movingAvg2(trainRows, index, 10))],
      output: [output]
    }
    return response;
  });
  // const json = require('./networks/current.json')
  // lstmNetwork = synaptic.Network.fromJSON(json);
  trainer.train(trainingSet, {
    error: .00000000005,
  	log: 1,
  	iterations: 20000,
  	// shuffle: true,
  	rate: 0.03
  });
  jsondb(lstmNetwork.toJSON()).then(() => {
    const values = testRows.map((row, index) => {
      const input = [Math.sin(row.time), Math.log10(row.price), Math.log10(row.volume), Math.log10(movingAvg2(testRows, index, 1)), Math.log10(movingAvg2(testRows, index, 10))]
      const result = lstmNetwork.activate(input)[0];
      if (testRows[index + 1]) {
        trainingSet.shift();
        trainingSet.push({
          input,
          output: [sigmoid(Math.log10(testRows[index + 1]['price']))]
        });
        trainer.train(trainingSet, {
          error: .00000000005,
        	iterations: 1,
        	// shuffle: true,
        	rate: 0.03
        });
      }
      return Math.pow(10, logit(result));
    });

    const btcPrice = testRows.map(r => r.price);
    graph([values, btcPrice], x);
  });
});
