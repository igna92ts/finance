const http = require('http'),
  socketio = require('socket.io'),
  fs = require('fs'),
  plotly = require('plotly')('igna92ts', 'Bo8oB339TxAmrjQn5sBa');


exports.setGraphingServer = () => {
  return new Promise((resolve, reject) => {
    const app = http.createServer(handler)
    app.listen(8080);
    const io = socketio(app);

    function handler (req, res) {
      fs.readFile(__dirname + '/index.html', (err, data) => {
        if (err) {
          res.writeHead(500);
          return res.end('Error loading index.html');
        }
    
        res.writeHead(200);
        res.end(data);
      });
    }
    return resolve((realPrices, predictedPrices, WTF) => {
      io.emit('data', {
        realPrices,
        predictedPrices,
        WTF
      });
    });
  });
};

exports.graphToImg = (label, ...variadicTraces) => {
  const traces = variadicTraces.map(rows => ({
    y: rows.map(r => r.price),
    x: rows.map((r, i) => i),
    type: 'scatter'
  }));
  const figure = { data: traces };
  const imgOptions = {
    format: 'png',
    width: 1000,
    height: 500
  };
  plotly.getImage(figure, imgOptions, (error, imageStream) => {
    if (error) console.log(error);
    const fileStream = fs.createWriteStream(`plot${label || Date.now()}.png`);
    imageStream.pipe(fileStream);
  });
};
