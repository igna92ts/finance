const request = require('request'),
  webSocket = require('ws'),
  moment = require('moment'),
  { diffTimes } = require('../helpers');

const key = '8tc4fJ1ddM2VmnbFzTk3f7hXsrehnT8wP7u6EdIoVq7gyXWiL852TP1wnKp0qaGM';
const symbol = 'trxbtc';

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
    request.get({
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      headers: {
        'X-MBX-APIKEY': key
      },
      json: true
    }, (err, res, body) => {
      if (err) return reject(err);
      else
        resolve(parseFloat(body.price));
    });
  });
};

const formatTransaction = (transaction, btcPrice) => {
  return {
    time: transaction.T,
    price: parseFloat(transaction.p) * btcPrice,
    volume: parseFloat(transaction.q)
  };
};

exports.fetchTrades = (accumulator = [], endTime = 0) => {
  let params = '';
  if (accumulator.length > 0) {
    const startTime = moment(endTime).subtract(20, 'minutes').valueOf();
    params = `&startTime=${startTime}&endTime=${endTime}`;
  }
  return new Promise((resolve, reject) => {
    request.get({
      url: `https://api.binance.com/api/v1/aggTrades?symbol=${symbol.toUpperCase()}${params}`,
      headers: {
        'X-MBX-APIKEY': key
      },
      json: true
    }, (err, res, body) => {
      // esto es inclusivo en el ultimo, hay que sacarlo
      return resolve(exports.fetchBTCPrice().then(btcPrice => {
        const reversed = body.reverse();
        const merged = [...accumulator, ...reversed.map(t => formatTransaction(t, btcPrice))];
        if (err) return reject(err);
        else if (merged.length < 2000)
          return exports.fetchTrades(merged, reversed[reversed.length - 1].T);
        else {
          return merged.reverse();
        }
      }));
    });
  });
};
