'use strict';

const tree = require('./tree');

module.exports.createTree = (event, context, callback) => {
  if (!event.body) return callback(new Error('no body'));
  try {
    const params = event.body;
    if (!params.features || !params.data) return callback(new Error('no features or data'));
    const newTree = tree.buildTree(params.features, params.data);
    const response = { body: JSON.stringify({ tree: newTree }) };
    callback(null, response);
  } catch (err) {
    callback(err);
  }
};
