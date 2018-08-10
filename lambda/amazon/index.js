const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip();

const bucketName = 'igna92ts-finance';

AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();

const unzipFile = async data => {
  const zipData = await JSZip.loadAsync(data.Body);
  const file = await zipData.file('data.json').async('string');
  const parsedData = JSON.parse(file);
  return parsedData;
};

const getData = (fileName = 'data') => {
  const params = {
    Bucket: bucketName,
    Key: `${fileName}.zip`
  };
  return s3
    .getObject(params)
    .promise()
    .then(result => {
      return unzipFile(result);
    })
    .catch(err => {
      throw err;
    });
};

module.exports = { getData };
