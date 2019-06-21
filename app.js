const express = require('express');
const app = express();
const router = express.Router();
const RateLimit = require('./ratelimit');
const request = require('request');

router.get('/', (req, res) => {
  let httpOptions = {
    method: 'GET',
    url: 'http://dummy.restapiexample.com/api/v1/employees'
  };

  RateLimit.ThirdPartyAPIs.trackRequest({
    "host": "restapiexample",
    "api": "employees"
  }).then(function(isAllowed) {
    if (isAllowed) {
      console.log("A");
      request(httpOptions, function(error, response, body) {
        if (error) {
          return res.json({
            "error": 1,
            "message": error,
          });
        }
        RateLimit.ThirdPartyAPIs.saveToRedisCache({
          "host": "restapiexample",
          "api": "employees"
        }, body).then(function() {
          return res.json({
            "error": 0,
            "message": "Success : This is sample API response.",
            "data": JSON.parse(body)
          });
        });
      });
    } else {
      console.log("B");
      RateLimit.ThirdPartyAPIs.loadFromRedisCache({
        "host": "restapiexample",
        "api": "employees"
      }).then(function(response) {
        //Serve the API for Local Cache
        return res.json({
          "error": 0,
          "message": "Success : This is sample API response.",
          "data": JSON.parse(response)
        });
      });
    }
  });
});

app.use(RateLimit.apply);
app.use('/api', router);

app.listen(3000);