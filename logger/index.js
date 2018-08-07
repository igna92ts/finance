const winston = require('winston'),
  ProgressBar = require('progress'),
  ora = require('ora'),
  fs = require('fs'),
  logDir = `${__dirname}/logs`;

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const tsFormat = () => new Date().toLocaleTimeString();
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      name: 'complete',
      filename: `${logDir}/complete.log`,
      timestamp: tsFormat,
      json: false,
      colorize: false,
      prettyPrint: true
    }),
    new winston.transports.File({
      name: 'errors',
      filename: `${logDir}/errors.log`,
      timestamp: tsFormat,
      colorize: false,
      json: false,
      level: 'error',
      prettyPrint: true
    }),
    new winston.transports.Console({
      timestamp: tsFormat,
      colorize: false,
      prettyPrint: true
    })
  ]
});

logger.spinner = ora;

const progressBars = {};
logger.progress = (key, total, message = '') => {
  if (!progressBars[key]) {
    progressBars[key] = new ProgressBar(` ${message} [:bar] :percent :etas`, {
      complete: '=',
      incomplete: ' ',
      width: 100,
      total
    });
  }
  return {
    tick: count => progressBars[key].tick(count)
  };
};

module.exports = logger;
