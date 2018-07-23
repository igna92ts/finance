const moment = require('moment');

const memoize = func => {
  const memo = {};
  const { slice } = Array.prototype;

  return function() {
    const args = slice.call(arguments);

    if (args in memo) return memo[args];
    else {
      memo[args] = func.apply(this, args);
      return memo[args];
    }
  };
};

const diffTimes = memoize((finish, oldtime) => {
  return moment.duration(moment(finish).diff(moment(oldtime))).asMinutes();
});

const sigmoid = t => {
  return 1 / (1 + Math.exp(-t));
};
const logit = t => -Math.log(1 / t - 1);

const roundTime = (date, unit, amount, method) => {
  const duration = moment.duration(unit, amount);
  return moment(Math[method](+date / +duration) * +duration).valueOf();
};
const chunkArray = (myArray, folds) => {
  const chunkSize = myArray.length / folds;
  const arrayLength = myArray.length;
  const tempArray = [];
  for (let index = 0; index < arrayLength; index += chunkSize) {
    const myChunk = myArray.slice(index, index + chunkSize);
    // Do something if you want with the group
    tempArray.push(myChunk);
  }
  return tempArray;
};

const pipe = (initial, ...foos) => {
  return foos.reduce((result, f) => {
    return f[0](result, ...f.slice(1));
  }, initial);
};

module.exports = {
  chunkArray,
  pipe,
  memoize,
  diffTimes,
  sigmoid,
  logit,
  roundTime
};
