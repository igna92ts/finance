const moment = require('moment'),
  binance = require('../binance'),
  arima = require('../arima'),
  { roundTime } = require('../helpers');

const liveTest = async () => {
  const existingTrades = await arima.fetchTrades(0);
  const newTrades = [];
  const newTimestep = { volume: 0 };
  let execute = true;
  binance.watchTrades(trade => {
    newTimestep.volume += trade.volume;
    newTimestep.price = trade.price;
    newTimestep.time = trade.time;
  });
  setInterval(() => {
    const secs = new Date().getSeconds();
    if (secs === 0 && execute) {
      newTrades.push({ ...newTimestep });
      newTimestep.volume = 0;
      execute = false;
    }
    if (secs !== 0) execute = true;
  }, 100);
};

liveTest();
