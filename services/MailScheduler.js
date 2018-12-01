const bunyan = require('bunyan');

const triggerSendEvent = 'triggerSendEvent';
const logger = bunyan.createLogger({
    name: 'MailScheduler'
});

class MailScheduler {

    /**
     * @constructor
     * @param {TaskScheduler} taskScheduler
     * @param {MailService} mailService
     */
    constructor(taskScheduler, mailService) {
        this.taskScheduler = taskScheduler;
        this.mailService = mailService;
        taskScheduler.on(triggerSendEvent, this.onTriggerSend.bind(this));
    }

    /**
     * Send email at specified timestamp
     *
     * @param mail please refer to the message configuration of nodemailer. Field "from" should be omitted as it will be replace by the mail server configuration.
     * @param {number} timestampInMilliseconds the specified timestamp
     */
    async sendMailAt(mail, timestampInMilliseconds) {
        return await this.taskScheduler.fireAt(triggerSendEvent, mail, timestampInMilliseconds);
    }

    async onTriggerSend(mail) {
        try {
            await this.mailService.send(mail);
        } catch (err) {
            // TODO proper handling for failed email
            logger.error({err: err}, 'failed to send email');
        }
    }
}

module.exports = MailScheduler;
