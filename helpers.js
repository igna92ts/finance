const moment = require('moment'),
  logger = require('./logger');

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
    const spinner = logger.spinner(`${f[0].name} ${f[1] || ''}`).start();
    const newResult = f[0](result, ...f.slice(1));
    spinner.succeed();
    return newResult;
  }, initial);
};

const tracking = {};
const profile = (foo, note) => {
  return (...params) => {
    const start = process.hrtime();
    const result = foo(...params);
    const precision = 3; // 3 decimal places
    const elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
    if (tracking[note]) {
      tracking[note].totalS += process.hrtime(start)[0];
      tracking[note].elapsed += elapsed;
      tracking[note].count++;
    } else {
      tracking[note] = {
        totalS: process.hrtime(start)[0],
        elapsed,
        count: 1
      };
    }
    console.clear();
    Object.keys(tracking).forEach(k => {
      console.log(
        `${tracking[k].totalS / tracking[k].count}s, ${(tracking[k].elapsed / tracking[k].count).toFixed(
          precision
        )}ms - ${k}`
      ); // print message + time
    });
    return result;
  };
};

module.exports = {
  profile,
  chunkArray,
  pipe,
  memoize,
  diffTimes,
  sigmoid,
  logit,
  roundTime
};
