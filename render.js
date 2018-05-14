const plotly = require('plotly')('igna92ts', 'Bo8oB339TxAmrjQn5sBa'),
  moment = require('moment');

module.exports = (valuesArr, xValues = null) => {
  const data = valuesArr.map(arr => {
    return {
      x: xValues,
      y: arr,
      type: "scatter"
    };
  });
  
  const graphOptions = {filename: "date-axes", fileopt: "overwrite"};
  plotly.plot(data, graphOptions, (err, msg) => {
    console.log(err, msg);
  });
};
// SE PUEDE STREAMEAR, BUSCAR STREAMING API