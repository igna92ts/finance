const moment = require('moment'),
  binance = require('../binance'),
  arima = require('../arima'),
  logger = require('../logger'),
  aws = require('../amazon/index'),
  rndForest = require('../forest'),
  { roundTime, FOREST_SIZE, RETRAIN_TIME } = require('../helpers');

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
  logger.progress(`production`, FOREST_SIZE, `Finished trees`);
  while (sqsResponses.length < FOREST_SIZE) {
    /* eslint-disable no-await-in-loop */
    const msgs = await aws.receiveMessage();
    if (msgs) {
      msgs.forEach(m => {
        if (!sqsResponses.some(e => e === m.number)) {
          logger.progress(`production`).tick(1);
          sqsResponses.push(m.number);
        }
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
const simulateTransaction = (action, t) => {
  const fees = 0.001 + 0.0005; // buy/sell fees and quick sell/buy
  let buyAmount = 0.1;
  let sellAmount = 0.1;
  const overSold = t.RSI9 < 40 && (t.RSI9 < t.RSI14 && t.RSI14 < t.RSI50);
  const overBought = t.RSI9 > 60 && (t.RSI9 > t.RSI14 && t.RSI14 > t.RSI50);
  if (action === 'BUY' && money.USD > 0 && overSold) {
    if (previousAction === 'BUY' && buyAmount <= 0.5) buyAmount += 0.1;
    else buyAmount = 0.1;
    money.CUR += (money.USD * buyAmount) / (t.realPrice + t.realPrice * fees); // I add a little to buy it fast
    money.USD -= money.USD * buyAmount;
  }
  if (action === 'SELL' && overBought) {
    if (previousAction === 'SELL' && sellAmount <= 0.5) sellAmount += 0.1;
    else sellAmount = 0.1;
    money.USD += money.CUR * sellAmount * (t.realPrice - t.realPrice * fees);
    money.CUR -= money.CUR * sellAmount;
  }
  previousAction = action;
  console.log(money.USD + money.CUR * t.realPrice);
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
  // set timeout is here so that it wait for the initial RETRAIN_TIME to expire before retraining
  let liveInterval = null;
  setTimeout(() => {
    clearInterval(liveInterval);
    // setInterval(async () => {
    //   // classifyTrade = await buildClassifier();
    //   console.log('SWAPPED FOREST');
    // }, RETRAIN_TIME);
  }, RETRAIN_TIME);
  liveInterval = setInterval(() => {
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
      simulateTransaction(action, currentTrades[currentTrades.length - 1]);
      newTimestep.volume = 0;
      execute = false;
    }
    if (secs !== 0) execute = true;
  }, 100);
};

liveTest();
