const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip(),
  logger = require('../logger');

require('dotenv').config();

const bucketName = 'igna92ts-finance';

AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();

const zipFile = async data => {
  const spinner = logger.spinner('Compressing data').start();
  zip.file('data.json', JSON.stringify(data));
  const fileData = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });
  const buffer = Buffer.from(fileData, 'uint8array');
  spinner.succeed();
  return buffer;
};

const unzipFile = async data => {
  const spinner = logger.spinner('Uncompressing data').start();
  const zipData = await JSZip.loadAsync(data.Body);
  const file = await zipData.file('data.json').async('string');
  const parsedData = JSON.parse(file);
  spinner.succeed();
  return parsedData;
};

const uploadData = async (data, fileName = 'data') => {
  const body = await zipFile(data);
  const params = {
    Body: body,
    Bucket: bucketName,
    Key: `${fileName}.zip`
  };
  const spinner = logger.spinner('Uploading zip file').start();
  return new Promise((resolve, reject) => {
    s3.putObject(params, (err, result) => {
      if (err) return reject(err);
      else {
        spinner.succeed();
        return resolve(result);
      }
    });
  });
};

const getData = (fileName = 'data') => {
  const params = {
    Bucket: bucketName,
    Key: `${fileName}.zip`
  };
  const spinner = logger.spinner('Downloading zip file').start();
  return new Promise((resolve, reject) => {
    s3.getObject(params, async (err, result) => {
      spinner.succeed();
      if (err) return resolve([]);
      else {
        return resolve(unzipFile(result));
      }
    });
  });
};

module.exports = {
  getData,
  uploadData
};
