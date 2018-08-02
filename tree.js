const Random = require('random-js'),
  napa = require('napajs'),
  zone = napa.zone.create('zone', { workers: 20 }),
  mt = Random.engines.mt19937().autoSeed(),
  memoize = require('fast-memoize'),
  { profile } = require('./helpers');

const pickRandomElement = array => Random.pick(mt, array);
const pickRandomElements = (count, array) => {
  const elements = [];
  for (let i = 0; i < count; i++) {
    elements.push(Random.pick(mt, array));
  }
  return elements;
};
const getRandomInt = (min, max) => Random.integer(min, max)(mt);

const calculateClassProportion = (classArray, data) => {
  return classArray.reduce((t, e) => {
    const filteredData = data.filter(d => d.action === e);
    return { ...t, [e]: filteredData.length / data.length };
  }, {});
};

const getUniqueValues = (key, data) => {
  return Array.from(new Set(data.map(e => e[key])));
};

const createQuestion = (key, value) => {
  if (typeof value === 'string') return `e => e['${key}'] === ${value}`;
  else return `e => e['${key}'] >= ${value}`;
};

const partition = (data, question) => {
  return data.reduce(
    (acc, e) => {
      acc[(eval(question))(e) ? 0 : 1].push(e);
      return acc;
    },
    [[], []]
  );
};

const gini = data => {
  // const uniqueValues = getUniqueValues('action', data);
  const uniqueValues = ['NOTHING', 'SELL', 'BUY'].reduce(
    (res, e) => (data.some(d => d.action === e) ? [...res, e] : res),
    []
  );
  return uniqueValues.reduce((impurity, val) => {
    const prob = data.filter(e => e.action === val).length / data.length;
    return impurity - prob ** 2; // Math.pow(prob, 2);
  }, 1);
};

const informationGain = (left, right, currentUncertainty) => {
  const p = left.length / (left.length + right.length);
  return currentUncertainty - p * gini(left) - (1 - p) * gini(right);
};

const findBestSplit = (features, data) => {
  const currentUncertainty = gini(data);
  let matched = [];
  let rest = [];

  return features.reduce(
    (finalResult, key) => {
      const values = getUniqueValues(key, data);
      const newResult = values.reduce(
        (result, v) => {
          // EL PROBLEMA ESTA EN ESTE
          const question = createQuestion(key, v);
          [matched, rest] = partition(data, question);

          if (matched.length === 0 || rest.length === 0) return result;

          const gain = informationGain(matched, rest, currentUncertainty);

          if (gain >= result.gain) return { question, gain, matched, rest };
          return result;
        },
        { gain: 0, question: d => d }
      );
      if (newResult.gain >= finalResult.gain) return newResult;
      else return finalResult;
    },
    { gain: 0, question: d => d, matched, rest }
  );
};

const buildTree = (features, data) => {
  console.log('NEW ONE', new Date());
  const split = findBestSplit(features, data);
  if (split.gain === 0) {
    return calculateClassProportion(getUniqueValues('action', data), data);
  }
  const { matched, rest } = split;

  const matchedQuestion = buildTree(features, matched);
  const restQuestion = buildTree(features, rest);
  const { question } = split;
  return `newValue => ((${question})(newValue) ? (${matchedQuestion})(newValue) : (${restQuestion})(newValue))`;
};

const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

const parallelTree = async (features, data) => {
  try {
    const zone = global.napa.zone.get('zone');
    const sample = await zone.execute('', 'getSample', [data.length, data]);
    const randomInt = await zone.execute('', 'getRandomInt', [1, features.length]);
    const rnd = await zone.execute('', 'pickRandomElements', [randomInt.value, features]);
    const tree = await zone.execute('', 'buildTree', [rnd.value, sample.value]);
    return tree.value;
  } catch (err) {
    console.log('parallelTree', err);
  }
};

zone.broadcast(`
  var Random = require('random-js');
  var napa = require('napajs');
  var mt = Random.engines.mt19937().autoSeed();
`);
zone.broadcast(`var ${getSample.name} = ${getSample.toString()};`);
zone.broadcast(`var ${pickRandomElement.name} = ${pickRandomElement.toString()};`);
zone.broadcast(`var ${pickRandomElements.name} = ${pickRandomElements.toString()};`);
zone.broadcast(`var ${getRandomInt.name} = ${getRandomInt.toString()};`);
zone.broadcast(`var ${buildTree.name} = ${buildTree.toString()};`);
zone.broadcast(`var ${findBestSplit.name} = ${findBestSplit.toString()};`);
zone.broadcast(`var ${gini.name} = ${gini.toString()};`);
zone.broadcast(`var ${informationGain.name} = ${informationGain.toString()};`);
zone.broadcast(`var ${getUniqueValues.name} = ${getUniqueValues.toString()};`);
zone.broadcast(`var ${createQuestion.name} = ${createQuestion.toString()};`);
zone.broadcast(`var ${partition.name} = ${partition.toString()};`);
zone.broadcast(`var ${calculateClassProportion.name} = ${calculateClassProportion.toString()};`);
const buildForest = async (features, data) => {
  const forestPromises = [];
  const forestSize = 120;
  for (let i = 0; i < forestSize; i++) {
    forestPromises.push(zone.execute(parallelTree, [[...features], [...data]]));
  }
  return Promise.all(forestPromises).then(results => results.map(r => r.value));
};
// buildForest(['color', 'diameter'], [
//   { color: 'green', diameter: 3, action: 'apple' },
//   { color: 'yellow', diameter: 3, action: 'apple' },
//   { color: 'red', diameter: 1, action: 'grape' },
//   { color: 'red', diameter: 1, action: 'grape' },
//   { color: 'yellow', diameter: 3, action: 'lemon' }
// ]);

module.exports = {
  buildTree,
  buildForest
};
// const tree = buildTree([
//   { color: 'green', diameter: 3, action: 'apple' },
//   { color: 'yellow', diameter: 3, action: 'apple' },
//   { color: 'red', diameter: 1, action: 'grape' },
//   { color: 'red', diameter: 1, action: 'grape' },
//   { color: 'yellow', diameter: 3, action: 'lemon' },
// ]);
// const result = tree({ color: 'red', diameter: 1 });
// const result2 = tree({ color: 'yellow', diameter: 3 });
// const result3 = tree({ color: 'yellow', diameter: 1 });
// console.log(result, result);
