const Random = require('random-js'),
  treeBuilder = require('../lambda/tree'),
  arima = require('../arima'),
  mt = Random.engines.mt19937().autoSeed(),
  { pipe, chunkArray } = require('../helpers');

const pickRandomElement = array => Random.pick(mt, array);
const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

const buildTree = (features, data) => {
  // const SAMPLE_SIZE = 1000;
  // const sample = getSample(SAMPLE_SIZE, data);
  const CHUNK_FOLDS = 1;
  const chunked = chunkArray(data, CHUNK_FOLDS);
  const combinedImportanceArray = chunked.reduce((total, c) => {
    const tree = treeBuilder.buildTree(features, c, false);
    const { questionFeatures } = tree;
    const giniImportance = features.reduce((res, f) => {
      const occurences = questionFeatures.filter(q => q.key === f);
      const importance = occurences.reduce(
        (sum, o) => ({ gain: sum.gain + o.gain, size: sum.size + o.size }),
        {
          size: 0,
          gain: 0
        }
      );
      return [...res, { key: f, value: importance.gain * importance.size }];
    }, []);
    return [...total, giniImportance];
  }, []);
  const avgImportance = features
    .reduce((result, f) => {
      const importance =
        combinedImportanceArray.reduce((t, ci) => ci.find(i => i.key === f).value + t, 0) / CHUNK_FOLDS;
      return [...result, { key: f, value: importance }];
    }, [])
    .sort((a, b) => a.value - b.value);

  console.log(JSON.stringify(avgImportance, 0, 2));
  return avgImportance;
};

const run = async () => {
  // lagged prices, and 5 timestep splits to grid search
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
    [arima.expMovingAvg, 12, 'EMA12'],
    [arima.expMovingAvg, 26, 'EMA26'],
    [arima.expMovingAvg, 50, 'EMA50'],
    [arima.relStrIndex, 9, 'RSI9'],
    [arima.relStrIndex, 14, 'RSI14'],
    [arima.relStrIndex, 50, 'RSI50'],
    [arima.movingAvg, 5, 'MA5'],
    [arima.movingAvg, 10, 'MA10'],
    [arima.movingAvg, 20, 'MA20'],
    [arima.movingAvg, 50, 'MA50'],
    [arima.onVolumeBalance, 'OVB']
  ];
  const features = foos.map(e => e[e.length - 1]);
  const data = pipe(
    existingData.map(t => ({ time: t.time, volume: t.volume, realPrice: t.realPrice })),
    ...foos,
    [arima.expectedAction]
  )
    .slice(50)
    .slice(-10080);
  const tree = buildTree(features, data);
};

run();
