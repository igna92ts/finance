require('babel-polyfill');

const moment = require('moment'),
  binance = require('./binance'),
  chart = require('./chart'),
  { roundTime, pipe, diffTimes } = require('./helpers'),
  validator = require('./validator'),
  rndForest = require('./forest'),
  aws = require('./amazon'),
  logger = require('./logger'),
  { calculateReturns, calculateMaxReturns } = require('./validator');

const TIME_CONSTRAINT = 'minutes';
const TIME_MS = 60000;

const getPricesPerTimestep = historicalTrades => {
  if (historicalTrades.length === 0) return historicalTrades;
  let initialTime = roundTime(historicalTrades[0].time, 1, TIME_CONSTRAINT, 'floor');
  const pricesPerTimestep = [
    {
      realPrice: historicalTrades[0].price,
      volume: historicalTrades[0].volume,
      time: initialTime
    }
  ];
  let tempVolume = 0;
  historicalTrades.forEach(t => {
    const roundedTime = roundTime(t.time, 1, TIME_CONSTRAINT, 'floor');
    const timeDifference = moment(roundedTime).diff(initialTime, TIME_CONSTRAINT);
    const latestPrice = pricesPerTimestep[pricesPerTimestep.length - 1].realPrice;
    if (timeDifference > 1) {
      for (let i = 1; i < timeDifference; i++) {
        pricesPerTimestep.push({
          realPrice: latestPrice,
          time: initialTime + i * TIME_MS, // 1 second
          volume: 0
        });
      }
      initialTime = roundedTime;
      pricesPerTimestep.push({
        volume: tempVolume,
        realPrice: t.price,
        time: roundedTime
      });
      tempVolume = 0;
    } else {
      tempVolume += t.volume;
    }
  });
  return pricesPerTimestep;
};

const fillPricesPerTimestep = (historicalTrades, finishTime, missingTrades) => {
  const missingTradesPerTimestep = getPricesPerTimestep(missingTrades);
  return [...historicalTrades, ...missingTradesPerTimestep.filter(t => t.time > finishTime)];
};

const fillTrades = async historicalTrades => {
  const finishTime = historicalTrades[historicalTrades.length - 1].time;
  const missingTrades = await binance.fillTransactions(finishTime);
  return fillPricesPerTimestep(historicalTrades, finishTime, missingTrades);
};

const BASE_FETCH_AMOUNT = 100000;
const MAX_TRADES = 43200; // 2 days in minutes
const fetchTrades = async () => {
  const existingTradeData = await aws.getData();
  if (
    existingTradeData.length === 0 ||
    diffTimes(moment().valueOf(), existingTradeData[existingTradeData.length - 1].time) > 2880 // amount of minutes in 2 days
  ) {
    const historicalTrades = await binance.fetchTrades(BASE_FETCH_AMOUNT);
    return getPricesPerTimestep(historicalTrades);
  } else {
    const spinner = logger.spinner('Filling missing Transactions').start();
    const trades = await fillTrades(existingTradeData);
    spinner.succeed();
    return trades.slice(-MAX_TRADES); // to get at most MAX_TRADES
  }
};

const percentageDifference = (trades, label = 'price') => {
  return trades.reduce((res, t, index) => {
    if (index > 0) {
      const difference = t.realPrice - trades[index - 1].realPrice;
      const percent = (difference * 100) / trades[index - 1].realPrice;
      if (t[label] !== undefined && t.realPrice !== undefined) {
        res.push(t);
      } else {
        res.push({
          realPrice: t.realPrice,
          [label]: percent,
          time: t.time
        });
      }
    }
    return res;
  }, []);
};

const exponentialSmoothing = (trades, label = 'price') => {
  const SMOOTHING_FACTOR = 0.3;
  return trades.reduce((res, t, index) => {
    if (index === 0) res.push({ ...t, [label]: t.realPrice });
    else {
      const expSmoothValue =
        SMOOTHING_FACTOR * t.realPrice + (1 - SMOOTHING_FACTOR) * res[res.length - 1][label];
      res.push({
        ...t,
        [label]: expSmoothValue
      });
    }
    return res;
  }, []);
};

