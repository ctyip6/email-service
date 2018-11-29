var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
const bunyan = require('bunyan');
const nconf = require('nconf');

nconf.env({
    lowerCase: true,
    parseValues: true,
    separator: '_'
});

var indexRouter = require('./routes/index');
const mailRouter = require('./routes/mail');

var app = express();

const logger = bunyan.createLogger({name: 'app'});

app.use(morgan('combined', {
    stream: {
        write(message) {
            logger.info(message);
        }
    }
}));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/mails', mailRouter);

module.exports = app;
