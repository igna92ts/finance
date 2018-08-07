const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip();

require('dotenv').config();

const bucketName = 'igna92ts-finance';

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();

const uploadData = async data => {
  zip.file('data.json', JSON.stringify(data));
  const fileData = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9
    }
  });
  const buffer = Buffer.from(fileData, 'uint8array');
  const params = {
    Body: buffer,
    Bucket: bucketName,
    Key: 'data.zip'
  };
  return new Promise((resolve, reject) => {
    s3.putObject(params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

const getData = () => {
  const params = {
    Bucket: bucketName,
    Key: 'data.zip'
  };
  return new Promise((resolve, reject) => {
    s3.getObject(params, async (err, result) => {
      if (err) return reject(err);
      else {
        const zipData = await JSZip.loadAsync(result.Body);
        const file = await zipData.file('data.json').async('string');
        return resolve(JSON.parse(file));
      }
    });
  });
};

module.exports = {
  getData,
  uploadData
};
