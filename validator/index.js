const { chunkArray, mergeWithout } = require('../helpers'),
  rndForest = require('../forest'),
  aws = require('../amazon'),
  helpers = require('../helpers');

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

const chain = promises => {
  if (promises.length === 0) return 1;
  return promises[0]().then(() => chain(promises.slice(1)));
};

const calculateReturns = trades => {
  const money = {
    USD: 1000,
    CUR: 0
  };
  const fees = 0.001 + 0.0005; // buy/sell fees and quick sell/buy
  let previousAction = 'NOTHING';
  let buyAmount = 0.1;
  let sellAmount = 0.1;
  trades.forEach(t => {
    const overSold = t.RSI9 < 40 && (t.RSI9 < t.RSI14 && t.RSI14 < t.RSI50);
    const overBought = t.RSI9 > 60 && (t.RSI9 > t.RSI14 && t.RSI14 > t.RSI50);
    if (t.action === 'BUY' && money.USD > 0) {
      if (previousAction === 'BUY' && buyAmount <= 0.5) buyAmount += 0.1;
      else buyAmount = 0.1;
      money.CUR += (money.USD * buyAmount) / (t.realPrice + t.realPrice * fees); // I add a little to buy it fast
      money.USD -= money.USD * buyAmount;
    }
    if (t.action === 'SELL') {
      if (previousAction === 'SELL' && sellAmount <= 0.5) sellAmount += 0.1;
      else sellAmount = 0.1;
      money.USD += money.CUR * sellAmount * (t.realPrice - t.realPrice * fees);
      money.CUR -= money.CUR * sellAmount;
    }
    previousAction = t.action;
  });
  return money.USD + money.CUR * trades[trades.length - 1].realPrice;
};

const calculateMaxReturns = trades => {
  const money = {
    USD: 1000,
    CUR: 0
  };
  trades.forEach((t, index) => {
    if (trades[index + 1]) {
      if (trades[index + 1].realPrice > t.realPrice && money.USD > 0) {
        money.CUR += (money.USD * 0.1) / (t.realPrice + t.realPrice * 0.001); // I add a little to buy it fast
        money.USD -= money.USD * 0.1;
      }
      if (trades[index + 1].realPrice < t.realPrice && money.CUR > 0) {
        money.USD += money.CUR * (t.realPrice - t.realPrice * 0.001);
        money.CUR = 0;
      }
    }
  });
  return money;
};

const validate = (folds = 10, features, data) => {
  const chunked = chunkArray(data, folds);
  const promises = chunked.map((chunk, index) => {
    const trainingData = mergeWithout(index, chunked);
    return () => {
      return aws
        .uploadData(trainingData, `data-fold-${index}`)
        .then(() => rndForest.buildForest(features, index));
    };
  });
  return chain(promises).then(() => aws.uploadData(chunked, 'validation-chunks'));
};

const validateResult = async () => {
  const trees = await aws.downloadTrees();
  const groupedTrees = helpers.groupBy(trees, 'fold');
  const chunks = await aws.getData('validation-chunks');

  const comparisons = Object.keys(groupedTrees).map(fold => {
    const forest = groupedTrees[fold].map(t => t.tree);
    const results = chunks[fold].map(c => classify(forest, c));
    const compare =
      chunks[fold].reduce((sum, c, i) => {
        if (c.action === results[i]) return sum + 1;
        else return sum;
      }, 0) / chunks[fold].length;
    const expectedReturns = calculateReturns(chunks[fold]);
    const predictedReturns = calculateReturns(
      chunks[fold].map((c, index) => ({ ...c, action: results[index] }))
    );
    return { compare, predictedReturns, expectedReturns };
  });
  console.log(
    JSON.stringify(comparisons, 0, 2),
    JSON.stringify(
      {
        accuracy: comparisons.reduce((a, b) => a + b.compare, 0) / Object.keys(groupedTrees).length,
        predictedReturns: comparisons.reduce((a, b) => a + b.predictedReturns, 0) / comparisons.length,
        expectedReturns: comparisons.reduce((a, b) => a + b.expectedReturns, 0) / comparisons.length
      },
      0,
      2
    )
  );
};

module.exports = { validate, validateResult, calculateReturns, calculateMaxReturns };
