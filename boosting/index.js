const fs = require('fs'),
  Random = require('random-js'),
  arima = require('../arima'),
  mt = Random.engines.mt19937().autoSeed(),
  { pipe, chunkArray, mergeWithout } = require('../helpers'),
  treeBuilder = require('../lambda/tree');

const getRandomInt = (min, max) => Random.integer(min, max)(mt);

const getWeightedRandomElement = (weightedData, totalWeight) => {
  const rndNumber = getRandomInt(0, totalWeight - 1);
  const choice = weightedData.find(w => rndNumber >= w.weightArr[0] && rndNumber < w.weightArr[1]);
  return choice;
};

const getWeightedSample = (size, data) => {
  const totalWeight = data.reduce((res, d) => res + d.weight, 0);
  let temp = 0;
  const weightedData = data.map(d => {
    const weightedMember = {
      ...d,
      weightArr: [temp, temp + d.weight]
    };
    temp += d.weight;
    return weightedMember;
  });
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(getWeightedRandomElement(weightedData, totalWeight));
  }
  return sample.map(s => s.row);
};

const createTree = (existingData, features) => {
  const data = existingData.map(d => ({ time: d.time, realPrice: d.realPrice, volume: d.volume }));
  const sample = getWeightedSample(1000, data);
  const treeObj = treeBuilder.buildTree(features, sample, false); // with all features, full tree
};

const test = (data, features) => {
  const FOLDS = 10;
  const SAMPLE_SIZE = 2000;
  const chunked = chunkArray(data, FOLDS);
  const errorRows = [];
  const classifications = chunked.map((chunk, index) => {
    console.log(`CHUNK ${index}`);
    const trainingData = mergeWithout(index, chunked);
    const sample = getWeightedSample(SAMPLE_SIZE, data);
    const treeObj = treeBuilder.buildTree(features, sample, false);
    const tree = treeObj.fn;
    return (
      chunk.reduce((res, c) => {
        const treeResult = tree(c.row);
        const predictedAction = Object.keys(treeResult).reduce((t, k) => {
          if (treeResult[k] === Math.max(...['BUY', 'NOTHING', 'SELL'].map(e => treeResult[e]))) return k;
          else return t;
        });
        if (c.row.action === predictedAction) return res + 1;
        else {
          errorRows.push(c.id);
          return res;
        }
      }, 0) / chunk.length
    );
  });
  console.log(`errors: ${errorRows.length}`);
  const accuracy = classifications.reduce((sum, c) => sum + c, 0) / classifications.length;
  console.log(`average accuracy: ${accuracy}`);
  return { errorRows, accuracy: classifications.reduce((sum, c) => sum + c, 0) / classifications.length };
};

const reWeightData = (weightedData, errorRows) => {
  return weightedData.map(d => {
    if (errorRows.some(e => e === d.id)) {
      return { ...d, weight: d.weight + 5 };
    } else return d;
  });
};

const dumpToJson = population => {
  const json = JSON.stringify(population);
  return new Promise((resolve, reject) => {
    fs.writeFile('boosting_result.json', json, err => {
      if (err) reject(err);
      else console.log('SUCCESS');
    });
  });
};

const run = async () => {
  const existingData = await arima.fetchTrades();
  const foos = [
    [arima.exponentialSmoothing, 'price'],
    [arima.stochasticOscillator, 9, 'STO9'],
    [arima.stochasticOscillator, 14, 'STO14'],
    [arima.williamsR, 9, 'WR9'],
    [arima.williamsR, 14, 'WR14'],
    [arima.priceRateOfChange, 9, 'PROC9'],
    [arima.priceRateOfChange, 14, 'PROC14'],
    [arima.stdDeviation, 5, 'STD5'],
    [arima.stdDeviation, 10, 'STD10'],
    [arima.stdDeviation, 20, 'STD20'],
    [arima.stdDeviation, 50, 'STD50'],
    [arima.stdDeviation, 200, 'STD200'],
    [arima.expMovingAvg, 12, 'EMA12'],
    [arima.expMovingAvg, 26, 'EMA26'],
    [arima.expMovingAvg, 50, 'EMA50'],
    [arima.expMovingAvg, 200, 'EMA200'],
    [arima.relStrIndex, 9, 'RSI9'],
    [arima.relStrIndex, 14, 'RSI14'],
    [arima.relStrIndex, 50, 'RSI50'],
    [arima.relStrIndex, 200, 'RSI200'],
    [arima.movingAvg, 5, 'MA5'],
    [arima.movingAvg, 10, 'MA10'],
    [arima.movingAvg, 20, 'MA20'],
    [arima.movingAvg, 50, 'MA50'],
    [arima.movingAvg, 200, 'MA200'],
    [arima.onVolumeBalance, 'OVB']
  ];
  const features = foos.map(e => e[e.length - 1]);
  const data = pipe(
    existingData.map(t => ({ time: t.time, volume: t.volume, realPrice: t.realPrice })),
    ...foos,
    [arima.expectedAction]
  ); // .slice(200); // max amount of timesteps to remove
  let weightedData = data.map((d, index) => ({ row: d, weight: 1, id: index }));

  for (let i = 0; i < 100; i++) {
    const testResult = test(weightedData, features);
    weightedData = reWeightData(weightedData, testResult.errorRows);
  }
  await dumpToJson(weightedData);
};

run();
