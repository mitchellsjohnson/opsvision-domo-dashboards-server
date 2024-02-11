/*
 *MIT License
 */

 const express = require('express');
 const embed = require('./embed.js');
 const OktaJwtVerifier = require('@okta/jwt-verifier');
 var cors = require('cors');
 const path = require('path');
 const getConfig = require('./config.js');
 const uuidv4 = require('uuid/v4');
 const AWS = require('aws-sdk');
 var decode = require('jwt-claims');

 module.exports = async () => {
   const config = await getConfig();
   const userConfig = config.users;
   const USAGE_LOGGING_BASE = 'USAGE_LOGGING';
   /**
    * A simple middleware that asserts valid access tokens and sends 401 responses
    * if the token is not present or fails validation.  If the token is valid its
    * contents are attached to req.jwt
    */
   function authenticationRequired(req, res, next) {
     const authHeader = req.headers.authorization || '';
     const match = authHeader.match(/Bearer (.+)/);
     if (!match) {
       res.status(401);
       console.log
       return next('Unauthorized');
     }
     const oktaJwtVerifier = new OktaJwtVerifier({
       clientId: config.resourceServer.oidc.clientId,
       issuer: config.resourceServer.oidc.issuer,
       assertClaims: config.resourceServer.assertClaims,
       testing: config.resourceServer.oidc.testing,
     });
     const accessToken = match[1];
     const audience = config.resourceServer.assertClaims.aud;
     return oktaJwtVerifier
       .verifyAccessToken(accessToken, audience)
       .then((jwt) => {
         req.jwt = jwt;
         next();
       })
       .catch((err) => {
         res.status(401).send(err.message);
       });
   }
 
   function getUser(username) {
     user = userConfig.find((user) => {
       return user.username === username;
     });
     if (user) {
       return user;
     }
     return null;
   }

   AWS.config.update({ region: 'us-east-1' });
   var dynamoDb = new AWS.DynamoDB.DocumentClient();


   function compareStrings(a, b) {
    // Assuming you want case-insensitive comparison
    a = a.toLowerCase();
    b = b.toLowerCase();
  
    return (a < b) ? -1 : (a > b) ? 1 : 0;
  };

   function logUsage(pk, action, api, friendlyApi, email, timestamp, embedId, viewMode, objectName, fullUrl) {
    const sk = USAGE_LOGGING_BASE + '#' + timestamp;
    const dat = email + '#' + timestamp + '#' + embedId + '#' + friendlyApi + '#' + action +'#' + objectName 
    const params = {
          TableName: 'opsvision',
          Item: {
            pk: pk,
            sk: sk,
            dat: dat,
            recordType: USAGE_LOGGING_BASE,
            embedId: embedId,
            viewMode: viewMode,
            name: objectName,
            action: action,
            api: api,
            friendlyApi: friendlyApi,
            createdOn: timestamp,
            createdBy: email,
            fullURL:  fullUrl,
          },
        };
        dynamoDb.put(params, (error) => {
          if (error) {
            res
              .status(400)
              .json({ error: 'Could not INSERT Usage Tracking' });
            return 'ERROR';
          }
          return 'SUCCESS';
          });
  };

  function logicalDelete(pk, sk, recordType, modifiedBy) {

    const modifiedOnTimestamp = new Date();
    const modifiedOn = modifiedOnTimestamp.toISOString();
    // update each usage logging record to be logically deleted 
    params = {
      TableName: 'opsvision',
      Key: {
        pk: pk,
        sk: sk,
      },
      UpdateExpression:
        'set recordType = :recordType, modifiedOn = :modifiedOn, modifiedBy = :modifiedBy',
      ExpressionAttributeValues: {
        ':recordType': recordType,
        ':modifiedOn': modifiedOn,
        ':modifiedBy': modifiedBy,
      },
    };
        dynamoDb.update(params, (error) => {
          if (error) {
            res
              .status(400)
              .json({ error: 'Could not INSERT Usage Tracking' });
            return 'ERROR' + error;
          }
          return 'SUCCESS';
          });
  };
 
   const app = express();
 
   app.use(express.static(path.join(__dirname, 'public')));
 
   /**
    * For local testing only!  Enables CORS for all domains
    */
   app.use(cors());
 
   app.use(express.json());
 
   app.use(function (req, res, next) {
     req.serverConfig = config;
     next();
   });
 
   if (
     !config.DOMO_CLIENT_ID ||
     !config.DOMO_CLIENT_SECRET ||
     !config.DOMO_EMBED_TYPE
   ) {
     console.log(
       'The following variables must be declared in your .env file:  DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_EMBED_TYPE.'
     );
     return;
   }
 
   app.get('/domo_iframe/:embedId/:viewMode?/:pk?/:dbName?/:app_protocol?/:app_hostname?/:app_port?', authenticationRequired, (req, res, next) => {
     const user = getUser('default');
     const userConfig = user.config['visualization1'];
     if (req.params.embedId) {
      const token = req.headers.authorization || '';
      var claims = decode(token);
      var email = claims.sub;
       embed.handleRequest(req, res, next, userConfig);
       var createdOnTimestamp = new Date();
       const timestamp = createdOnTimestamp.toISOString();
       var fullUrlDashboardView  =  req.params.app_protocol + '//' + req.params.app_hostname + ':' +  req.params.app_port + req.originalUrl;
       // have to replace embed URL in iFrame with Dashboard route to allow user to navigate to URL for usage tracking log...
       var fullUrlDashboardView_modified = fullUrlDashboardView.replace("domo_iframe", "dashboard");

       logUsage(req.params.pk, 'VIEW', '/domo_iframe/', 'VIEW_DOMO_DASHBOARD', email, timestamp, req.params.embedId, req.params.viewMode,  req.params.dbName, fullUrlDashboardView_modified);
     } else {
       next(
         `The EMBED_ID${req.params.itemId} environment variable in your .env file is not set. Please set this in order to view content here.`
       );
     }
   });
 
   app.get('/', (req, res) => {
     res.json({
       message: 'Success.',
     });
   });
 
   /**
    * An example route that requires a valid access token for authentication, it
    * will echo the contents of the access token if the middleware successfully
    * validated the token.
    */
   app.get('/secure', authenticationRequired, (req, res) => {
     res.json(req.jwt);
   });
 
   /**
    * Another example route that requires a valid access token for authentication, and
    * print some messages for the user if they are authenticated
    */
   app.get('/api/messages', authenticationRequired, (req, res) => {
     res.json({
       messages: [
         {
           date: new Date(),
           text: 'Testing Okta Autenticated API via test messages API.   Success!',
         },
         {
           date: new Date(),
           text: 'Adding a second message!',
         },
       ],
     });
   });
 
   /**
    * Dynamo DB Access Utilities
    */
  
   app.get('/api/dashboard-rec-list', authenticationRequired, (req, res) => {
     const params = {
       TableName: 'opsvision',
       IndexName: 'sk-dat-index',
       KeyConditionExpression: 'sk = :sk',
       ExpressionAttributeValues: { ':sk': 'DASHBOARD' },
     };
     dynamoDb.query(params, (error, result) => {
       if (error) {
         res
           .status(400)
           .json({ error: 'Error fetching dashboard rec from opsvision table' });
       }
       res.json({
         results: result.Items,
       });
     });
   });
 
   // get all dashboards for a given folder 
   app.get('/api/dashboard-rec-list/:folderpk', (req, res) => {
    // first, pull the folder and list of dasbhoards

    const folderpk = req.params.folderpk;
    const foldersk = 'FOLDER';
    const params0 = {
      TableName: 'opsvision',
      Key: {
        pk: folderpk,
        sk: foldersk,
      },
    };
    dynamoDb.get(params0, (error, result) => {
      if (error) {
        console.log('error:  ', error);
        res
          .status(400)
          .json({
            error:
              'Error fetching folder in dashboard-rec-list/:folderpk from opsvision table',
          });
      } else {
        // we got the folder now get the list of dashboards
         const dashboardList = result.Item.dashboardList;
         const dashboardCount = dashboardList.length;
         const dashboardsk = 'DASHBOARD'
         var params1 = {
          RequestItems: {
            'opsvision': {
              Keys: [
                {'pk':  'NA', 'sk':  'NA'}
              ],
            }
          }
        };
        // loop through dashboard list and build params for batch get of dashboards
         for (let i = 0; i < dashboardCount; i += 1) {
              params1.RequestItems.opsvision.Keys[i] = {
              'pk':  dashboardList[i].value, 'sk': dashboardsk 
            }
         }
        dynamoDb.batchGet(params1, (error, result) => {
          if (error) {
            res
              .status(400)
              .json({ error: 'Error batch fetching dashboard rec(s) in dashboard-rec-list/:folderpkfrom opsvision table' });
          }
          const sortedData = result.Responses.opsvision.sort(function(a, b) {
            return compareStrings(a.dat, b.dat);
          })   
          res.json({
            results: sortedData,
          });
        });
      };
    });
   });  


   app.get('/api/dashboard-rec/:pk/:sk', authenticationRequired, (req, res) => {
     const params = {
       TableName: 'opsvision',
       Key: {
         pk: req.params.pk,
         sk: req.params.sk,
       },
     };
     dynamoDb.get(params, (error, result) => {
       if (error) {
         res
           .status(400)
           .json({ error: 'Error fetching dashboard from opsvision table' });
       }
       res.json({
         results: [result.Item],
       });
     });
   });
 
   app.post('/api/dashboard-rec', authenticationRequired, (req, res) => {
     const id = uuidv4();
     const pk = 'PK_DBG_' + id;
 
     const sk = 'DASHBOARD';
     const dat = req.body.dName;
     const embedId = req.body.embedId;
     const description = req.body.description;
     const createdBy = req.body.email;
     const modifiedBy = req.body.email;
     var createdOnTimestamp = new Date();
     const createdOn = createdOnTimestamp.toISOString();
     const modifiedOn = createdOnTimestamp.toISOString();
     //make sure key does not already exist
     const params0 = {
       TableName: 'opsvision',
       IndexName: 'sk-dat-index',
       KeyConditionExpression: 'sk = :sk and dat = :dat',
       ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
     };
     dynamoDb.query(params0, (error, result) => {
       if (error) {
         console.log('error:  ', error);
         res
           .status(400)
           .json({
             error:
               'Error fetching dashboard in dashboard POST (add) from opsvision table',
           });
       } else {
         const existVal = result.Count;
 
         if (existVal > 0) {
           res.status(409).json({ error: 'Duplicate dashboard name' });
         } else {
           // if not a duplicate, add the record
           const params = {
             TableName: 'opsvision',
             Item: {
               pk: pk,
               sk: sk,
               dat: dat,
               embedId: embedId,
               description: description,
               createdOn: createdOn,
               createdBy: createdBy,
               modifiedOn: modifiedOn,
               modifiedBy: modifiedBy,
             },
           };
           dynamoDb.put(params, (error) => {
             if (error) {
               res.status(400).json({ error: 'Could not INSERT Dashboard' });
               return;
             }
             res.json({
               pk,
               sk,
               dat,
               embedId,
               description,
               createdOn,
               createdBy,
               modifiedOn,
               modifiedBy,
             });
           });
         }
       }
     });
   });
 
   app.put('/api/dashboard-rec', authenticationRequired, (req, res) => {
     const pk = req.body.pk;
     const embedId = req.body.embedId;
     const sk = 'DASHBOARD';
     const dat = req.body.dName;
     const description = req.body.description;
     const modifiedBy = req.body.email;
     var modifiedOnTimestamp = new Date();
     const modifiedOn = modifiedOnTimestamp.toISOString();
     console.log('dat', dat);
     //make sure key does not already exist
     var duplicate = false;
     const params0 = {
       TableName: 'opsvision',
       IndexName: 'sk-dat-index',
       KeyConditionExpression: 'sk = :sk and dat = :dat',
       ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
     };
     dynamoDb.query(params0, (error, result) => {
       if (error) {
         console.log('error:  ', error);
         res
           .status(400)
           .json({
             error:
               'Error fetching dashboard in dashboard PUT (add) from opsvision table',
           });
       } else {
          const existValCount = result.Count;
          console.log('count:  ' + existValCount);
          console.log('result:  ' + result);
          if (existValCount > 0) {
              const pk_result = JSON.stringify(result.Items[0].pk).replace(
                /['"]+/g,
                ''
              );
              console.log('pk:  ', pk);
              console.log('pk_result:  ', pk_result);
              console.log('duplicate:  ', duplicate);
              if (pk !== pk_result) {
                console.log('set duplicate = true');
                duplicate = true;
              };
          };
          if (duplicate === true){
            res.status(409).json({ error: 'ERROR:  Duplicate dashboard name' });
          } else {
                  // if not a duplicate, UPDATE the record
                  const params = {
                    TableName: 'opsvision',
                    Key: {
                      pk: pk,
                      sk: sk,
                    },
                    UpdateExpression:
                      'set dat = :dat, description = :description, modifiedOn = :modifiedOn, modifiedBy = :modifiedBy, embedId = :embedId',
                    ExpressionAttributeValues: {
                      ':dat': dat,
                      ':embedId': embedId,
                      ':description': description,
                      ':modifiedOn': modifiedOn,
                      ':modifiedBy': modifiedBy,
                    },
                  };
                  //UPDATE
                  dynamoDb.update(params, (error) => {
                    if (error) {
                      res.status(400).json({ error: 'ERROR:  Could not UPDATE Dashboard' });
                      return;
                    }
                    res.json({
                      pk,
                      sk,
                      dat,
                      description,
                      modifiedOn,
                      modifiedBy,
                    });
                  });
          };

       };
     });

    });  
 


// deletes perform a physical delete
app.delete('/api/dashboard-rec', authenticationRequired, (req, res) => {
  const pk = req.body.pk;
  const sk = 'DASHBOARD';
  //get a list of folders and remove the dashboard from the folder list
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk',
    ExpressionAttributeValues: { ':sk': 'FOLDER' },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching folder list from opsvision table' });
    }
    // update the team records to remove this folder
    const token = req.headers.authorization || '';
    var claims = decode(token);
    var email = claims.sub;
    const foldersk = 'FOLDER'
    var modifiedOnTimestamp; 
    var modifiedOn; 
    const params1 = {
      TableName: 'opsvision',
      Key: {
        pk: '',
        sk: '',
      },
      UpdateExpression:
        'set modifiedOn = :modifiedOn, modifiedBy = :modifiedBy,  dashboardList = :dashboardList',
      ExpressionAttributeValues: {
        ':dashboardList': '',
        ':modifiedOn': '',
        ':modifiedBy': '',
      },
    };
    let tmpDashboardList = '';
    // loop through dashboard list and build params for batch get of dashboards

    for (let i = 0; i < result.Count; i += 1) {
      tmpDashboardList = result.Items[i].dashboardList;
      let myJSON = JSON.stringify(tmpDashboardList);
      if (myJSON.includes(req.body.pk)) {
        for (let j = 0; j < tmpDashboardList.length; j += 1) {
          let mySubJSON = JSON.stringify(tmpDashboardList[j]);
          if (mySubJSON.includes(req.body.pk)) {
            delete tmpDashboardList[j];
          }
        }  
        modifiedOnTimestamp = new Date();
        modifiedOn = modifiedOnTimestamp.toISOString();
        params1.Key= {
        'pk':  result.Items[i].pk, 'sk': foldersk
        };
        params1.ExpressionAttributeValues = {
          ':dashboardList': tmpDashboardList,
          ':modifiedOn': modifiedOn,
          ':modifiedBy': email,
          };
        console.log()
        //UPDATE
        dynamoDb.update(params1, (error) => {
          console.log('params1: ', params1);
          if (error) {
            console.log('error:  ', error);
            res.status(400).json({ error: 'ERROR:  Could not UPDATE folder in opsvision table' });
            return;
          }
        })
      }
    }
  });
  // now delete the folder...

    const params2 = {
      TableName: 'opsvision',
      Key: {
        pk: pk,
        sk: sk,
      },
    };
    dynamoDb.delete(params2, (error) => {
      if (error) {
        res.status(400).json({ error: 'Could not DELETE dashboard from opsvision table' });
        return;
      }
      res.json({
        pk,
        sk,
      });
    });
});







   
// usage_tracking APIs
   app.get('/api/usage_tracking', authenticationRequired, (req, res) => {
    const params = {
      TableName: 'opsvision',
      IndexName: 'recordType-dat-index',
      KeyConditionExpression: 'recordType = :recordType',
      ExpressionAttributeValues: { ':recordType': USAGE_LOGGING_BASE },
    };
    dynamoDb.query(params, (error, result) => {
      if (error) {
        console.log('error:  ', error);
        res
          .status(400)
          .json({
            error: 'Error fetching usage tracking data from opsvision table',
          });
      }
      res.json({
        results: result.Items,
      });
    });
  });

