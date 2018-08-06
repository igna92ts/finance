const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();

const uploadData = async data => {
  zip.file('data.json', JSON.stringify(data));
  const fileData = await zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true });
  const params = {
    Body: fileData,
    Bucket: 'finance',
    Key: 'data.zip',
    ACL: 'public-read'
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
    Bucket: 'finance',
    Ket: 'data.json'
  };
  return new Promise((resolve, reject) => {
    s3.getObject(params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

uploadData([{ a: 'a' }]);
