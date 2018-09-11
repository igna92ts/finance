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

const classify = (forest, trade) => {
  const sum = forest.map(tree => tree(trade)).reduce(
    (res, e) => {
      const keys = Object.keys(e);
      keys.forEach(k => {
        res[k] += e[k];
      });
      return res;
    },
    { BUY: 0, NOTHING: 0, SELL: 0 }
  );
  return Object.keys(sum).reduce((t, k) => {
    if (sum[k] === Math.max(...['BUY', 'NOTHING', 'SELL'].map(e => sum[e]))) return k;
    else return t;
  });
};

const buildClassifier = async () => {
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
  return trade => classify(forest.map(t => t.tree), trade);
};

const money = {
  USD: 1000,
  CUR: 0
};
let previousAction = 'NOTHING';
const simulateTransaction = (action, realPrice) => {
  const fees = 0.001 + 0.0005; // buy/sell fees and quick sell/buy
  let buyAmount = 0.1;
  let sellAmount = 0.1;
  if (action === 'BUY' && money.USD > 0) {
    if (previousAction === 'BUY' && buyAmount <= 0.5) buyAmount += 0.1;
    else buyAmount = 0.1;
    money.CUR += (money.USD * buyAmount) / (realPrice + realPrice * fees); // I add a little to buy it fast
    money.USD -= money.USD * buyAmount;
  }
  if (action === 'SELL') {
    if (previousAction === 'SELL' && sellAmount <= 0.5) sellAmount += 0.1;
    else sellAmount = 0.1;
    money.USD += money.CUR * sellAmount * (realPrice - realPrice * fees);
    money.CUR -= money.CUR * sellAmount;
  }
  previousAction = action;
  console.log(money.USD + money.CUR * realPrice);
};

const liveTest = async () => {
  const classifyTrade = await buildClassifier();
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
      const action = classifyTrade(currentTrades[currentTrades.length - 1]);
      simulateTransaction(action, currentTrades[currentTrades.length - 1].realPrice);
      newTimestep.volume = 0;
      execute = false;
    }
    if (secs !== 0) execute = true;
  }, 100);
};

liveTest();
