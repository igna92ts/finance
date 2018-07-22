require('babel-polyfill');

const moment = require('moment'),
  binance = require('./binance'),
  chart = require('./chart'),
  { roundTime } = require('./helpers'),
  rndForest = require('./tree');

const TIME_CONSTRAINT = 'seconds';
const TIME_MS = 1000;

const getPricesPerTimestep = historicalTrades => {
  let initialTime = roundTime(historicalTrades[0].time, 1, TIME_CONSTRAINT, 'floor');
  const pricesPerTimestep = [
    {
      price: historicalTrades[0].price,
      time: initialTime
    }
  ];
  historicalTrades.forEach(t => {
    const roundedTime = roundTime(t.time, 1, TIME_CONSTRAINT, 'floor');
    const timeDifference = moment(roundedTime).diff(initialTime, TIME_CONSTRAINT);
    const latestPrice = pricesPerTimestep[pricesPerTimestep.length - 1].price;
    if (timeDifference > 1) {
      for (let i = 1; i < timeDifference; i++) {
        pricesPerTimestep.push({
          price: latestPrice,
          time: initialTime + i * TIME_MS // 1 second
        });
      }
      initialTime = roundedTime;
      pricesPerTimestep.push({
        price: t.price,
        time: roundedTime
      });
    }
  });
  return pricesPerTimestep;
};

const fetchTrades = async amount => {
  const historicalTrades = await binance.fetchTrades(amount);
  return getPricesPerTimestep(historicalTrades);
};

const differenceTrades = trades => {
  return trades.reduce((res, t, index) => {
    if (index > 0) {
      res.push({
        price: t.price - trades[index - 1].price,
        time: t.time
      });
    }
    return res;
  }, []);
};

const percentageDifference = trades => {
  return trades.reduce((res, t, index) => {
    if (index > 0) {
      const difference = t.price - trades[index - 1].price;
      const percent = (difference * 100) / trades[index - 1].price;
      res.push({
        realPrice: t.price,
        price: percent,
        time: t.time
      });
    }
    return res;
  }, []);
};

const movingAvg = (trades, time) => {
  // time in seconds
  return trades.map((t, index) => {
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
      MA: temp / divider
    };
  });
};

const expMovingAvg = (mArray, mRange) => {
  const k = 2 / (mRange + 1);
  // first item is just the same as the first item in the input
  const emaArray = [{ ...mArray[0], EMA: mArray[0].price }];
  // for the rest of the items, they are computed with the previous one
  for (let i = 1; i < mArray.length; i++) {
    emaArray.push({
      ...mArray[i],
      EMA: mArray[i].price * k + emaArray[i - 1].EMA * (1 - k)
    });
  }
  return emaArray;
};

const diffNumbers = (num1, num2) => {
  if (num1 > num2) return num1 - num2;
  else return num2 - num1;
};

const relStrIndex = (trades, time) => {
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
      RSI: index < time ? 50 : firstRsi
    });
  });
  return rsiArray;
};

const TRANSACTION_TIME = 5;
const tradingFee = 0.001 * 2; // buy and sell
const marginFee = 0.001 * 2; // buy and sell earnings
const fastSellingMargin = 0.001 * 2; // 0.5% to buy and sell fast
const accumulatedFees = price => price + (price * tradingFee + price * marginFee + price * fastSellingMargin);
const expectedAction = trades => {
  return trades.reduce((res, t, index) => {
    const newTrades = trades.slice(index);
    if (!newTrades[TRANSACTION_TIME]) return res;
    if (trades[index + 1].realPrice >= t.realPrice) {
      let accumulated = 0;
      let average = 0;
      for (let i = 0; i < newTrades.length; i++) {
        accumulated += newTrades[i].realPrice;
        average = accumulated / (i + 1);
        if (!newTrades[i + TRANSACTION_TIME]) return [...res, { ...t, action: 'NOTHING' }];
        if (average < t.realPrice) continue;
        if (
          average > accumulatedFees(t.realPrice) &&
          newTrades[i + TRANSACTION_TIME].realPrice > accumulatedFees(t.realPrice)
        ) {
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
    } else if (newTrades[TRANSACTION_TIME].realPrice < t.realPrice){
      return [...res, { ...t, action: 'SELL' }];
    } else {
      return [...res, { ...t, action: 'NOTHING' }];
    }
  }, []);
};

const calculateReturns = trades => {
  const money = {
    USD: 1000,
    CUR: 0
  };
  trades.forEach(t => {
    if (t.action === 'BUY' && money.USD > 0) {
      money.CUR += (money.USD * 0.1) / (t.realPrice + t.realPrice * 0.001); // I add a little to buy it fast
      money.USD -= money.USD * 0.1;
    }
    if (t.action === 'SELL') {
      money.USD += money.CUR * (t.realPrice - t.realPrice * 0.001);
      money.CUR = 0;
    }
  });
  return money;
};

const calculateMaxReturns = trades => {
  const money = {
    USD: 1000,
    CUR: 0
  };
  trades.forEach((t, index) => {
    if (trades[index + 1]) {
      if (trades[index + 1].realPrice > t.realPrice && money.USD > 0) {
        money.CUR = money.USD / t.realPrice;
        money.USD = 0;
      }
      if (trades[index + 1].realPrice < t.realPrice && money.CUR > 0) {
        money.USD = money.CUR * t.realPrice;
        money.CUR = 0;
      }
    }
  });
  return money;
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
    return { ...t, time: parseInt(`${time.hours()}${time.minutes()}${time.seconds()}`) };
  });
};

const arima = async () => {
  console.log('FETCHING');
  const tradeData = await fetchTrades(1000); // newest is last
  console.log('DIFFERENCING');
  const detrended = percentageDifference(tradeData);
  console.log('EMA');
  const emaArray = expMovingAvg(detrended, 60);
  console.log('RSI');
  const rsiArray = relStrIndex(emaArray, 60);
  console.log('MA');
  const maArray = movingAvg(rsiArray, 60);
  console.log('EXPECTED ACTION');
  const expectedActionArr = expectedAction(maArray);
  console.log('changing time');
  const ultimateArr = changeTime(expectedActionArr);
  // const returns = calculateReturns(ultimateArr);
  // const maxReturns = calculateMaxReturns(ultimateArr);
  const forest = rndForest.buildForest(
    ['MA', 'EMA', 'RSI', 'price', 'time'],
    ultimateArr.slice(0, ultimateArr.length / 2)
  );
  console.log('TERMINO');
  const test = ultimateArr
    .slice(ultimateArr.length / 2)
    .map(e => ({ estimate: estimate(forest, e), actual: e }));
  debugger;
};

try {
  arima();
} catch (err) {
  console.log(err);
}

module.exports = {
  percentageDifference,
  movingAvg,
  expMovingAvg,
  getPricesPerTimestep,
  relStrIndex
};
