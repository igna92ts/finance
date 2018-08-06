const Random = require('random-js'),
  mt = Random.engines.mt19937().autoSeed(),
  memoize = require('fast-memoize'),
  request = require('request');

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

const buildTree = (features, data, fold, count) => {
  return new Promise((resolve, reject) => {
    request.post(
      {
        // url: 'http://localhost:3000/create_tree',
        url: 'https://www.igna92ts.com/finance/create_tree',
        json: true,
        body: { features, data }
      },
      (err, res, body) => {
        if (err) {
          console.log(err, body);
          return reject(err);
        } else {
          console.log(`CREATED TREE FOLD ${fold} NUMBER ${count}`);
          return resolve(body.tree);
        }
      }
    );
  });
};

const buildForest = (features, data, fold) => {
  const forestPromises = [];
  const forestSize = 128;
  for (let i = 0; i < forestSize; i++) {
    const sample = getSample(data.length, data);
    const rnd = pickRandomElements(getRandomInt(1, features.length), features);
    const tree = buildTree(rnd, sample, fold, i);
    forestPromises.push(tree);
  }
  return Promise.all(forestPromises).then(forest => {
    return forest.map(t => {
      return trade => eval(t)(trade);
    });
  });
};

module.exports = { buildForest };