// folder APIs
app.get('/api/folder-list', authenticationRequired, (req, res) => {
  const params = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk',
    ExpressionAttributeValues: { ':sk': 'FOLDER' },
  };
  dynamoDb.query(params, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching folder list from opsvision table' });
    }
    res.json({
      results: result.Items,
    });
  });
});

  // get all folders for a given team
  app.get('/api/folder-list/:teampk', (req, res) => {
  // first, pull the team and list of folders
  const teampk = req.params.teampk;
  const teamsk = 'TEAM';
  const params0 = {
    TableName: 'opsvision',
    Key: {
      pk: teampk,
      sk: teamsk,
    },
  };
  
  dynamoDb.get(params0, (error, result) => {
    if (error) {
      console.log('error:  ', error);
      res
        .status(400)
        .json({
          error:
            'Error fetching team in /api/folder-list/:teampk from opsvision table',
        });
    } else {
      // we got the folder now get the list of dashboards
        const folderList = result.Item.folderList;
        const folderCount = folderList.length;
        const foldersk = 'FOLDER'
        var params1 = {
        RequestItems: {
          'opsvision': {
            Keys: [
              {'pk':  'NA', 'sk':  'NA'}
            ],
          }
        }
      };
      // loop through dashboard list and build params for batch get of dashboards
        for (let i = 0; i < folderCount; i += 1) {
            params1.RequestItems.opsvision.Keys[i] = {
            'pk':  folderList[i].value, 'sk': foldersk 
          }
        }
      dynamoDb.batchGet(params1, (error, result) => {
        if (error) {
          res
            .status(400)
            .json({ error: 'Error batch fetching folders rec(s) in /api/folder-list/:teampk from opsvision table' });
        }

        res.json({
          results: result.Responses.opsvision,
        });
      });
    };
  });

  });  



