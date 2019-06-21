const redis = require('redis')
const redisClient = redis.createClient()
const moment = require('moment');
const Promise = require('bluebird');
const MAX_LIMIT = {
  "SECOND": 50,
  "HOUR": 1000,
  "MONTH": 20000
};

let RateLimit = {
  apply: (req, res, next) => {
    if (req.headers.user) {
      redisClient.exists(req.headers.user, (err, reply) => {
        if (err) {
          console.log("Server Unreachable : Redis server is not working.");
          return res.json({
            "error": 1,
            "message": "Server Unreachable : Redis server is not working."
          });
        }
        if (reply === 1) {
          //User Already Exist : Check for API Usage
          redisClient.get(req.headers.user, (err, data) => {
            let userAPIUsageData = JSON.parse(data);
            let isAllowRequest = true;
            if (userAPIUsageData.currentPeriod.month == new Date().getMonth() + 1 && userAPIUsageData.currentPeriod.year == new Date().getFullYear()) {
              if (userAPIUsageData.limitInMonth <= 0) {
                console.log("API Limit Exceeded : Your monthly API usage quota has been consumed.");
                return res.json({
                  "error": 1,
                  "message": "API Limit Exceeded : Your monthly API usage quota has been consumed."
                });
                isAllowRequest = false;
              } else {
                userAPIUsageData.limitInMonth--;
              }
            } else {
              userAPIUsageData.limitInMonth = MAX_LIMIT.MONTH;
              userAPIUsageData.currentPeriod.month = new Date().getMonth() + 1;
              userAPIUsageData.currentPeriod.year = new Date().getFullYear();
            }

            let currentTime = moment().unix()
            let differenceInSeconds = (currentTime - userAPIUsageData.recentUsageTime);
            let differenceInHours = (currentTime - userAPIUsageData.recentUsageTime) / 3600;
            if (differenceInSeconds >= 1) {
              let newUsageData = userAPIUsageData;
              newUsageData.countInSecond = 1;
              newUsageData.countInHour = userAPIUsageData.countInHour ? userAPIUsageData.countInHour : 1;
              newUsageData.recentUsageTime = moment().unix();
              redisClient.set(req.headers.user, JSON.stringify(newUsageData));
            }
            if (differenceInHours >= 1) {
              let newUsageData = userAPIUsageData;
              newUsageData.countInSecond = userAPIUsageData.countInSecond ? userAPIUsageData.countInSecond : 1;
              newUsageData.countInHour = 1;
              newUsageData.recentUsageTime = moment().unix();
              redisClient.set(req.headers.user, JSON.stringify(newUsageData));
            }

            if (differenceInSeconds < 1) {
              if (userAPIUsageData.countInSecond >= MAX_LIMIT.SECOND) {
                console.log("API Limit Exceeded : Your are allowed to use max 50 API per second.");
                return res.json({
                  "error": 1,
                  "message": "API Limit Exceeded : Your are allowed to use max 50 API per second."
                });
                isAllowRequest = false;
              }
              //Update the count and allow the request
              userAPIUsageData.countInSecond++
              redisClient.set(req.headers.user, JSON.stringify(userAPIUsageData));
            }

            if (differenceInHours < 1) {
              if (userAPIUsageData.countInHour >= MAX_LIMIT.HOUR) {
                console.log("API Limit Exceeded : Your are allowed to use max 1000 API per hour.");
                return res.json({
                  "error": 1,
                  "message": "API Limit Exceeded : Your are allowed to use max 1000 API per hour."
                });
                isAllowRequest = false;
              }
              //Update the count and allow the request
              userAPIUsageData.countInHour++
              redisClient.set(req.headers.user, JSON.stringify(userAPIUsageData));
            }
            if (isAllowRequest)
              next();
          });
        } else {
          //User Not Exist : Add User Analytics to Redis For Tracking Usage
          let body = {
            'countInSecond': 1,
            'countInHour': 1,
            'limitInMonth': MAX_LIMIT.MONTH,
            'currentPeriod': {
              "year": new Date().getFullYear(),
              "month": new Date().getMonth() + 1
            },
            'recentUsageTime': moment().unix()
          }
          redisClient.set(req.headers.user, JSON.stringify(body))
          //Allow to Access the APIs
          next()
        }
      });
    } else {
      console.log("Unauthorized Access : You are not allowed to access this API. Required headers are missing.");
      return res.json({
        "error": 1,
        "message": "Unauthorized Access : You are not allowed to access this API. Required headers are missing."
      });
    }
  },
  ThirdPartyAPIs: {
    trackRequest: (requestBody) => {
      let promise = new Promise(function(resolve, reject) {
        let isAllowed = true;
        let APIIdentityKey = requestBody.host + "_@_" + requestBody.api;
        redisClient.exists(APIIdentityKey, (err, reply) => {
          if (reply === 1) {
            console.log("X");
            redisClient.get(APIIdentityKey, (err, data) => {
              console.log("P");
              let trackUsage = JSON.parse(data);
              let currentTime = moment().unix()
              let differenceInSeconds = (currentTime - trackUsage.recentUsageTime) / 60;
              trackUsage.recentUsageTime = moment().unix();
              if (differenceInSeconds > 1) {
                trackUsage.countInSecond = 1;
              } else {
                trackUsage.countInSecond++;
                if (trackUsage.countInSecond >= 5) {
                  isAllowed = false;
                }
              }
              console.log("isAllowed", isAllowed);
              redisClient.set(APIIdentityKey, JSON.stringify(trackUsage));
              return resolve(isAllowed);
            });
          } else {
            console.log("Y");
            let body = {
              'countInSecond': 1,
              'recentUsageTime': moment().unix()
            }
            redisClient.set(APIIdentityKey, JSON.stringify(body));
            return resolve(isAllowed);
          }
        });
      });
      return promise;
    },
    loadFromRedisCache: (requestBody) => {
      let promise = new Promise(function(resolve, reject) {
        let APIIdentityKey = requestBody.host + "_@_" + requestBody.api + "_@_Data";
        redisClient.get(APIIdentityKey, (err, data) => {
          if (err) {
            resolve("");
          } else {
            resolve(JSON.parse(data));
          }
        });
      });
      return promise;
    },
    saveToRedisCache: (requestBody, body) => {
      let promise = new Promise(function(resolve, reject) {
        let APIIdentityKey = requestBody.host + "_@_" + requestBody.api + "_@_Data";
        redisClient.set(APIIdentityKey, JSON.stringify(body));
        resolve(body);
      });
      return promise;
    }
  }
};
module.exports = RateLimit;