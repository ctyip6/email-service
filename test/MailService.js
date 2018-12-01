const assert = require('assert');
const nodemailer = require('nodemailer');
const should = require('should');

const MailService = require('../services/MailService')

describe('emailService', () => {
    describe('sendMessage', () => {
        it('should send successfully', async () => {
            const mailService = new MailService({
                servers: [{
                    host: 'smtp.ethereal.email',
                    port: 587,
                    auth: {
                        user: 'qwitxz2ilncdotnf@ethereal.email',
                        pass: 'KGMCGkZPMpYRKtkQFU'
                    }
                }]
            });

            const message = {
                to: 'qwitxz2ilncdotnf@ethereal.email',
                subject: 'test',
                text: 'test'
            };

            const result = await mailService.send(message);
            console.log('Preview URL: ' + nodemailer.getTestMessageUrl(result));
            assert.ok(result);

            mailService.close();
        }).timeout(10000);

        it('should fail over successfully', async () => {
            const mailService = new MailService({
                servers: [
                    {
                        host: 'localhost',
                        port: 587,
                        auth: {
                            user: 'invalidUser',
                            pass: 'invalidPassword'
                        }
                    },
                    {
                        host: 'smtp.ethereal.email',
                        port: 587,
                        auth: {
                            user: 'qwitxz2ilncdotnf@ethereal.email',
                            pass: 'KGMCGkZPMpYRKtkQFU'
                        }
                    }
                ]
            });

            const message = {
                to: 'qwitxz2ilncdotnf@ethereal.email',
                subject: 'test',
                text: 'test'
            };

            const result = await mailService.send(message);
            console.log('Preview URL: ' + nodemailer.getTestMessageUrl(result));
            assert.ok(result);

            mailService.close();
        }).timeout(10000);


        it('should throw exception', async () => {
            const mailService = new MailService({
                servers: [
                    {
                        host: 'localhost',
                        port: 587,
                        auth: {
                            user: 'invalidUser',
                            pass: 'invalidPassword'
                        }
                    },
                    {
                        host: 'localhost',
                        port: 587,
                        auth: {
                            user: 'invalidUser',
                            pass: 'invalidPassword'
                        }
                    }
                ]
            });

            const message = {
                to: 'qwitxz2ilncdotnf@ethereal.email',
                subject: 'test',
                text: 'test'
            };

            return mailService.send(message).should.be.rejected().then(() => mailService.close());
        }).timeout(10000);
    });
});