app.get('/api/folder/:pk/:sk', authenticationRequired, (req, res) => {
  const params = {
    TableName: 'opsvision',
    Key: {
      pk: req.params.pk,
      sk: req.params.sk,
    },
  };
  dynamoDb.get(params, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching dashboard from opsvision table' });
    }
    res.json({
      results: [result.Item],
    });
  });
});

app.post('/api/folder', authenticationRequired, (req, res) => {
  const id = uuidv4();
  const pk = 'PK_FOLDER_' + id;
  const sk = 'FOLDER';
  const dat = req.body.folderName;
  const dashboardList = req.body.selected;
  const description = req.body.description;
  const createdBy = req.body.email;
  const modifiedBy = req.body.email;
  var createdOnTimestamp = new Date();
  const createdOn = createdOnTimestamp.toISOString();
  const modifiedOn = createdOnTimestamp.toISOString();
  //make sure key does not already exist
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk and dat = :dat',
    ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      console.log('error:  ', error);
      res
        .status(400)
        .json({
          error:
            'Error fetching folder in folder POST (add) from opsvision table',
        });
    } else {
      const existVal = result.Count;
      if (existVal > 0) {
        res.status(409).json({ error: 'Duplicate folder name' });
      } else {
        // if not a duplicate, add the record
        const params = {
          TableName: 'opsvision',
          Item: {
            pk: pk,
            sk: sk,
            dat: dat,
            dashboardList: dashboardList,
            description: description,
            createdOn: createdOn,
            createdBy: createdBy,
            modifiedOn: modifiedOn,
            modifiedBy: modifiedBy,
          },
        };
        dynamoDb.put(params, (error) => {
          if (error) {
            res.status(400).json({ error: 'Could not INSERT Folder into opsvision table' });
            return;
          }
          res.json({
            pk,
            sk,
            dat,
            dashboardList,
            description,
            createdOn,
            createdBy,
            modifiedOn,
            modifiedBy,
          });
        });
      }
    }
  });
});

