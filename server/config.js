const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const aws = require('aws-sdk');

// Read environment variables from appropriate environment file. Override environment vars if they are already set.
const TARGET_ENV = process.env.TARGET_ENV || 'local';
const ENV_FILE = path.resolve(__dirname, './environment', `${TARGET_ENV}.env`);

// const TESTENV = path.resolve(__dirname, '..', 'testenv');
if (TARGET_ENV === 'local'){
  if (fs.existsSync(ENV_FILE)) {
    const envConfig = dotenv.parse(fs.readFileSync(ENV_FILE));
    Object.keys(envConfig).forEach((k) => {
      process.env[k] = envConfig[k];
    });
  }
}

const DOMO_API_HOST = 'https://api.domo.com';
const DOMO_EMBED_HOST = 'https://public.domo.com';
const DOMO_ACCESS_TOKEN_URL = `${DOMO_API_HOST}/oauth/token?grant_type=client_credentials&scope=data%20audit%20user%20dashboard`;
const DOMO_EMBED_TOKEN_URL_DASHBOARD = `${DOMO_API_HOST}/v1/stories/embed/auth`;
const DOMO_EMBED_URL_DASHBOARD = `${DOMO_EMBED_HOST}/embed/pages/`;
const DOMO_EMBED_TOKEN_URL_CARD = `${DOMO_API_HOST}/v1/cards/embed/auth`;
const DOMO_EMBED_URL_CARD = `${DOMO_EMBED_HOST}/cards/`;

//Okta vars
var OKTA_CLIENT_SECRET = process.env.OKTA_CLIENT_SECRET || '{clientSecret}';
var OKTA_TESTING_DISABLEHTTPSCHECK = process.env.OKTA_TESTING_DISABLEHTTPSCHECK ? true : false;

//DOMO vars
var DOMO_EMBED_TYPE=process.env.DOMO_EMBED_TYPE;
var DOMO_USE_XHR=process.env.DOMO_USE_XHR;
var DOMO_REPLACE_IFRAME=process.env.DOMO_USE_XHR;
var DOMO_EMBED_TOKEN_URL = DOMO_EMBED_TOKEN_URL_DASHBOARD;
var DOMO_EMBED_URL = DOMO_EMBED_URL_DASHBOARD;

//AWS Vars


const getSecrets = () => {

  const AWS = require('aws-sdk');
  const region = 'us-east-1';
  const secretName = 'OpsvisionDomoDashboard_Config';
  // Create a Secrets Manager client
  var client = new AWS.SecretsManager({
    region: region
  });

  return client.getSecretValue({SecretId: secretName}).promise();
}

module.exports = async () => {
  const secretData = await getSecrets();
  const secretString = secretData.SecretString
  const secrets = JSON.parse(secretString)
  const {
    DOMO_CLIENT_ID,
    DOMO_CLIENT_SECRET,
    DOMO_EMBED_ID,
    DOMO_EMBED_ID2,
    DOMO_EMBED_ID3,
    DOMO_EMBED_ID4,
    DOMO_EMBED_ID5,
    DOMO_EMBED_ID6,
    DOMO_EMBED_TYPE,
    OKTA_CLIENT_ID,
    OKTA_ISSUER,
    OKTA_SPA_CLIENT_ID,
  } = secrets;

  if (DOMO_EMBED_TYPE === 'card') {
    DOMO_EMBED_TOKEN_URL = DOMO_EMBED_TOKEN_URL_CARD;
    DOMO_EMBED_URL = DOMO_EMBED_URL_CARD;
  }

  return {
    DOMO_CLIENT_ID,
    DOMO_CLIENT_SECRET,
    DOMO_EMBED_ID,
    DOMO_EMBED_TYPE,
    DOMO_USE_XHR,
    DOMO_REPLACE_IFRAME,
    DOMO_ACCESS_TOKEN_URL,
    DOMO_EMBED_TOKEN_URL,
    DOMO_EMBED_URL,  
    resourceServer: {
      port: 7777,
      oidc: {
        clientId: OKTA_SPA_CLIENT_ID,
        issuer: OKTA_ISSUER,
        testing: {
          disableHttpsCheck: OKTA_TESTING_DISABLEHTTPSCHECK
        }
      },
      assertClaims: {
        aud: 'Prod',
        cid: OKTA_SPA_CLIENT_ID
      }
    },
    users: [
      {
        username: 'default',
        config: {
          visualization1: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID,
            //filters: [{"column": "Seller", "operator": "IN", "values": ["Cardinal"]}]
            filters: []
          },
          visualization2: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID2,
          },
          visualization3: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID3,
          },
          visualization4: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID4,
          },
          visualization5: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID5,
          },
          visualization6: {
            clientId: DOMO_CLIENT_ID, clientSecret: DOMO_CLIENT_SECRET, embedId: DOMO_EMBED_ID6,
          } 
        }
      }
    ],
  }

};
