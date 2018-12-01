const mailScheduler = require('../services/services').mailScheduler;
const {validationResult, body} = require('express-validator/check');
const validator = require('validator');
const express = require('express');
const bunyan = require('bunyan');
const router = express.Router();
const nconf = require('nconf');


const logger = bunyan.createLogger({
    name: 'mail',
    serializers: bunyan.stdSerializers,
    level: nconf.get('logger:level') || 'info'
});

function requestBodyToMessage(body) {
    const message = {};
    ['to', 'cc', 'bcc', 'subject', 'text', 'html'].forEach(field => {
        if (body[field]) {
            message[field] = body[field];
        }
    });
    return message;
}

/**
 * Accepting email for scheduling
 */
router.post('/', [
    body('to')
        .isArray()
        .custom(to => to.length > 0 && to.every(v => validator.isEmail(v, {allow_display_name: true}))),
    body('subject')
        .isString(),
    body('timestamp')
        .exists({checkNull: true, checkFalsy: true})
        .custom(timestamp => Number.isSafeInteger(timestamp)),
    body(['cc', 'bcc'])
        .optional()
        .isArray()
        .custom(cc => cc.every(v => validator.isEmail(v, {allow_display_name: true}))),
    body(['text', 'html'])
        .optional()
        .isString(),
], async (req, res, next) => {
    // request validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({errors: errors.array()});
    }

    const message = requestBodyToMessage(req.body);
    try {
        // schedule the email
        const taskId = await mailScheduler.sendMailAt(message, req.body.timestamp);
        return res.status(200).json({taskId: taskId});
    } catch (err) {
        logger.error({message: message, err: err}, 'failed to schedule email');
        next(err);
    }
});

module.exports = router;