app.put('/api/folder', authenticationRequired, (req, res) => {
  const pk = req.body.pk;
  const sk = 'FOLDER';
  const dat = req.body.folderName;
  const dashboardList = req.body.selected;
  const description = req.body.description;
  const modifiedBy = req.body.email;
  var modifiedOnTimestamp = new Date();
  const modifiedOn = modifiedOnTimestamp.toISOString();

  //make sure key does not already exist
  var duplicate = false;
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk and dat = :dat',
    ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      console.log('error:  ', error);
      res
        .status(400)
        .json({
          error:
            'Error fetching folder in folder PUT (add) from opsvision table',
        });
    } else {
       const existValCount = result.Count;
       if (existValCount > 0) {
           const pk_result = JSON.stringify(result.Items[0].pk).replace(
             /['"]+/g,
             ''
           );
           if (pk !== pk_result) {
             duplicate = true;
           };
       };
       if (duplicate === true){
         res.status(409).json({ error: 'ERROR:  Duplicate folder name' });
       } else {
               // if not a duplicate, UPDATE the record
               const params = {
                 TableName: 'opsvision',
                 Key: {
                   pk: pk,
                   sk: sk,
                 },
                 UpdateExpression:
                   'set dat = :dat, description = :description, modifiedOn = :modifiedOn, modifiedBy = :modifiedBy,  dashboardList = :dashboardList',
                 ExpressionAttributeValues: {
                   ':dat': dat,
                   ':dashboardList': dashboardList,
                   ':description': description,
                   ':modifiedOn': modifiedOn,
                   ':modifiedBy': modifiedBy,
                 },
               };
               //UPDATE
               dynamoDb.update(params, (error) => {
                 if (error) {
                   res.status(400).json({ error: 'ERROR:  Could not UPDATE folder in opsvision table' });
                   return;
                 }
                 res.json({
                   pk,
                   sk,
                   dat,
                   dashboardList,
                   description,
                   modifiedOn,
                   modifiedBy,
                 });
               });
       };

    };
  });

 });  


