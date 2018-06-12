const helpers = require('../helpers'),
  moment = require('moment');

describe('helper functions', () => {
  describe('roundTime', () => {
    test('rounds {date} parameter to the lowest duration parameter', () => {
      const roundedTime = helpers.roundTime(1526757034193, 1, 'seconds', 'floor');
      expect(roundedTime).toBe(1526757034000);
    });
    test('rounds {date} parameter to the highest duration parameter', () => {
      const roundedTime = helpers.roundTime(1526757034193, 1, 'seconds', 'ceil');
      expect(roundedTime).toBe(1526757035000);
    });
  });
  describe('diffTimes', () => {
    test('indicates the difference between 2 dates in minutes', () => {
      const initialTime = moment().valueOf();
      const nextTime = moment()
        .add(2, 'minutes')
        .valueOf();
      const timeDiff = helpers.diffTimes(nextTime, initialTime);
      expect(parseInt(timeDiff)).toBe(2);
    });
    test('return values are memoized', () => {
      const initialTime = moment().valueOf();
      const nextTime = moment()
        .add(2, 'minutes')
        .valueOf();
      const normalTimer = process.hrtime();
      const timeDiff1 = helpers.diffTimes(nextTime, initialTime);
      const normalCallTime = process.hrtime(normalTimer)[1];
      const memoTimer = process.hrtime();
      const timeDiff2 = helpers.diffTimes(nextTime, initialTime);
      const memoCallTime = process.hrtime(memoTimer)[1];

      expect(memoCallTime).toBeLessThan(normalCallTime);
      expect(timeDiff1).toEqual(timeDiff2);
    });
  });
});
