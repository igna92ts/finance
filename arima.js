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
  const initialTime = trades[trades.length - 1].time;
  const temp = trades.filter(t => moment(initialTime).diff(t.time, TIME_CONSTRAINT) < time);
  return temp.reduce((res, t) => res + t.price, 0) / temp.length;
};

const expMovingAvg = (mArray, mRange) => {
  const k = 2/(mRange + 1);
  // first item is just the same as the first item in the input
  emaArray = [mArray[0]];
  // for the rest of the items, they are computed with the previous one
  for (let i = 1; i < mArray.length; i++) {
    emaArray.push({
      price: mArray[i].price * k + emaArray[i - 1].price * (1 - k),
      time: mArray[i].time
    });
  }
  return emaArray;
};

const arima = async () => {
  const tradeData = await fetchTrades(1000); // newest is last
  const detrended = differenceTrades(tradeData);

  chart.graphToImg('NORMAL', detrended);
  chart.graphToImg('MA', detrended.map((t, i) => ({
    price: movingAvg(detrended.slice(0, i + 1), 20),
    time: t.time
  })));
  chart.graphToImg('EMA', expMovingAvg(detrended, 20));
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
