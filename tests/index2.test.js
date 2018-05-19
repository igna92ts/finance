const index2 = require('../index2');

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
  
  describe('getPricesPerSecond', () => {
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
    describe('creates an array with the price each second in between trades', () => {
      const pricesPerSecond = index2.getPricesPerSecond(trades);
      expect(pricesPerSecond.length).toBe(377);
    });
  });
});