// deletes perform a physical delete
app.delete('/api/folder', authenticationRequired, (req, res) => {
  const pk = req.body.pk;
  const sk = 'FOLDER';
  //get a list of teams and remove the folder from the folder list
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk',
    ExpressionAttributeValues: { ':sk': 'TEAM' },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching team list from opsvision table' });
    }
    // update the team records to remove this folder
    const token = req.headers.authorization || '';
    var claims = decode(token);
    var email = claims.sub;
    const teamsk = 'TEAM'
    var modifiedOnTimestamp; 
    var modifiedOn; 
    const params1 = {
      TableName: 'opsvision',
      Key: {
        pk: '',
        sk: '',
      },
      UpdateExpression:
        'set modifiedOn = :modifiedOn, modifiedBy = :modifiedBy,  folderList = :folderList',
      ExpressionAttributeValues: {
        ':folderList': '',
        ':modifiedOn': '',
        ':modifiedBy': '',
      },
    };
    let tmpFolderList = '';
    // loop through dashboard list and build params for batch get of dashboards

    for (let i = 0; i < result.Count; i += 1) {
      tmpFolderList = result.Items[i].folderList;
      let myJSON = JSON.stringify(tmpFolderList);
      if (myJSON.includes(req.body.pk)) {
        for (let j = 0; j < tmpFolderList.length; j += 1) {
          let mySubJSON = JSON.stringify(tmpFolderList[j]);
          if (mySubJSON.includes(req.body.pk)) {
            delete tmpFolderList[j];
          }
        }  
        modifiedOnTimestamp = new Date();
        modifiedOn = modifiedOnTimestamp.toISOString();
        params1.Key= {
        'pk':  result.Items[i].pk, 'sk': teamsk
        };
        params1.ExpressionAttributeValues = {
          ':folderList': tmpFolderList,
          ':modifiedOn': modifiedOn,
          ':modifiedBy': email,
          };
        //UPDATE
        dynamoDb.update(params1, (error) => {
          if (error) {
            res.status(400).json({ error: 'ERROR:  Could not UPDATE team in opsvision table' });
            return;
          }
        })
      }
    }
  });
  // now delete the folder...

    const params2 = {
      TableName: 'opsvision',
      Key: {
        pk: pk,
        sk: sk,
      },
    };
    dynamoDb.delete(params2, (error) => {
      if (error) {
        res.status(400).json({ error: 'Could not DELETE folder from opsvision table' });
        return;
      }
      res.json({
        pk,
        sk,
      });
    });
});

