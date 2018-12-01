const nodemailer = require('nodemailer');
const bunyan = require('bunyan');
const nconf = require('nconf');

const logger = bunyan.createLogger({
    name: 'emailService',
    serializers: bunyan.stdSerializers,
    level: nconf.get('logger:level') || 'info'
});

class SendMailError extends Error {

    constructor(message, sendErrors, ...params) {
        super(...params);
        this.message = message;
        this.sendErrors = sendErrors;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, SendEmailError);
        }
    }

}

/**
 * Class responsible for sending emails
 */
class MailService {

    /**
     * the config MUST contain the following fields
     *
     * 1. servers: a list in which each element represents one nodemailer transport configuration.
     * MailService will create a list of transports according to the configuration. The transport will be used in the exact order of the list.
     *
     * @param mailServerConfigs the configuration object
     */
    constructor(mailServerConfigs) {
        this.mailServerConfigs = Object.assign({}, mailServerConfigs);
        this.transports = mailServerConfigs.servers.map(config => {
            return nodemailer.createTransport(Object.assign({}, config, {logger: logger, pool: true}));
        });
    }

    /**
     * Send email using the mail servers specified in the configuration. All configured mail servers will be tried one by one until the email is successfully sent.
     * @param message the email message, please refer to the message configuration for the data structure.
     * @returns {Promise<any>} resolve when one of the mail server accepted the email, reject when no servers accept the mail.
     */
    async send(message) {
        const error = [];

        // for each mail server
        for (let i = 0; i < this.transports.length; ++i) {
            try {
                const result = await this.sendByTransport(
                    Object.assign({}, message, {from: this.mailServerConfigs.servers[i].sender}),
                    this.transports[i]
                );
                // return the result and stop trying the next mail server
                return result;
            } catch (err) {
                logger.warn(err);
                error.push(err);
            }
        }
        throw new SendMailError(message, error, 'failed to send email');
    }

    /**
     * close all operating transport
     */
    close() {
        this.transports.forEach(t => t.close());
    }

    /**
     * Send email with the specified mail server transport
     * @param message the nodemailer message
     * @param transport nodemailer transport
     * @returns {Promise<any>} resolve when the mail is successfully sent, reject otherwise.
     */
    sendByTransport(message, transport) {
        return new Promise((resolve, reject) => {
            transport.sendMail(message, (err, info) => {
                if (err) {
                    reject({
                        err: err,
                        info: info
                    });
                } else {
                    resolve(info);
                }
            });
        });
    }

}

module.exports = MailService;
