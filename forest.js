const Random = require('random-js'),
  mt = Random.engines.mt19937().autoSeed(),
  memoize = require('fast-memoize'),
  request = require('request'),
  logger = require('./logger');

const pickRandomElement = array => Random.pick(mt, array);
const pickRandomElements = (count, array) => {
  const elements = [];
  for (let i = 0; i < count; i++) {
    elements.push(Random.pick(mt, array));
  }
  return elements;
};
const getRandomInt = (min, max) => Random.integer(min, max)(mt);

const pickRandomFeatures = (count, array) => {
  let elements = [];
  while (elements.length !== count) {
    elements.push(Random.pick(mt, array));
    elements = Array.from(new Set(elements));
  }
  return elements;
};

const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

const retry = (fn, time) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(fn().catch(err => reject(err)));
    }, time);
  });
};

const buildTree = (features, fold, count) => {
  return new Promise((resolve, reject) => {
    request.post(
      {
        // url: 'http://localhost:3000/create_tree',
        url: 'https://www.igna92ts.com/finance/create_tree',
        json: true,
        body: {
          features,
          fileName: fold !== undefined ? `data-fold-${fold}` : 'data',
          number: count,
          fold
        }
      },
      (err, res, body) => {
        if (!body || !body.tree) {
          // 5 second timeout before retry
          logger.error({ error: err, body });
          return retry(() => buildTree(features, fold, count), 5000);
        }
        if (err) {
          logger.error(err);
          return reject(err);
        } else {
          logger.progress(`forest-${fold}`).tick(1);
          return resolve(body.tree);
        }
      }
    );
  });
};

const buildForest = (features, fold) => {
  const forestPromises = [];
  const forestSize = 512;
  logger.progress(`forest-${fold}`, forestSize, `Fold #${fold}`);
  for (let i = 0; i < forestSize; i++) {
    const rnd = pickRandomFeatures(getRandomInt(1, features.length), features);
    const tree = buildTree(rnd, fold, i);
    forestPromises.push(tree);
  }
  return Promise.all(forestPromises)
    .then(forest => {
      return forest.map(t => eval(t));
    })
    .catch(logger.error);
};

module.exports = { buildForest };