// Team APIs
app.get('/api/team-list', authenticationRequired, (req, res) => {
  const params = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk',
    ExpressionAttributeValues: { ':sk': 'TEAM' },
  };
  dynamoDb.query(params, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching team list from opsvision table' });
    }
    res.json({
      results: result.Items,
    });
  });
});

app.get('/api/team/:pk/:sk', authenticationRequired, (req, res) => {
  const params = {
    TableName: 'opsvision',
    Key: {
      pk: req.params.pk,
      sk: req.params.sk,
    },
  };
  dynamoDb.get(params, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({ error: 'Error fetching team from opsvision table' });
    }
    res.json({
      results: [result.Item],
    });
  });
});


app.post('/api/team', authenticationRequired, (req, res) => {
  const id = uuidv4();
  const pk = 'PK_FOLDER_' + id;
  const sk = 'TEAM';
  const dat = req.body.teamName;
  const folderList = req.body.selected;
  const description = req.body.description;
  const createdBy = req.body.email;
  const modifiedBy = req.body.email;
  var createdOnTimestamp = new Date();
  const createdOn = createdOnTimestamp.toISOString();
  const modifiedOn = createdOnTimestamp.toISOString();

  //make sure key does not already exist
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk and dat = :dat',
    ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      console.log('error:  ', error);
      res
        .status(400)
        .json({
          error:
            'Error fetching team in team POST (add) from opsvision table',
        });
    } else {
      const existVal = result.Count;
      if (existVal > 0) {
        res.status(409).json({ error: 'Duplicate folder name' });
      } else {
        // if not a duplicate, add the record
        const params = {
          TableName: 'opsvision',
          Item: {
            pk: pk,
            sk: sk,
            dat: dat,
            folderList: folderList,
            description: description,
            createdOn: createdOn,
            createdBy: createdBy,
            modifiedOn: modifiedOn,
            modifiedBy: modifiedBy,
          },
        };
        dynamoDb.put(params, (error) => {
          if (error) {
            res.status(400).json({ error: 'Could not INSERT Team into opsvision table' });
            return;
          }
          res.json({
            pk,
            sk,
            dat,
            folderList,
            description,
            createdOn,
            createdBy,
            modifiedOn,
            modifiedBy,
          });
        });
      }
    }
  });
});

