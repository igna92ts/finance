'use strict';

const tree = require('./tree'),
  Random = require('random-js'),
  aws = require('../amazon'),
  mt = Random.engines.mt19937().autoSeed();

const pickRandomElement = array => Random.pick(mt, array);
const getSample = (size, data) => {
  const sample = [];
  for (let i = 0; i < size; i++) {
    sample.push(pickRandomElement(data));
  }
  return sample;
};

module.exports.createTree = (event, context, callback) => {
  if (!event.body) return callback(new Error('no body'));
  try {
    const params = event.body;
    if (!params.features || !params.fileName) return callback(new Error('no features or fileName'));
    aws.getData(params.fileName).then(data => {
      const sample = getSample(data.length, data);
      const newTree = tree.buildTree(params.features, sample);
      const response = { body: JSON.stringify({ tree: newTree }) };
      callback(null, response);
    });
  } catch (err) {
    callback(err);
  }
};
