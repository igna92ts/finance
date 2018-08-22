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
  trades.forEach(t => {
    if (t.action === 'BUY' && money.USD > 0) {
      money.CUR += (money.USD * 0.1) / (t.realPrice + t.realPrice * 0.001); // I add a little to buy it fast
      money.USD -= money.USD * 0.1;
    }
    if (t.action === 'SELL') {
      money.USD += money.CUR * (t.realPrice - t.realPrice * 0.001);
      money.CUR = 0;
    }
  });
  return money;
};

const calculateMaxReturns = trades => {
  const money = {
    USD: 1000,
    CUR: 0
  };
  trades.forEach((t, index) => {
    if (trades[index + 1]) {
      if (trades[index + 1].realPrice > t.realPrice && money.USD > 0) {
        money.CUR = money.USD / t.realPrice;
        money.USD = 0;
      }
      if (trades[index + 1].realPrice < t.realPrice && money.CUR > 0) {
        money.USD = money.CUR * t.realPrice;
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
  const originalData = await aws.getData();
  const maxReturns = await calculateMaxReturns(originalData);
  const expectedReturns = await calculateReturns(originalData);

  const comparisons = Object.keys(groupedTrees).map(fold => {
    const forest = groupedTrees[fold].map(t => t.tree);
    const results = chunks[fold].map(c => classify(forest, c));
    const compare =
      chunks[fold].reduce((sum, c, i) => {
        if (c.action === results[i]) return sum + 1;
        else return sum;
      }, 0) / chunks[fold].length;
    return compare;
  });
  console.log(JSON.stringify(comparisons, 0, 2));
  return comparisons.reduce((a, b) => a + b, 0) / Object.keys(groupedTrees).length;
};

module.exports = { validate, validateResult };
