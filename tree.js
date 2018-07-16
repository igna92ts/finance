exports.calculateClassProportion = (classArray, data) => {
  return classArray.reduce((t, e) => {
    const filteredData = data.filter(d => d.action === e);
    return { ...t, [e]: filteredData.length / data.length };
  }, {});
};

const getUniqueValues = (key, data) => {
  return Array.from(new Set(data.map(e => e[key])));
};

const createQuestion = (key, value) => {
  return e => e[key] >= value;
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
  return Object.keys(data[0]).reduce((impurity, key) => {
    const prob = getUniqueValues(key, data).length / data.length;
    return impurity - Math.pow(prob, 2);
  }, 1);
};

const findBestSplit = data => {
  const currentUncertainty = gini(data);

  return Object.keys(data[0]).reduce((finalResult, key) => {
    const values = getUniqueValues(key, data);
    const newResult = values.reduce((result, v) => {
      const question = createQuestion(key, v);
      const [matched, rest] = partition(data, question);

      if (matched.length === 0 || rest.length === 0) return result;

      const gain = informationGain(matched, rest, currentUncertainty);

      if (gain > result.gain) {
        return { question, gain };
      }
      return result;
    }, { gain: 0 });
    if (newResult.gain > finalResult.gain) return newResult;
    else return finalResult;
  }, { gain: 0 });
};
