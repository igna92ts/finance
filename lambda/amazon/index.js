const AWS = require('aws-sdk'),
  JSZip = require('jszip'),
  zip = new JSZip();

const bucketName = 'igna92ts-finance';
const sqsUrl = 'https://sqs.us-east-1.amazonaws.com/534322619540/finance-training';

AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});
const s3 = new AWS.S3();
const sqs = new AWS.SQS();

const unzipFile = async data => {
  const zipData = await JSZip.loadAsync(data.Body);
  const file = await zipData.file('data.json').async('string');
  const parsedData = JSON.parse(file);
  return parsedData;
};

const receiveMessage = () => {
  return sqs
    .receiveMessage({
      QueueUrl: sqsUrl
    })
    .promise()
    .then(data => {
      if (data.Messages) {
        const message = data.Messages[0];
        const deleteParams = {
          QueueUrl: sqsUrl,
          ReceiptHandle: message.ReceiptHandle
        };
        return sqs
          .deleteMessage(deleteParams)
          .promise()
          .then(() => JSON.parse(data.Body));
      } else return console.error('No Messages in SQS ');
    })
    .catch(err => {
      console.error(err);
      throw err;
    });
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
      console.error(err);
      throw err;
    });
};

const uploadTree = async treeObj => {
  const params = {
    Body: treeObj.tree,
    Bucket: bucketName,
    Key: `trees/fold${treeObj.fold}/tree${treeObj.number}.json`
  };
  return new Promise((resolve, reject) => {
    s3.putObject(params, (err, result) => {
      if (err) {
        console.error(err);
        return reject(err);
      } else return resolve(result);
    });
  });
};

module.exports = { getData, uploadTree, receiveMessage };
