const http = require('http'),
  socketio = require('socket.io'),
  fs = require('fs');

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
    return resolve((realPrices, predictedPrices) => {
      io.emit('data', {
        realPrices,
        predictedPrices
      });
    });
  });
};
