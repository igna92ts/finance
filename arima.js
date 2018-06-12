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

const expMovingAvg = (trades, timeStepRange) => {
  const k = 2 / (timeStepRange + 1);

};

const arima = async () => {
  const tradeData = await fetchTrades(100); // newest is last
  const detrended = differenceTrades(tradeData);
  chart.graphToImg(tradeData);
  chart.graphToImg(detrended);
};

try {
  arima();
} catch (err) {
  console.log(err);
}

module.exports = {
  percentageDifference,
  movingAvg,
  getPricesPerTimestep
};
