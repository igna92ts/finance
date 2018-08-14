// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');
require('dotenv').config();
// Set the region
AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});

// Create an SQS service object
const sqs = new AWS.SQS();

const params = {
  MessageBody: 'Information about current NY Times fiction bestseller for week of 12/11/2016.',
  QueueUrl: 'https://sqs.us-east-1.amazonaws.com/534322619540/finance-training'
};

const send = msg => {
  return sqs
    .sendMessage({
      MessageBody: msg,
      QueueUrl: 'https://sqs.us-east-1.amazonaws.com/534322619540/finance-training'
    })
    .promise()
    .then(data => console.log(data.MessageId));
};

const receiveMessage = () => {
  return sqs
    .receiveMessage({
      QueueUrl: params.QueueUrl
    })
    .promise()
    .then(data => {
      if (data.Messages) {
        const message = data.Messages[0];
        const deleteParams = {
          QueueUrl: params.QueueUrl,
          ReceiptHandle: message.ReceiptHandle
        };
        console.log(data);
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

send(JSON.stringify({ features: ['MA120', 'price', 'shortTime'], fileName: 'data', fold: 0, number: 1 }));

// for (let i = 0; i < 20; i++) {
//   // send(`Msg number ${i}`);
//   receive();
// }
