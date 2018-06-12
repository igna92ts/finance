const index = require('../index'),
  { sigmoid } = require('../helpers'),
  moment = require('moment');

describe('index functions', () => {
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
      const pricesPerSecond = index.getPricesPerSecond(trades);
      expect(pricesPerSecond.length).toBe(377);
      expect(pricesPerSecond.filter(p => p.price === 13.2329824).length).toBe(57);
      expect(pricesPerSecond.filter(p => p.price === 13.1673492).length).toBe(319);
      expect(pricesPerSecond.filter(p => p.price === 13.194765599999998).length).toBe(1);
    });
  });
});
