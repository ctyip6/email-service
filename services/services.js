const MailService = require('./MailService');
const nconf = require('nconf');

module.exports = {
    mailService: new MailService(nconf.get('mail'))
};

