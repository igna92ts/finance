const request = require('request'),
  webSocket = require('ws'),
  moment = require('moment'),
  { diffTimes } = require('../helpers'),
  logger = require('../logger');

const key = '8tc4fJ1ddM2VmnbFzTk3f7hXsrehnT8wP7u6EdIoVq7gyXWiL852TP1wnKp0qaGM';
const symbol = 'enjbtc';

// let BTCPRICE = 0;
// const ws = new webSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
// ws.on('open', () => {
//   console.log('opened');
// });
// ws.on('message', data => {
//   BTCPRICE = parseFloat(JSON.parse(data)['b']);
// });

exports.watchTrades = callback => {
  exports.fetchBTCPrice().then(btcPrice => {
    const tradesWs = new webSocket(`wss://stream.binance.com:9443/ws/${symbol}@aggTrade`);
    const btcPriceWs = new webSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    btcPriceWs.on('open', () => {
      console.log('opened connection to btc price ticker');
    });
    btcPriceWs.on('message', data => {
      btcPrice = parseFloat(JSON.parse(data)['b']);
    });
    tradesWs.on('open', () => {
      console.log('opened connection to trade ticker');
    });
    tradesWs.on('message', data => {
      const trade = JSON.parse(data);
      const parsedTrade = {
        time: trade.T,
        price: parseFloat(trade.p) * btcPrice,
        volume: parseFloat(trade.q)
      };
      callback(parsedTrade);
    });
  });
};

exports.fetchBTCPrice = () => {
  return new Promise((resolve, reject) => {
    request.get(
      {
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        headers: {
          'X-MBX-APIKEY': key
        },
        json: true
      },
      (err, res, body) => {
        if (err) return reject(err);
        else return resolve(parseFloat(body.price));
      }
    );
  });
};

const formatTransaction = (transaction, btcPrice) => {
  return {
    time: transaction.T,
    price: parseFloat(transaction.p) * btcPrice,
    volume: parseFloat(transaction.q)
  };
};

const getParams = (accumulator, endTime) => {
  let params = '';
  if (accumulator.length > 0) {
    const startTime = moment(endTime)
      .subtract(20, 'minutes')
      .valueOf();
    params = `&startTime=${startTime}&endTime=${endTime}`;
  }
  return params;
};

exports.fetchTrades = (amount, accumulator = [], endTime = 0) => {
  logger.progress('trades', amount, 'Fetching Transactions');
  const params = getParams(accumulator, endTime);
  return new Promise((resolve, reject) => {
    request.get(
      {
        url: `https://api.binance.com/api/v1/aggTrades?symbol=${symbol.toUpperCase()}${params}`,
        headers: {
          'X-MBX-APIKEY': key
        },
        json: true
      },
      (err, res, body) => {
        // cambiar por ultimas 24 horas
        return resolve(
          exports.fetchBTCPrice().then(btcPrice => {
            const reversed = body.reverse();
            const merged = [...accumulator, ...reversed.map(t => formatTransaction(t, btcPrice))];
            const start = merged[0].time;
            const end = merged[merged.length - 1].time;
            const difference = moment.duration(moment(start).diff(moment(end))).asMinutes();
            logger.progress('trades').tick(difference - logger.progress('trades').curr());
            if (err) return reject(err);
            else if (difference < amount)
              return exports.fetchTrades(amount, merged, reversed[reversed.length - 1].T);
            else {
              return merged.reverse();
            }
          })
        );
      }
    );
  });
};

exports.fillTransactions = (finishTime, accumulator = [], endTime = 0) => {
  const params = getParams(accumulator, endTime);
  return new Promise((resolve, reject) => {
    request.get(
      {
        url: `https://api.binance.com/api/v1/aggTrades?symbol=${symbol.toUpperCase()}${params}`,
        headers: {
          'X-MBX-APIKEY': key
        },
        json: true
      },
      (err, res, body) => {
        // cambiar por ultimas 24 horas
        return resolve(
          exports.fetchBTCPrice().then(btcPrice => {
            const reversed = body.reverse();
            const merged = [...accumulator, ...reversed.map(t => formatTransaction(t, btcPrice))];
            if (err) return reject(err);
            else if (merged[merged.length - 1].time > finishTime)
              return exports.fillTransactions(finishTime, merged, reversed[reversed.length - 1].T);
            else {
              return merged.reverse();
            }
          })
        );
      }
    );
  });
};