const onVolumeBalance = (trades, label = 'OVB') => {
  return trades.reduce((res, t, index) => {
    if (t[label] !== undefined) {
      res.push(t);
      return res;
    }
    const previousTrade = res[res.length - 1];
    let ovb = 0;
    if (previousTrade) {
      if (previousTrade.realPrice < t.realPrice) {
        ovb = previousTrade[label] + t.volume;
      } else if (previousTrade.realPrice > t.realPrice) {
        ovb = previousTrade[label] - t.volume;
      } else {
        ovb = previousTrade[label];
      }
    }
    res.push({
      ...t,
      [label]: ovb
    });
    return res;
  }, []);
};

const movingAvg = (trades, time, label = 'MA') => {
  // time in seconds
  return trades.map((t, index) => {
    if (t[label] !== undefined) return t;
    let temp = 0;
    let divider = time;
    for (let i = index; i > index - time; i--) {
      if (i < 0) {
        divider = index + 1;
        break;
      } else divider = time;
      temp += trades[i].price;
    }
    return {
      ...t,
      [label]: temp / divider
    };
  });
};

const stdDeviation = (trades, time, label = 'STD') => {
  return trades.map((t, index) => {
    const start = index - time;
    if (t[label] !== undefined) return t;
    if (start < 0) return { ...t, [label]: 0 };
    const timeFrame = trades.slice(start, index);
    const mean = timeFrame.reduce((res, trade) => res + trade.price, 0) / timeFrame.length;
    const squaredDifferences = timeFrame.map(trade => (trade.price - mean) ** 2);
    const meanSqdDifference = squaredDifferences.reduce((res, d) => res + d, 0) / squaredDifferences.length;
    return {
      ...t,
      [label]: Math.sqrt(meanSqdDifference)
    };
  });
};

const priceRateOfChange = (trades, time, label = 'PROC') => {
  return trades.map((t, index) => {
    const start = index - time;
    if (t[label] !== undefined) return t;
    if (start < 0) return { ...t, [label]: 0 };
    const currentPrice = t.price;
    const oldPrice = trades[start].price;
    return {
      ...t,
      [label]: (currentPrice - oldPrice) / oldPrice
    };
  });
};

const stochasticOscillator = (trades, time, label = 'STO') => {
  return trades.map((t, index) => {
    const start = index - time;
    if (t[label] !== undefined) return t;
    if (start < 0) return { ...t, [label]: 0 };
    const currentPrice = t.price;
    const timeFrame = trades.slice(start, index);
    const low = Math.min(...timeFrame.map(e => e.price));
    const high = Math.max(...timeFrame.map(e => e.price));
    const k = 100 * ((currentPrice - low) / (high - low));
    return {
      ...t,
      [label]: k
    };
  });
};

const williamsR = (trades, time, label = 'WR') => {
  return trades.map((t, index) => {
    const start = index - time;
    if (t[label] !== undefined) return t;
    if (start < 0) return { ...t, [label]: 0 };
    const currentPrice = t.price;
    const timeFrame = trades.slice(start, index);
    const low = Math.min(...timeFrame.map(e => e.price));
    const high = Math.max(...timeFrame.map(e => e.price));
    const r = ((high - currentPrice) / (high - low)) * -100;
    return {
      ...t,
      [label]: r
    };
  });
};

const expMovingAvg = (mArray, mRange, label = 'EMA') => {
  const k = 2 / (mRange + 1);
  // first item is just the same as the first item in the input
  let emaArray = [];
  if (mArray[0][label] === undefined) emaArray = [{ ...mArray[0], [label]: mArray[0].price }];
  else emaArray = [mArray[0]];
  // for the rest of the items, they are computed with the previous one
  for (let i = 1; i < mArray.length; i++) {
    if (mArray[i][label] !== undefined) {
      emaArray.push(mArray[i]);
    } else {
      emaArray.push({
        ...mArray[i],
        [label]: mArray[i].price * k + emaArray[i - 1][label] * (1 - k)
      });
    }
  }
  return emaArray;
};

