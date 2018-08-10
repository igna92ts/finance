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

module.exports.createTree = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    if (!event.body) throw new Error('no body');
    const params = event.body;
    if (!params.features || !params.fileName) return new Error('no features or fileName');
    const data = await aws.getData(params.fileName);
    const sample = getSample(data.length, data);
    const newTree = tree.buildTree(params.features, sample.slice(0, 100));
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({ tree: newTree })
    });
  } catch (err) {
    callback(err);
  }
};
