const mailService = require('../services/services').mailService;
const express = require('express');
const bunyan = require('bunyan');
const router = express.Router();

const logger = bunyan.createLogger({
    name: 'mail'
});

router.post('/', (req, res, next) => {
    mailService.send(req.body)
        .then(info => logger.info(info))
        .catch(err => logger.info(err));
    res.status(202).send();
});

module.exports = router;
