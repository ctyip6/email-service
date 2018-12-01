const MailService = require('./MailService');
const TaskScheduler = require('./TaskScheduler');
const nconf = require('nconf');
const mongoDB = require('./mongodb');


module.exports = {
    mailService: new MailService(nconf.get('mail')),
    taskScheduler: new TaskScheduler(mongoDB, nconf.get('scheduler'))
};

