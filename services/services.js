const MailService = require('./MailService');
const TaskScheduler = require('./TaskScheduler');
const MailScheduler = require('./MailScheduler');
const nconf = require('nconf');
const mongoDB = require('./mongodb');

/*
This file is for declaring application-wide singleton service
 */

const mailService = new MailService(nconf.get('mail'));
const taskScheduler = new TaskScheduler(mongoDB, nconf.get('scheduler'));
const mailScheduler = new MailScheduler(taskScheduler, mailService);

module.exports = {
    mailService: mailService,
    taskScheduler: taskScheduler,
    mailScheduler: mailScheduler
};

