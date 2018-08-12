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

const answer = {
  success: result => {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      body: JSON.stringify(result)
    };
  },
  internalServerError: msg => {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*', // Required for CORS support to work
        'Access-Control-Allow-Credentials': true // Required for cookies, authorization headers with HTTPS
      },
      body: JSON.stringify({
        statusCode: 500,
        error: 'Internal Server Error',
        internalError: JSON.stringify(msg)
      })
    };
  }
};

module.exports.createTree = (event, context, callback) => {
  try {
    if (!event.body) throw new Error('no body');
    const params = JSON.parse(event.body);
    if (!params.features || !params.fileName) return new Error('no features or fileName');
    aws.getData(params.fileName).then(data => {
      const sample = getSample(500, data);
      const newTree = tree.buildTree(params.features, sample);
      callback(null, answer.success({ tree: newTree }));
    });
  } catch (err) {
    callback(null, answer.internalServerError(err.message));
  }
};
