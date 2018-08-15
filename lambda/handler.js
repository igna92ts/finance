'use strict';

const Random = require('random-js'),
  tree = require('./tree'),
  aws = require('./amazon'),
  mt = Random.engines.mt19937().autoSeed();

const pickRandomElement = array => Random.pick(mt, array);
const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

const SAMPLE_SIZE = 2000;
module.exports.createTree = (event, context, callback) => {
  if (!event.Records) return console.error('No Records in event');
  const params = JSON.parse(event.Records[0].body);
  if (!params.features || !params.fileName || params.number === undefined || params.fold === undefined) {
    console.error('no features or fileName or fold or number');
  }
  return aws
    .getData(params.fileName)
    .then(data => {
      const sample = getSample(SAMPLE_SIZE, data);
      const newTree = tree.buildTree(params.features, sample);
      return aws.uploadTree({ tree: newTree, number: params.number, fold: params.fold });
    })
    .catch(console.error);
};
