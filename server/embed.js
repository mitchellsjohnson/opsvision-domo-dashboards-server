const request = require('request');
const jws = require('jws');

function getEmbedToken(req, res, next, config) {
  const {DOMO_EMBED_TOKEN_URL} = req.serverConfig; 
  return new Promise((resolve, reject) => {
    console.log('getting embed token');
    if (1===2){  //TBD fix issue with needing new embed token every time
      // if (config.embedToken && config.embedTokenExpiration  > secondsSinceEpoch()) {
      console.log('embed token resolved');
      resolve();
    } else {
      console.log('embed token is expired');
      getAccessToken(req, res, next, config).then(() => {
        request.post(DOMO_EMBED_TOKEN_URL,
          { 
            json: {
              "sessionLength": 1440, 
              "authorizations": [
                {
                  "token": req.params.embedId, 
                  "permissions": ["READ", "FILTER", "EXPORT"], 
                  "filters": config.filters,
                  "policies": config.policies,
                }
              ]
            },
            headers: {
              'Authorization': 'Bearer ' + config.accessToken,
              'content-type': 'application/json; chartset=utf-8',
              'accept': '*/*'
            } 
          },
          function (err, response, body) {
            if (err) {
              next(err);
            }
            else if (body.error) {
              console.log('body', body);
              next(Error(body.error));
            }
            else if (response.statusCode >= 400) {
              console.log('body', body);
              next(Error(body.statusReason));
            }
            else {
              config.embedToken = body.authentication;
              const decodedToken = jws.decode(config.embedToken);
              if (decodedToken.payload.emb.length === 0) {
                next(Error('The emb field in the embed token is empty. This usually means the user associated with the clientid/clientsecret does not have access to this card.'));
              } else {
                // We'll say it expires 60 seconds before it actually does so that we aren't using an invalid embed token
                config.embedTokenExpiration = decodedToken.payload.exp - 60;
                console.log(`embed token created: valid until ${config.embedTokenExpiration}`);
                resolve();
              }
            }
          }
        );
      });
    }
  });
}

function getAccessToken(req, res, next, config) {
  const {DOMO_ACCESS_TOKEN_URL} = req.serverConfig; 
  return new Promise((resolve, reject) => {
    console.log('getting access token');
    if (config.accessToken && config.accessTokenExpiration > secondsSinceEpoch()) {
      console.log(`access token is not expired: still valid for ${config.accessTokenExpiration - secondsSinceEpoch()} seconds`);
      resolve();
    } else {
      console.log('access token is expired');
      console.log('creating new access token');
      request.get(DOMO_ACCESS_TOKEN_URL,
        {
          headers: {
            "Authorization": "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64")
          }
        },
        function(err, response, body) {
          if (err) {
            console.log('error creating access token');
            next(err);
          }
          else if (response.statusCode >= 400) {
            console.log('body', body);
            next(Error(body.statusReason));
          }
          else {
            try {
              //console.log(body);
              const json = JSON.parse(body);
              config.userId = json.userId;
              config.accessToken = json.access_token;
              // We'll say it's expired 60 seconds before it actually does to make sure we aren't using an invalid access token.
              config.accessTokenExpiration = Math.floor(Date.now() / 1000) + (json.expires_in - 60);
              console.log('access token created: valid until ' + config.accessTokenExpiration);
              resolve();
            } catch (e) {
              console.log('Exception trying to parse access token response: response = ', body, e);
              next('Exception trying to parse access token response: response = ', body, e);
            }
          }
        });
    }
  });
}

function secondsSinceEpoch(){ return Math.floor( Date.now() / 1000 ) }

function returnEmbedInfo( req, res, next, config) {
  const {DOMO_EMBED_URL} = req.serverConfig; 
  const response = `<html>
    <body>
      <form id="form" action="${DOMO_EMBED_URL}${req.params.embedId}" method="post">
        <input type="hidden" name="embedToken" value='${config.embedToken}'>
      </form>
      <script>
        document.getElementById("form").submit();
      </script>
    </body>
  </html>`;
  // console.log("embed response:  " + response);
  res.send(response);
}

function handleRequest(req, res, next, config) {
  getEmbedToken(req, res, next, config).then(() => {
    return returnEmbedInfo(req, res, next, config);
    ///res.render("domo_iframe"); 
    //return embedInfo;
  });
}

function showFilters(req, res) {
  const query = req.query;
  console.log(`query = `, query);
  let message = `Transitioning content based on mouse click for the following filter:`;
  res.send(`
  <html>
    <body>
      <div style="margin: 20px; font-size: 24px; line-height: 30px;">
        ${message}
        <pre id="filters" style="line-height: 20px; font-size: 16px; color: lightslategrey; "></pre>
      </div>
    </body>
    <script>
      const filters = ${req.query.filters};
      const el = document.getElementById("filters"); 
      el.innerText = JSON.stringify(filters, undefined, 4);
   </script>
  </html>
  `);
}

function refreshEmbedToken(req, res, next, config) {
  return getEmbedToken(req, res, next, config);
}

module.exports = {
  handleRequest,
  refreshEmbedToken,
  showFilters,
}
