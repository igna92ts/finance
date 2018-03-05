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

const percentageVariance = (previousPrice, newPrice) => {
  const difference = newPrice - previousPrice;
  const percentage = (difference * 100) / previousPrice;
  return percentage;
};

const tenMinuteAvg = rows => {
  const parsedRows = rows.map(r => [parseInt(r[0]), parseFloat(r[1]), parseFloat(r[2])]);
  let start = moment.unix(parsedRows[0][0]);
  let currentAvg = [];
  let totalAvg = [];
  parsedRows.forEach((r, index) => {
    const time = moment.unix(r[0]);
    if (moment.duration(time.diff(start)).asMinutes() < 10) {
      currentAvg.push(r);
    } else if (index === parsedRows.length - 1) {
      currentAvg.push(r);
      totalAvg.push(currentAvg);
      currentAvg = [];
    } else {
      totalAvg.push(currentAvg);
      currentAvg = [];
      currentAvg.push(r);
      start = moment.unix(r[0]);
    }
  });
  return totalAvg.map(transactions => {
    const avgTransaction = transactions.reduce((t, e) => {
      return [t[0], t[1] + e[1], t[2] + e[2]];
    }, [transactions[0][0], 0, 0]);
    return [avgTransaction[0], avgTransaction[1] / transactions.length, avgTransaction[2] / transactions.length];
  });
  // moment.duration(b.diff(a)).asMinutes()
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

const movingAvg2 = (rows, index, avgTime) => {
  const avgRows = [];
  let finishTime = rows[index][0];
  for (let i = index; i >= 0; i--) {
    const newTime = rows[i][0];
    if (rows[i]) {
      if (diffTimes(finishTime, newTime) <= avgTime)
        avgRows.push(rows[i][1]);
      else
        break;
    }
  }
  return avgRows.reduce(memoize((t, e) => t + e), 0) / avgRows.length;
};

csvReader.readCsv().then(rows => {
  // graph([btcPrice], x);
  // const avgRows = tenMinuteAvg(rows);
  const avgRows = rows.map(r => [parseInt(r[0]), parseFloat(r[1]), parseFloat(r[2])]);
  const trainRows = avgRows.slice(0, avgRows.length / 2);
  const testRows = avgRows.slice(avgRows.length / 2);
  const x = testRows.map(r => moment.unix(parseInt(r[0])).format("YYYY-MM-DD HH:mm"));
  
  const trainingSet = trainRows.map((row, index) => {
    let output = 0;
    if (trainRows[index + 1])
      output = trainRows[index + 1][1] / 1000; // el precio
    else
      output = row[1] / 1000;
    return {
      // dividir ordenes y precio por lo que los dejaria entre 1 y 0
      input: [Math.sin(row[0]), row[1] / 1000, row[2] / 1000, movingAvg2(trainRows, index, 1) / 1000, movingAvg2(trainRows, index, 10) / 1000],
      output: [output]
    }
  });
  trainer.train(trainingSet, {
    error: .00000000005,
  	log: 1,
  	iterations: 5000,
  	// shuffle: true,
  	rate: 0.03
  });
  jsondb(lstmNetwork.toJSON()).then(() => {
    const values = testRows.map((row, index) => {
      return lstmNetwork.activate([Math.sin(row[0]), row[1] / 1000, row[2] / 1000, movingAvg2(testRows, index, 1) / 1000, movingAvg2(testRows, index, 10) / 1000])[0] * 1000;
    });
    const btcPrice = testRows.map(r => r[1]);
    graph([values, btcPrice], x);
  });
});