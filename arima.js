require('babel-polyfill');

const binance = require('./binance'),
  moment = require('moment'),
  chart = require('./chart'),
  { roundTime } = require('./helpers');

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
  console.log('FETCHING TRADES');
  const historicalTrades = await binance.fetchTrades(amount);
  return getPricesPerTimestep(historicalTrades);
};

const differenceTrades = trades => {
  console.log('DIFFERENCING TRADES ', trades.length);
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

const TRANSACTION_TIME = 10;
const tradingFee = 0.001 * 2; // buy and sell
const marginFee = 0.005 * 2; // buy and sell
const accumulatedFees = price => price * tradingFee + price * marginFee;
const expectedAction = trades => {
  trades.map((t, index) => {
    const newTrades = trades.slice(index);
    if (trades[index + 1].realPrice >= t.realPrice) {
      let accumulated = 0;
      let average = 0;
      for (let i = 0; i < newTrades.length; i++) {
        accumulated += newTrades[i].realPrice;
        average = accumulated / (i + 1);
        if (average < t.realPrice) break;
        if (average > accumulatedFees(t.realPrice) && newTrades[TRANSACTION_TIME].realPrice > t.realPrice) {
          // COMPRO
        }
      }
    } else {

    }
  });
};

const arima = async () => {
  const tradeData = await fetchTrades(100); // newest is last
  const detrended = percentageDifference(tradeData);
  const emaArray = expMovingAvg(detrended, 60);
  const rsiArray = relStrIndex(emaArray, 60);
  const completeArr = movingAvg(rsiArray, 60);

  // este es el que me va a importar
  chart.graphToImg('MA', completeArr.map(e => e.MA));
  chart.graphToImg('REAL', completeArr.map(e => e.realPrice));
  chart.graphToImg('RSI', completeArr.map(e => e.RSI));
  chart.graphToImg('EMA', completeArr.map(e => e.EMA));
  chart.graphToImg('DET', completeArr.map(e => e.price));
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
