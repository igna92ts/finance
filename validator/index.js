const { chunkArray } = require('../helpers'),
  rndForest = require('../tree');

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

const validate = async (folds = 10, features, data) => {
  console.time('testing');
  const chunked = chunkArray(data, folds);
  const comparisonPromises = chunked.map(async (chunk, index) => {
    const trainingData = mergeWithout(index, chunked);
    const forest = await rndForest.buildForest(features, trainingData, index);
    const results = chunk.map(c => classify(forest, c));
    const compare =
      chunk.reduce((sum, c, i) => {
        if (c.action === results[i]) return sum + 1;
        else return sum;
      }, 0) / chunk.length;
    return compare;
  });
  console.timeEnd('testing');
  const comparisons = await Promise.all(comparisonPromises);
  return comparisons.reduce((a, b) => a + b, 0) / folds;
};

module.exports = { validate };
