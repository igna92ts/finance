const Random = require('random-js'),
  mt = Random.engines.mt19937().autoSeed();

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
  const split = findBestSplit(features, data);
  if (split.gain === 0) {
    const proportion = calculateClassProportion(getUniqueValues('action', data), data);
    const proportionText = JSON.stringify(proportion);
    return `(newData => (${proportionText}))`;
  }
  const { matched, rest } = split;

  const matchedQuestion = buildTree(features, matched);
  const restQuestion = buildTree(features, rest);
  const { question } = split;
  return `newValue => (${question})(newValue) ? (${matchedQuestion})(newValue) : (${restQuestion})(newValue)`;
};

module.exports = { buildTree };