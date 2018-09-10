const moment = require('moment'),
  binance = require('../binance'),
  arima = require('../arima'),
  aws = require('../amazon/index'),
  rndForest = require('../forest'),
  { roundTime } = require('../helpers');

const timeout = () => {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), 100);
  });
};

const buildForest = async () => {
  const tradeData = await arima.fetchTrades();
  const { data, features } = arima.calculateFeatures(tradeData);
  const trainData = arima.expectedAction(data);
  await aws.uploadData(trainData.slice(-10080), `data-fold-production`);
  await rndForest.buildForest(features, 'production');
  const sqsResponses = [];
  while (sqsResponses.length < 1024) {
    /* eslint-disable no-await-in-loop */
    const msgs = await aws.receiveMessage();
    if (msgs) {
      msgs.forEach(m => {
        if (!sqsResponses.some(e => e === m.number)) sqsResponses.push(m.number);
      });
    } else await timeout();
  }
  const forest = await aws.downloadProdForest();
  console.log(forest);
};

const liveTest = async () => {
  let currentTrades = await arima.fetchTrades();
  const lastTrade = currentTrades[currentTrades.length - 1];
  const newTimestep = { volume: 0, price: lastTrade.realPrice, time: lastTrade.time };
  let execute = true;
  binance.watchTrades(trade => {
    newTimestep.volume += trade.volume;
    newTimestep.price = trade.price;
    newTimestep.time = trade.time;
  });
  setInterval(() => {
    const secs = new Date().getSeconds();
    if (secs === 0 && execute) {
      if (newTimestep.time < currentTrades[currentTrades.length - 1].time + 60000) {
        newTimestep.time += 60000;
        newTimestep.volume = 0;
      }
      const pricesPerTimestep = arima.getPricesPerTimestep([newTimestep]);
      currentTrades = [...currentTrades, ...pricesPerTimestep];
      currentTrades = arima.calculateFeatures(currentTrades).data.slice(-10080); // doesnt calculate expectedAction
      console.log(JSON.stringify(currentTrades[currentTrades.length - 1], 0, 2));
      newTimestep.volume = 0;
      execute = false;
    }
    if (secs !== 0) execute = true;
  }, 100);
};

buildForest();
