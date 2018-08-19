const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip(),
  logger = require('../logger');

require('dotenv').config();

const bucketName = 'igna92ts-finance';

if (!process.env.AWS_KEY || !process.env.AWS_SECRET) throw new Error('No Aws Credentials');
AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();
const sqs = new AWS.SQS();

const zipFile = async data => {
  const spinner = logger.spinner('Compressing Data').start();
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

const sendMessage = payload => {
  return sqs
    .sendMessage({
      MessageBody: JSON.stringify(payload),
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/534322619540/finance-training'
    })
    .promise();
};

const getTreeObjectKeys = async continuationToken => {
  const params = {
    Bucket: bucketName,
    Prefix: 'trees/'
  };
  if (continuationToken) params.ContinuationToken = continuationToken;
  const data = await s3.listObjectsV2(params).promise();
  if (data.IsTruncated) {
    const otherData = await getTreeObjectKeys(data.NextContinuationToken);
    return [...data.Contents, ...otherData];
  } else {
    return data.Contents;
  }
};

const downloadTrees = async () => {
  try {
    const objectKeys = await getTreeObjectKeys();
    logger.progress('trees', objectKeys.length, 'Fetching Trees');
    const promises = objectKeys.map(async k => {
      const params = {
        Bucket: bucketName,
        Key: k.Key
      };
      const file = await s3.getObject(params).promise();
      const treeData = JSON.parse(file.Body.toString());
      logger.progress('trees').tick(1);
      return { ...treeData, tree: eval(treeData.tree) };
    });
    return Promise.all(promises);
  } catch (err) {
    console.log(err);
    throw err;
  }
};

module.exports = {
  getData,
  uploadData,
  sendMessage,
  downloadTrees
};