const diffNumbers = (num1, num2) => {
  if (num1 > num2) return num1 - num2;
  else return num2 - num1;
};

const relStrIndex = (trades, time, label = 'RSI') => {
  const rsiArray = [];
  let lastAvgGain = 0;
  let lastAvgLoss = 0;
  trades.forEach((t, index) => {
    let tempGain = 0;
    let tempLoss = 0;
    if (index >= time) {
      if (t.realPrice > trades[index - 1].realPrice) {
        tempGain = diffNumbers(t.realPrice, trades[index - 1].realPrice);
      } else {
        tempLoss = diffNumbers(t.realPrice, trades[index - 1].realPrice);
      }
      lastAvgGain = (lastAvgGain * (time - 1) + tempGain) / time;
      lastAvgLoss = (lastAvgLoss * (time - 1) + tempLoss) / time;
    } else {
      for (let i = index; i > index - time; i--) {
        if (i - 1 < 0) break;
        if (trades[i].realPrice > trades[i - 1].realPrice) {
          tempGain += diffNumbers(trades[i].realPrice, trades[i - 1].realPrice);
        } else {
          tempLoss += diffNumbers(trades[i].realPrice, trades[i - 1].realPrice);
        }
      }
      lastAvgGain = tempGain / time;
      lastAvgLoss = tempLoss / time;
    }
    const firstRs = lastAvgGain / lastAvgLoss || 0;
    const firstRsi = 100 - 100 / (1 + firstRs);
    rsiArray.push({
      ...t,
      [label]: index < time ? 50 : firstRsi
    });
  });
  return rsiArray;
};

// const TRANSACTION_TIME = 1;
// const tradingFee = 0.001 * 2; // buy and sell
// const marginFee = 0.001 * 2; // buy and sell earnings
// const fastSellingMargin = 0.001 * 2; // 0.5% to buy and sell fast
// const accumulatedFees = price => price + (price * tradingFee + price * marginFee + price * fastSellingMargin);
// const expectedAction = trades => {
//   return trades.reduce((res, t, index) => {
//     if (t.action) return [...res, t];
//     const newTrades = trades.slice(index);
//     if (newTrades.length === 0) return res;
//     if (trades[index + 1].realPrice >= t.realPrice) {
//       let accumulated = 0;
//       let average = 0;
//       for (let i = 0; i < newTrades.length; i++) {
//         accumulated += newTrades[i].realPrice;
//         average = accumulated / (i + 1);
//         if (!newTrades[i + TRANSACTION_TIME]) return [...res, { ...t, action: 'NOTHING' }];
//         if (average < t.realPrice) continue;
//         if (average > accumulatedFees(t.realPrice) && newTrades[i].realPrice > accumulatedFees(t.realPrice)) {
//           return [
//             ...res,
//             {
//               ...t,
//               action: 'BUY'
//             }
//           ];
//         }
//       }
//       return [...res, { ...t, action: 'NOTHING' }];
//     } else if (newTrades[TRANSACTION_TIME].realPrice < t.realPrice) {
//       return [...res, { ...t, action: 'SELL' }];
//     } else {
//       return [...res, { ...t, action: 'NOTHING' }];
//     }
//   }, []);
// };

