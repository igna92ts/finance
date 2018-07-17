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
  if (typeof value === 'string') return e => e[key] === value;
  else return e => e[key] >= value;
};

const partition = (data, question) => {
  return data.reduce((acc, e) => {
    acc[question(e) ? 0 : 1].push(e);
    return acc;
  }, [[], []]);
};

const informationGain = (left, right, currentUncertainty) => {
  const p = left.length / (left.length + right.length);
  return currentUncertainty - p * gini(left) - (1 - p) * gini(right);
};

const gini = data => {
  const uniqueValues = getUniqueValues('action', data);
  return uniqueValues.reduce((impurity, val) => {
    const prob = data.filter(e => e.action === val).length / data.length;
    return impurity - Math.pow(prob, 2);
  }, 1);
};

const findBestSplit = data => {
  const currentUncertainty = gini(data);

  return Object.keys(data[0]).filter(e => e !== 'action').reduce((finalResult, key) => {
    const values = getUniqueValues(key, data);
    const newResult = values.reduce((result, v) => {
      const question = createQuestion(key, v);
      const [matched, rest] = partition(data, question);

      if (matched.length === 0 || rest.length === 0) return result;

      const gain = informationGain(matched, rest, currentUncertainty);

      if (gain >= result.gain) return { question, gain };
      return result;
    }, { gain: 0, question: d => d });
    if (newResult.gain >= finalResult.gain) return newResult;
    else return finalResult;
  }, { gain: 0, question: d => d });
};

const buildTree = data => {
  const split = findBestSplit(data);
  if (split.gain === 0) {
    return newData => calculateClassProportion(getUniqueValues('action', data), data);
  }
  const [matched, rest] = partition(data, split.question);

  const matchedQuestion = buildTree(matched);
  const restQuestion = buildTree(rest);
  console.log('ITERATION');
  return newValue => split.question(newValue) ? matchedQuestion(newValue) : restQuestion(newValue);
};

module.exports = {
  buildTree
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
