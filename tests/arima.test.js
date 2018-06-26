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

  const averagingTrades = [
    { price: 22.81 },
    { price: 23.09 },
    { price: 22.91 },
    { price: 23.23 },
    { price: 22.83 },
    { price: 23.05 },
    { price: 23.02 },
    { price: 23.29 },
    { price: 23.41 },
    { price: 23.49 }
  ];

  describe('movingAvg', () => {
    test('calculates the moving average n timesteps in the past', () => {
      const avg = arima.movingAvg(averagingTrades, 9);
      expect(avg[avg.length - 1].MA).toBe(23.14666666666666);
    });
  });

  describe('expMovingAvg', () => {
    test('calculates exp moving average for an N range period', () => {
      const expAvg = arima.expMovingAvg(averagingTrades, 9);
      expect(expAvg[expAvg.length - 1].EMA).toBe(23.18152516096);
    });
  });

  describe('relStrIndex', () => {
    test('calculates rel str index for an N range period', () => {
      const trades = [
        { realPrice: 44.34 },
        { realPrice: 44.09 },
        { realPrice: 44.15 },
        { realPrice: 43.61 },
        { realPrice: 44.33 },
        { realPrice: 44.83 },
        { realPrice: 45.10 },
        { realPrice: 45.42 },
        { realPrice: 45.84 },
        { realPrice: 46.08 },
        { realPrice: 45.89 },
        { realPrice: 46.03 },
        { realPrice: 45.61 },
        { realPrice: 46.28 },
        { realPrice: 46.00 },
        { realPrice: 46.03 },
        { realPrice: 46.41 },
        { realPrice: 46.22 },
        { realPrice: 45.64 },
        { realPrice: 46.21 },
      ];
      const rsiArray = arima.relStrIndex(trades, 14);
    });
  });
});
