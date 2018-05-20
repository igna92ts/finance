const index2 = require('../index2'),
  moment = require('moment');

describe('index2 functions',() => {
  describe('round', () => {
    test('rounds {date} parameter to the lowest duration parameter', () => {
      const roundedTime = index2.round(1526757034193, 1, 'seconds', 'floor');
      expect(roundedTime.milliseconds()).toBe(0);
      expect(roundedTime.seconds()).toBe(34);
    });
    
    test('rounds {date} parameter to the highest duration parameter', () => {
      const roundedTime = index2.round(1526757034193, 1, 'seconds', 'ceil');
      expect(roundedTime.milliseconds()).toBe(0);
      expect(roundedTime.seconds()).toBe(35);
    });
  });
  
  const trades = [
    {
      time: 1526760115692,
      price: 13.2329824,
      volume: 1.6
    },
    {
      time: 1526760172554,
      price: 13.1673492,
      volume: 11.75
    },
    {
      time: 1526760491916,
      price: 13.194765599999998,
      volume: 55.83
    }
  ];
    
  describe('getPricesPerSecond', () => {
    test('creates an array with the price each second in between trades', () => {
      const pricesPerSecond = index2.getPricesPerSecond(trades);
      expect(pricesPerSecond.length).toBe(377);
      expect(pricesPerSecond.filter(p => p === 13.2329824).length).toBe(57);
      expect(pricesPerSecond.filter(p => p === 13.1673492).length).toBe(319);
      expect(pricesPerSecond.filter(p => p === 13.194765599999998).length).toBe(1);
    });
  });
  
  describe('getTrainingSet', () => {
    test('formats trade array to a suitable format for NN training', () => {
      const trainingSet = index2.getTrainingSet(trades);
      const first = trainingSet[0];
      const firstTrade = trades[0];
      expect(first.input.length).toBe(5);
      expect(first.input[0]).toBe(Math.sin(firstTrade.time));
      expect(first.input[1]).toBe(Math.log10(firstTrade.price));
      expect(first.input[2]).toBe(Math.log10(firstTrade.volume));
      expect(first.input[3]).toBe(Math.log10(index2.movingAvg(trades, 1)));
      expect(first.input[4]).toBe(Math.log10(index2.movingAvg(trades, 10)));
      expect(first.output[0]).toBe(index2.sigmoid(Math.log10(trades[1].price)));
    });
  });
  
  describe('movingAvg', () => {
    test('calculates moving average from last {avgTime} minutes', () => {
      const movingAvg1 = index2.movingAvg(trades, 1);
      expect(movingAvg1).toBe(13.194765599999998);
      const movingAvg10 = index2.movingAvg(trades, 10);
      expect(movingAvg10).toBe(13.198365733333333);
    });
    
    test('return values are memoized', () => {
      const normalTimer = process.hrtime();
      const avg1 = index2.movingAvg(trades, 10);
      const normalCallTime = process.hrtime(normalTimer)[1];
      
      const memoTimer = process.hrtime();
      const avg2 = index2.movingAvg(trades, 10);
      const memoCallTime = process.hrtime(memoTimer)[1];
      
      expect(memoCallTime).toBeLessThan(normalCallTime);
      expect(avg1).toEqual(avg2);
    });
  });
  
  describe('diffTimes', () => {
    test('indicates the difference between 2 dates in minutes', () => {
      const initialTime = moment().valueOf();
      const nextTime = moment().add(2, 'minutes').valueOf();
      const timeDiff = index2.diffTimes(nextTime, initialTime);
      expect(timeDiff).toBe(2);
    });
    
    test('return values are memoized', () => {
      const initialTime = moment().valueOf();
      const nextTime = moment().add(2, 'minutes').valueOf();
      
      const normalTimer = process.hrtime();
      const timeDiff1 = index2.diffTimes(nextTime, initialTime);
      const normalCallTime = process.hrtime(normalTimer)[1];
      
      const memoTimer = process.hrtime();
      const timeDiff2 = index2.diffTimes(nextTime, initialTime);
      const memoCallTime = process.hrtime(memoTimer)[1];

      expect(memoCallTime).toBeLessThan(normalCallTime);
      expect(timeDiff1).toEqual(timeDiff2);
    });
  });
});
