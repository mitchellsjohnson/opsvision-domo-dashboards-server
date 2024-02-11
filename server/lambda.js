const serverlessExpress = require('@vendia/serverless-express')
const getApp = require('./server');
const config = require('./config');

exports.handler = async (event, context) => {
  const app = await getApp(); 
  const handler = serverlessExpress({ app }).handler;
  return handler(event, context);
}
