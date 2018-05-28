const synaptic = require('synaptic'),
  chart = require('./chart'),
  jsondb = require('./jsondb'),
  moment = require('moment'),
  binance = require('./binance'),
  { diffTimes, roundTime, memoize, logit, sigmoid } = require('./helpers');

const lstmNetwork = new synaptic.Architect.LSTM(2, 2, 1);
let predictionNetwork = new synaptic.Architect.LSTM(2, 2, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const TEST_ITERATIONS = 5000;
const LIVE_ITERATIONS = 10;
const PREDICTION_TIME = 60;
const LIVE_TRAINING_SIZE = 50000;

const TIME_MS = 1000;
const TIME_CONSTRAINT = 'seconds';

const getPricesPerTimestep = historicalTrades => {
  let initialTime = roundTime(historicalTrades[0].time, 1, TIME_CONSTRAINT, 'floor');
  const pricesPerTimestep = [{
    price: historicalTrades[0].price,
    time: initialTime
  }];
  historicalTrades.forEach(t => {
    const roundedTime = roundTime(t.time, 1, TIME_CONSTRAINT, 'floor');
    const timeDifference = moment(roundedTime).diff(initialTime, TIME_CONSTRAINT);
    const latestPrice = pricesPerTimestep[pricesPerTimestep.length - 1].price;
    if (timeDifference > 1) {
      for (let i = 1; i < timeDifference; i++) {
        pricesPerTimestep.push({
          price: latestPrice,
          time: initialTime + i * TIME_MS // 1 second
        })
      }
      initialTime = roundedTime;
      pricesPerTimestep.push({
        price: t.price,
        time: roundedTime
      });
    }
  });
  return pricesPerTimestep;
};

const getTrainingSet = rows => {
  return rows.reduce((resultSet, row, index) => {
    let output = 0;
    if (rows.length > index + 1) {
      output = sigmoid(Math.log10(rows[index + 1].price)); // el precio
      const response = {
        input: [Math.sin(row.time), Math.log10(row.price)],
        output: [output]
      }
      resultSet.push(response);
      return resultSet;
    } else
      return resultSet;
  }, []);
};

const addPriceTimesteps = (pricesPerTimestep, trade) => {
  const lastPrice = pricesPerTimestep[pricesPerTimestep.length - 1];
  const roundedTime = roundTime(trade.time, 1, TIME_CONSTRAINT, 'floor');
  const timeDifference = moment(roundedTime).diff(lastPrice.time, TIME_CONSTRAINT);
  const newTimesteps = [];
  if (timeDifference > 1) {
    for (let i = 1; i < timeDifference; i++) {
      newTimesteps.push({
        price: lastPrice.price,
        time: lastPrice.time + i * TIME_MS
      });
    }
    newTimesteps.push({
      price: trade.price,
      time: roundedTime
    });
  }
  return newTimesteps;
};

const runProcess = () => {
  chart.setGraphingServer().then(sendGraphData => {
    binance.fetchTrades().then(trainingRows => {
      
      let pricesPerTimestep = getPricesPerTimestep(trainingRows);
      const trainingSet = getTrainingSet(pricesPerTimestep);
      
      trainer.train(trainingSet, {
        error: .00000000005,
      	log: 1000,
      	iterations: TEST_ITERATIONS,
      	rate: 0.03,
      	shuffle: true
      });
      binance.watchTrades(trade => {
        const newTimesteps = addPriceTimesteps(pricesPerTimestep, trade);
        
        if (newTimesteps.length > 0) {
          for (let i = 0; i < newTimesteps.length - 1; i ++) {
            if (trainingSet.length > LIVE_TRAINING_SIZE)
                trainingSet.shift();
              
            trainingSet.push({
              input: [
                Math.sin(newTimesteps[i].time),
                Math.log10(newTimesteps[i].price)
              ],
              output: [sigmoid(Math.log10(newTimesteps[i + 1].price))]
            });
          }
            
          trainer.train(trainingSet, {
            error: .00000000005,
          	iterations: LIVE_ITERATIONS,
          	log: 10,
          	rate: 0.03
          });
          
          const start = newTimesteps[newTimesteps.length - 1];
          const input = [Math.sin(start.time), Math.log10(start.price)];
          predictionNetwork = synaptic.Network.fromJSON(lstmNetwork.toJSON());
          let result = predictionNetwork.activate(input)[0];
          const predictions = [Math.pow(10, logit(result))];
          for (let i = 1; i < PREDICTION_TIME + newTimesteps.length; i++) {
            result = predictionNetwork.activate([Math.sin(start.time + TIME_MS * i), Math.log10(Math.pow(10, logit(result)))])[0]
            predictions.push(Math.pow(10, logit(result)));
          }
          
          const temp = [...pricesPerTimestep, ...newTimesteps];
          pricesPerTimestep = temp.slice(temp.length - LIVE_TRAINING_SIZE);
          sendGraphData(newTimesteps, predictions.slice(PREDICTION_TIME));
        }
      });
    });
  });
};

runProcess();

module.exports = {
  getPricesPerTimestep,
  getTrainingSet
};