const binance = require('./binance'),
  moment = require('moment'),
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

const fetchTrades = async () => {
  const historicalTrades = await binance.fetchTrades();
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

const logTransform = trades => {
  return trades.map(t => {
    return {
      price: Math.log10(t.price),
      time: t.time
    };
  });
};

const exponentialSmooth = (currentY, lastPrediction) => {
  // Yt-1
  const alpha = 0.5;
  const newPrediction = alpha * currentY + (1 - alpha) * lastPrediction;
};

const arima = async () => {
  const tradeData = await fetchTrades();
  const L1 = tradeData[0].price;
  const Y1 = tradeData[0].price;
  const Y2 = tradeData[1].price;
  const L2 = exponentialSmooth(Y2, L1); // Y3 predecido
};
