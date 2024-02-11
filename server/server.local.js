const getApp = require('./server');

(async function() {
  try {
    const app = await getApp();
    app.listen("7777");
  } catch(e) {
    console.log(e);
  }
})();
