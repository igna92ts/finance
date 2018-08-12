const { chunkArray } = require('../helpers'),
  rndForest = require('../forest'),
  aws = require('../amazon');

const mergeWithout = (index, chunks) => {
  return chunks.reduce((res, chunk, i) => {
    if (i !== index) {
      return [...res, ...chunk];
    } else return res;
  }, []);
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

const chain = promises => {
  if (promises.length === 0) return 1;
  return promises[0]().then(() => chain(promises.slice(1)));
};

const validate = async (folds = 10, features, data) => {
  const chunked = chunkArray(data, folds);
  const promises = chunked.map((chunk, index) => {
    const trainingData = mergeWithout(index, chunked);
    return () => aws.uploadData(trainingData, `data-fold-${index}`);
  });
  await chain(promises);
  const comparisonPromises = chunked.map(async (chunk, index) => {
    const forest = await rndForest.buildForest(features, index);
    const results = chunk.map(c => classify(forest, c));
    const compare =
      chunk.reduce((sum, c, i) => {
        if (c.action === results[i]) return sum + 1;
        else return sum;
      }, 0) / chunk.length;
    return compare;
  });
  const comparisons = await Promise.all(comparisonPromises);
  return comparisons.reduce((a, b) => a + b, 0) / folds;
};

module.exports = { validate };
