const arima = require('../arima'),
  { sigmoid } = require('../helpers'),
  moment = require('moment');

describe('index functions', () => {
  const trades = [
    {
      time: 1526760115692,
      price: 13.2329824
    },
    {
      time: 1526760172554,
      price: 13.1673492
    },
    {
      time: 1526760491916,
      price: 13.194765599999998
    }
  ];
  describe('getPricesPerSecond', () => {
    test('creates an array with the price each second in between trades', () => {
      const pricesPerSecond = arima.getPricesPerTimestep(trades);
      expect(pricesPerSecond.length).toBe(377);
      expect(pricesPerSecond.filter(p => p.price === 13.2329824).length).toBe(57);
      expect(pricesPerSecond.filter(p => p.price === 13.1673492).length).toBe(319);
      expect(pricesPerSecond.filter(p => p.price === 13.194765599999998).length).toBe(1);
    });
  });

  describe('movingAvg', () => {
    test('calculates the moving average n timesteps in the past', () => {
      const avg = arima.movingAvg(trades, 380); // 377 es la cantidad de segundos entre trades
      expect(avg).toBe((trades[0].price + trades[1].price + trades[2].price) / 3);
    });
  });

  describe('expMovingAvg', () => {
    test('calculates exp moving average for an N range period', () => {
      const trades = [
        { price: 22.81 },
        { price: 23.09 },
        { price: 22.91 },
        { price: 23.23 },
        { price: 22.83 },
        { price: 23.05 },
        { price: 23.02 }
      ];
      const expAvg = arima.expMovingAvg(trades, 9);
      console.log(expAvg);
    });
  });
});
