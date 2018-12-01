const EventEmitter = require('events');
const moment = require('moment');
const ObjectID = require('mongodb').ObjectID;
const bunyan = require('bunyan');

const logger = bunyan.createLogger({
    serializers: bunyan.stdSerializers,
    name: 'TaskScheduler',
    level: 'TRACE'
});

const defaultConfig = {
    // the window size for scheduling the task in memory (all task with "exec time < current time + window" will be scheduled in memory using setTimeout)
    scheduleWindowInMilliseconds: 10 * 60 * 1000,
    // the time interval for checking database and schedule tasks to memory
    databaseCheckIntervalInMilliseconds: 5 * 60 * 1000
};

const collection = 'taskScheduler';

class TaskScheduler extends EventEmitter {

    constructor(databaseProvider, config) {
        super();
        this.config = Object.assign({}, defaultConfig);
        if (config) {
            this.config = Object.assign(this.config, config);
        }
        this.databaseProvider = databaseProvider;
        this.timeout = new Map();
        this.active = false;
        logger.info({config: config}, 'taskScheduler created');
    }

    get database() {
        return this.databaseProvider.database;
    }

    start() {
        if (!this.active) {
            logger.debug('task scheduler starts');
            this.active = true;

            this._loadFromDatabase(new Date(moment().valueOf() + this.config.scheduleWindowInMilliseconds));
            this.loadDatabaseTimer = setInterval(() => {
                this._loadFromDatabase(new Date(moment().valueOf() + this.config.scheduleWindowInMilliseconds));
            }, this.config.databaseCheckIntervalInMilliseconds);
        } else {
            logger.debug('task scheduler has already started');
        }
    }

    /**
     * to fire the specified 'event' with context at the given timestamp
     * @param {string} event the name of the event
     * @param {object} context
     * @param {number}timestampInMilliseconds
     * @returns {Promise<void>} A promise which resolves when the record is properly inserted into the database
     */
    async fireAt(event, context, timestampInMilliseconds) {
        const record = {
            event: event,
            context: context,
            triggerTime: new Date(timestampInMilliseconds),
            status: 'CREATED'
        };
        logger.trace(record, 'taskScheduler.fireAt triggered');

        const insertResult = await this.database.collection(collection).insertOne(record);
        if (insertResult.result.ok) {
            const id = insertResult.insertedId.toHexString();
            logger.debug({id: id}, 'taskScheduler record created');

            const timeDiff = timestampInMilliseconds - moment().valueOf();
            if (this.active && timeDiff < this.config.scheduleWindowInMilliseconds) {
                this._loadFromDatabase(new Date(timestampInMilliseconds));
            }
            return id;
        } else {
            logger.error({
                record: record,
                result: insertResult.result
            }, 'invalid taskScheduler record insert result');
        }
    }

    async _loadFromDatabase(scheduleWindow) {
        logger.trace({
            scheduleWindow: scheduleWindow
        }, 'loadFromDatabase triggered');

        try {
            const result = await this.database.collection(collection).findOneAndUpdate({
                status: 'CREATED',
                triggerTime: {
                    $lte: scheduleWindow
                }
            }, {
                $set: {
                    status: 'SCHEDULED'
                }
            });

            if (result.ok && result.value) {
                const record = result.value;
                const id = record._id.toHexString();

                logger.debug({id: id}, 'scheduling task from database to memory');

                this._scheduleSingleEventToMemory(id, record.event, record.context, record.triggerTime.getTime());

                if (this.active) {
                    this._loadFromDatabase(scheduleWindow);
                }
            }
        } catch (err) {
            logger.error({err: err}, 'failed to load task from database');
        }
    }


    _scheduleSingleEventToMemory(id, event, context, triggerTimestampInMilliseconds) {
        const delay = triggerTimestampInMilliseconds - moment().valueOf();
        this.timeout.set(id, setTimeout(async () => {
            const result = await this.database.collection(collection).findOneAndUpdate({
                _id: ObjectID.createFromHexString(id),
                status: 'SCHEDULED'
            }, {
                $set: {
                    status: 'FIRED'
                }
            });
            if (result.ok) {
                logger.debug({id: id, event: event}, 'fire event');
                this.emit(event, context);
            } else {
                logger.error({id: id}, 'failed to update scheduled record to fired');
            }

        }, delay));
    }

    close() {
        logger.trace('shutting down taskScheduler');
        if (this.active) {
            this.active = false;

            clearInterval(this.loadDatabaseTimer);
            this.loadDatabaseTimer = null;

            const results = [];
            const ids = [];
            this.timeout.forEach((value, key, map) => {
                clearTimeout(value);
                results.push(this.database.collection(collection).findOneAndUpdate({
                    _id: ObjectID.createFromHexString(key),
                    status: 'SCHEDULED'
                }, {
                    $set: {
                        status: 'CREATED'
                    }
                }));
                ids.push(key);
                map.delete(key);
            });

            logger.debug({ids: ids}, 'taskScheduler closes');
            return Promise.all(results);
        } else {
            logger.debug('taskScheduler has already closed');
            return Promise.resolve();
        }
    }

}

module.exports = TaskScheduler;
