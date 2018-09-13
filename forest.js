const Random = require('random-js'),
  mt = Random.engines.mt19937().autoSeed(),
  memoize = require('fast-memoize'),
  request = require('request'),
  logger = require('./logger'),
  { FOREST_SIZE } = require('./helpers'),
  aws = require('./amazon');

const pickRandomElement = array => Random.pick(mt, array);
const pickRandomElements = (count, array) => {
  const elements = [];
  for (let i = 0; i < count; i++) {
    elements.push(Random.pick(mt, array));
  }
  return elements;
};
const getRandomInt = (min, max) => Random.integer(min, max)(mt);

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
  return aws
    .sendMessage({
      features,
      fileName: fold !== undefined ? `data-fold-${fold}` : 'data',
      number: count,
      fold
    })
    .then(() => logger.progress(`forest-${fold}`).tick(1))
    .catch(err => logger.error(err));
};

const buildForest = (features, fold) => {
  const forestPromises = [];
  const forestSize = FOREST_SIZE;
  logger.progress(`forest-${fold}`, forestSize, `Fold #${fold}`);
  for (let i = 0; i < forestSize; i++) {
    const tree = buildTree(features, fold, i);
    forestPromises.push(tree);
  }
  return Promise.all(forestPromises).catch(logger.error);
};

module.exports = { buildForest };
