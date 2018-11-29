const nodemailer = require('nodemailer');
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
    name: 'emailService',
    level: 'trace'
});

class SendMailError extends Error {

    constructor(message, sendErrors, ...params) {
        // Pass remaining arguments (including vendor specific ones) to parent constructor
        super(...params);
        this.message = message;
        this.sendErrors = sendErrors;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, SendEmailError);
        }
    }

}

class MailService {

    constructor(mailServerConfigs) {
        this.mailServerConfigs = Object.assign({}, mailServerConfigs.servers);
        this.transports = {};
        for (const [name, config] of Object.entries(this.mailServerConfigs)) {
            logger.info(`config = ${JSON.stringify(config)}`);
            config.logger = logger;
            config.pool = true;
            this.transports[name] = nodemailer.createTransport(config);
        }
    }

    async send(message) {
        const error = {};
        for (let name in this.transports) {
            try {
                const result = await this.sendByTransport(
                    Object.assign({}, message, {from: this.mailServerConfigs[name].sender}),
                    this.transports[name]
                );
                return result;
            } catch (err) {
                logger.warn(err);
                error[name] = err;
            }
        }
        throw new SendMailError(message, error, 'failed to send email');
    }

    close() {
        for (const [name, transport] of Object.entries(this.transports)) {
            transport.close();
        }
    }

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
