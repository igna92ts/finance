const moment = require('moment');

const memoize = func => {
  let memo = {};
  let slice = Array.prototype.slice;

  return function() {
    let args = slice.call(arguments);

    if (args in memo)
      return memo[args];
    else
      return (memo[args] = func.apply(this, args));
  }
}

const diffTimes = memoize((finish, oldtime) => {
  return moment.duration(moment(finish).diff(moment(oldtime))).asMinutes()
});

const sigmoid = t => {
  return 1 / (1 + Math.exp(-t));
};
const logit = t => -Math.log(1 / t - 1);

const roundTime = (date, unit, amount, method) => {
  const duration = moment.duration(unit, amount);
  return moment(Math[method]((+date) / (+duration)) * (+duration)).valueOf(); 
}

module.exports = {
  memoize,
  diffTimes,
  sigmoid,
  logit,
  roundTime
};
