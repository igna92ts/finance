const jsonfile = require('jsonfile'),
    moment = require('moment'),
    fs = require('fs');

const fileDir = './networks/'
const obj = { name: 'JP' }

if (!fs.existsSync(fileDir)) {
  fs.mkdirSync(fileDir);
}

module.exports = jsonString => {
  return new Promise((resolve, reject) => {
    jsonfile.writeFile(`${fileDir}/${moment().format()}.json`, jsonString, err => {
      if(err) return reject(err);
      return resolve();
    })
  });
};