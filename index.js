

"use strict";

const log4js = require('log4js');
const config = require('config');
const pk = require('./package.json');
const MongoClient = require('mongodb').MongoClient;

const port = 5000;

// LOGGER
log4js.configure({
  appenders: {
    out: { type: 'stdout' },
    app: { type: 'file', filename: 'webserver.log' }
  },
  categories: {
    default: { appenders: [ 'out'], level: 'debug' },
    production: { appenders: [ 'app'], level: 'info', pm2: true}
  }
});

if(!process.env.NODE_ENV){process.env.NODE_ENV='development'};

let logger;
let conf;
if(process.env.NODE_ENV == 'development'){
  logger = log4js.getLogger();
  conf = config.get('development');
} else {
  logger = log4js.getLogger('production');
  conf = config.get('production');
}
let now = new Date(Date.now());
logger.info(pk.name,pk.version,". Start at: ", now.toLocaleDateString('ca-ES'));
logger.info('NODE_ENV: ',process.env.NODE_ENV);
logger.info('Logger Level: ', logger.level.levelStr);
logger.debug("Config: ",conf);

//MONGODB
let db;
const mongodbclient = new MongoClient(conf.mongodb.url,{useNewUrlParser: true});
mongodbclient.connect(function(error,client){
  if(error){
    logger.error(error);
  }

  if(client){
    logger.info('MongoDB connected');
    db = client.db(conf.mongodb.dbname);
    db.on('error', function(error){logger.error(error);return;});
    db.on('timeout', function(error){logger.error(error.message);return;});
    db.on('reconnect', function(error){logger.info('MongoDB reconnected');return;});
    //let collection = db.collection('endesa');
  }
});

// EXPRESS
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();

app.use(cors());
app.use(helmet());

app.listen(port, () => {
  logger.info('WEBServer at port ', port);
});

//  *************************************************************************
// API
//
// /data/endesa?
//
// ******************************
// t =     h --> Horari
//         d --> Total per dies
//         m --> Total per mesos
//         y --> Total per anys
//         s --> Estadístics
// ******************************
// q = [param:value] on <param> pot ser d,m,y
// per exemple: Total per dies per l'any 2019
//
// q = "y":2019
// ******************************
// EXEMPLE
// /data/endesa?t=d&q="y":2017

// Consulta per un període de dates a la consulta per hores
// /data/endesa?t=h&d1="data inici"&d2="data final"

// EXPRESS ROUTER
const router = express.Router();
let q=null;
let p=null;
router.get('/data/endesa', (req, res) => {

  //MongoDB query
  let collection=null;

  switch(req.query.t){
    case 'h':
      collection = db.collection('endesa_byHours');
      if(req.query.d1 && req.query.d2){
        q = {
              date:{
                $gte:new Date(((new Date(req.query.d1)).toISOString())),
                $lte:new Date(((new Date(req.query.d2)).toISOString()))
              }
            };
      }
      break;
    case 'hp':
      collection = db.collection('endesa_byHours');
      p = {projection:{dd:0,y:0,m:0,d:0}};
      if(req.query.d1 && req.query.d2){
        q = {
              date:{
                $gte:new Date(((new Date(req.query.d1)).toISOString())),
                $lte:new Date(((new Date(req.query.d2)).toISOString()))
              }
            };
      }
      break;
    case 'd':
      collection = db.collection('endesa_byDay');
      break;
    case 'm':
      collection = db.collection('endesa_byMonth');
      break;
    case 'y':
      collection = db.collection('endesa_byYear');
      break;

    case 's':
      collection=db.collection('endesa_stats');
      break;

    default:
      collection=null;
      res.status(400).send('Bad Request');
      break;
  }

  if(collection){
    collection.find(q,p).toArray(function(error, docs) {
      if(error){
        logger.error(error);
        res.status(400).send('Bad Request');
      }
      res.json(docs);
      p = null;
      q = null;
    });
  }
});
app.use('/', router);
