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
    for (let i = index; i > index - time; i--) {
      if (i < 0) break;
      temp += trades[i].price;
    }
    return {
      ...t,
      MA: temp / time
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

const arima = async () => {
  const tradeData = await fetchTrades(1000); // newest is last
  const detrended = differenceTrades(tradeData);
  const emaArray = expMovingAvg(detrended, 20);
  const completeArr = movingAvg(emaArray, 20);
  chart.graphToImg('MA', completeArr.map(e => e.MA));
  chart.graphToImg('EMA', completeArr.map(e => e.EMA));
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
  getPricesPerTimestep
};
