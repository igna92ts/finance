const synaptic = require('synaptic'),
  graph = require('./render'),
  csvReader = require('./csv_reader'),
  moment = require('moment');

const lstmNetwork = new synaptic.Architect.LSTM(3, 6, 6, 1);
const trainer = new synaptic.Trainer(lstmNetwork);

const sigmoid = t => {
  return 1 / (1 + Math.exp(-t));
};

// for(let i = 0; i < 2000; i++) {
//     trainingSet.push({
//       input: [Math.sin(i)],
//       output: [sigmoid(Math.sin(i + .1))]
//     })
//   }

// const a = trainer.train(trainingSet, {
//   error: .0002,
// 	log: 100,
// 	iterations: 20000,
// 	// shuffle: true,
// 	rate: 0.1
// });
// const values = trainingSet.map(e => lstmNetwork.activate([e.input[0]])[0] * 100);
// const values = [];
// for (let i = 0; i < 10000; i ++) {
//   values.push(lstmNetwork.activate([Math.sin(i + 40)])[0] * 100)
// }
// graph([values]);
csvReader.readCsv().then(rows => {
  // graph([btcPrice], x);
  const trainRows = rows.slice(0, rows.length / 2);
  const testRows = rows.slice(rows.length / 2);
  const x = testRows.map(r => moment.unix(parseInt(r[0])).format("YYYY-MM-DD HH:mm"));
  
  const trainingSet = trainRows.map((row, index) => {
    let output = 0;
    if (trainRows[index + 1])
      output = parseFloat(trainRows[index + 1][1]) / 1000; // el precio
    else
      output = parseFloat(row[1]) / 1000;
    return {
      input: [Math.sin(parseFloat(row[0])), parseFloat(row[1] / 1000), parseFloat(row[2]) / 1000],
      output: [output]
    }
  });
  trainer.train(trainingSet, {
    error: .0000005,
  	log: 100,
  	iterations: 1000,
  	// shuffle: true,
  	rate: 0.003
  });
  const values = testRows.map(row => {
    return lstmNetwork.activate([Math.sin(parseFloat(row[0])), parseFloat(row[1] / 1000), parseFloat(row[2]) / 1000])[0] * 1000;
  });
  const btcPrice = testRows.map(r => r[1]);
  graph([values, btcPrice], x);
});