const TRANSACTION_TIME = 1;
const tradingFee = 0.001 * 2; // buy and sell
const marginFee = 0.001 * 2; // buy and sell earnings
const fastSellingMargin = 0.0005 * 2; // 0.5% to buy and sell fast
const accumulatedFees = price => price + (price * tradingFee + price * marginFee + price * fastSellingMargin);
const expectedAction = trades => {
  return trades.reduce((res, t, index) => {
    if (t.action) return [...res, t];
    const newTrades = trades.slice(index + 1); // trades after this one
    if (newTrades.length === 0) return [...res, { ...t, action: 'NOTHING' }];
    if (newTrades[0].realPrice >= t.realPrice) {
      let accumulated = 0;
      let average = 0;
      for (let i = 0; i < newTrades.length; i++) {
        accumulated += newTrades[i].realPrice;
        average = accumulated / (i + 1);
        if (average < t.realPrice) return [...res, { ...t, action: 'NOTHING' }];
        if (average > accumulatedFees(t.realPrice) && newTrades[i].realPrice > accumulatedFees(t.realPrice)) {
          return [
            ...res,
            {
              ...t,
              action: 'BUY'
            }
          ];
        }
      }
      return [...res, { ...t, action: 'NOTHING' }];
    } else if (newTrades[0].realPrice < t.realPrice) {
      return [...res, { ...t, action: 'SELL' }];
    } else {
      return [...res, { ...t, action: 'NOTHING' }];
    }
  }, []);
};

const estimate = (forest, trade) => {
  return forest.map(tree => tree(trade)).reduce(
    (res, e) => {
      const keys = Object.keys(e);
      keys.forEach(k => {
        res[k] += e[k];
      });
      return res;
    },
    { BUY: 0, NOTHING: 0, SELL: 0 }
  );
};

const changeTime = trades => {
  return trades.map(t => {
    const time = moment(t.time);
    return { ...t, shortTime: parseInt(`${time.hours()}${time.minutes()}${time.seconds()}`) };
  });
};

const calculateFeatures = tradeData => {
  const featureFunctions = [
    [exponentialSmoothing, 'price'],
    [stochasticOscillator, 9, 'STO9'],
    [stochasticOscillator, 14, 'STO14'],
    [williamsR, 9, 'WR9'],
    [williamsR, 14, 'WR14'],
    [priceRateOfChange, 9, 'PROC9'],
    [priceRateOfChange, 14, 'PROC14'],
    [stdDeviation, 5, 'STD5'],
    [stdDeviation, 10, 'STD10'],
    [stdDeviation, 20, 'STD20'],
    [stdDeviation, 50, 'STD50'],
    [expMovingAvg, 12, 'EMA12'],
    [expMovingAvg, 26, 'EMA26'],
    [expMovingAvg, 50, 'EMA50'],
    [relStrIndex, 9, 'RSI9'],
    [relStrIndex, 14, 'RSI14'],
    [relStrIndex, 50, 'RSI50'],
    [movingAvg, 5, 'MA5'],
    [movingAvg, 10, 'MA10'],
    [movingAvg, 20, 'MA20'],
    [movingAvg, 50, 'MA50']
  ];
  return {
    data: pipe(
      tradeData.map(t => ({ time: t.time, volume: t.volume, realPrice: t.realPrice })),
      ...featureFunctions
      // [onVolumeBalance, 'OVB'],
    ),
    features: featureFunctions.map(f => f[f.length - 1])
  };
};

const generateTest = async () => {
  const tradeData = await fetchTrades();
  const { data, features } = calculateFeatures(tradeData);
  const trainData = expectedAction(data);
  await aws.uploadData(trainData);
  const returns = calculateReturns(trainData);
  const maxReturns = calculateMaxReturns(trainData);
  // const validation = await validator.validate(
  //   4,
  //   features,
  //   trainData.slice(50).slice(-10080) // hasta ahora con esto el mejor resultado§
  // );
  // logger.info(`VALIDATION RESULT ${validation}`);
};

// try {
//   generateTest();
// } catch (err) {
//   logger.error(err);
// }

module.exports = {
  calculateFeatures,
  exponentialSmoothing,
  movingAvg,
  expMovingAvg,
  priceRateOfChange,
  onVolumeBalance,
  stdDeviation,
  williamsR,
  stochasticOscillator,
  getPricesPerTimestep,
  relStrIndex,
  fetchTrades,
  expectedAction,
  generateTest
};
