const fs = require('fs'),
  csv = require('fast-csv');
const stream = fs.createReadStream("testReduces.csv");
  
exports.readCsv = () => {
  return new Promise((resolve, reject) => {
    const rows = [];
    csv
      .fromStream(stream, { ignoreEmpty: true })
      .on('data', data => {
        rows.push(data);
      })
      .on('end', () => {
        return resolve(rows);
      })
      .on('error', err => {
        return reject(err);
      });
  });
};