app.put('/api/team', authenticationRequired, (req, res) => {
  const pk = req.body.pk;
  const sk = 'TEAM';
  const dat = req.body.teamName;
  const folderList = req.body.selected;
  const description = req.body.description;
  const modifiedBy = req.body.email;
  var modifiedOnTimestamp = new Date();
  const modifiedOn = modifiedOnTimestamp.toISOString();

  //make sure key does not already exist
  var duplicate = false;
  const params0 = {
    TableName: 'opsvision',
    IndexName: 'sk-dat-index',
    KeyConditionExpression: 'sk = :sk and dat = :dat',
    ExpressionAttributeValues: { ':sk': sk, ':dat': dat },
  };
  dynamoDb.query(params0, (error, result) => {
    if (error) {
      res
        .status(400)
        .json({
          error:
            'Error fetching team in team PUT (add) from opsvision table',
        });
    } else {
       const existValCount = result.Count;
       if (existValCount > 0) {
           const pk_result = JSON.stringify(result.Items[0].pk).replace(
             /['"]+/g,
             ''
           );
           if (pk !== pk_result) {
             duplicate = true;
           };
       };
       if (duplicate === true){
         res.status(409).json({ error: 'ERROR:  Duplicate team name' });
       } else {
               // if not a duplicate, UPDATE the record
               const params = {
                 TableName: 'opsvision',
                 Key: {
                   pk: pk,
                   sk: sk,
                 },
                 UpdateExpression:
                   'set dat = :dat, description = :description, modifiedOn = :modifiedOn, modifiedBy = :modifiedBy,  folderList = :folderList',
                 ExpressionAttributeValues: {
                   ':dat': dat,
                   ':folderList': folderList,
                   ':description': description,
                   ':modifiedOn': modifiedOn,
                   ':modifiedBy': modifiedBy,
                 },
               };
               //UPDATE
               dynamoDb.update(params, (error) => {
                 if (error) {
                   res.status(400).json({ error: 'ERROR:  Could not UPDATE Team' });
                   return;
                 }
                 res.json({
                   pk,
                   sk,
                   dat,
                   folderList,
                   description,
                   modifiedOn,
                   modifiedBy,
                 });
               });
       };

    };
  });

 });  

// deletes perform a physical delete
app.delete('/api/team', authenticationRequired, (req, res) => {
  const pk = req.body.pk;
  const sk = 'TEAM';
  const params = {
    TableName: 'opsvision',
    Key: {
      pk: pk,
      sk: sk,
    },
  };
  //DELETE
  dynamoDb.delete(params, (error) => {
    if (error) {
      console.log('error:  ', error);
      res.status(400).json({ error: 'Could not DELETE Team from opsvision table' });
      return;
    }
    res.json({
      pk,
      sk,
    });
  });
});
//SCRUBS:  CAUTION, ONLY ADMINS SHOULD RUN THESE 

   return app;
 };
 