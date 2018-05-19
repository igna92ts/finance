const plotly = require('plotly')('igna92ts', 'Bo8oB339TxAmrjQn5sBa'),
  moment = require('moment');

module.exports = (time, realPrice, predictedPrice) => {
  const trace1 = {
    x: [time],
    y: [realPrice],
    type: "scatter"
  };
  const trace2 = {
    x: [time],
    y: [predictedPrice],
    type: "scatter"
  };
  const data = [trace1, trace2];
  const graphOptions = {filename: "real-feed-price", fileopt: "extend"};
  plotly.plot(data, graphOptions, (err, msg) => {
    if (err)
      console.log(err);
  });
};
// SE PUEDE STREAMEAR, BUSCAR STREAMING API