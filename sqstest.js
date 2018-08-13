// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
require('dotenv').config();
// Set the region
AWS.config.update({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: 'us-east-1'
});

// Create an SQS service object
var sqs = new AWS.SQS();

var params = {
  MessageAttributes: {
    "Title": {
      DataType: "String",
      StringValue: "The Whistler"
    },
    "Author": {
      DataType: "String",
      StringValue: "John Grisham"
    },
    "WeeksOn": {
      DataType: "Number",
      StringValue: "6"
    }
  },
  MessageBody: "Information about current NY Times fiction bestseller for week of 12/11/2016.",
  QueueUrl: "https://sqs.us-east-1.amazonaws.com/534322619540/finance-training"
};

sqs.sendMessage(params, function(err, data) {
  if (err) {
    console.log("Error", err);
  } else {
    console.log("Success", data.MessageId);
  }
});

sqs.receiveMessage({ QueueUrl: "https://sqs.us-east-1.amazonaws.com/534322619540/finance-training"}, function(err, data) {
  if (err) {
    console.log("Receive Error", err);
  } else if (data.Messages) {
    var deleteParams = {
      QueueUrl: "https://sqs.us-east-1.amazonaws.com/534322619540/finance-training",
      ReceiptHandle: data.Messages[0].ReceiptHandle
    };
    sqs.deleteMessage(deleteParams, function(err, data) {
      if (err) {
        console.log("Delete Error", err);
      } else {
        console.log("Message Deleted", data);
      }
    });
  }
});
