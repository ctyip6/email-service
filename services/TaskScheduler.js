const EventEmitter = require('events');
const moment = require('moment');
const ObjectID = require('mongodb').ObjectID;
const bunyan = require('bunyan');
const nconf = require('nconf');

const logger = bunyan.createLogger({
    serializers: bunyan.stdSerializers,
    name: 'TaskScheduler',
    level: nconf.get('logger:level') || 'info'
});

const defaultConfig = {
    // the window size for scheduling the task in memory (all task with "exec time < current time + window" will be scheduled in memory using setTimeout)
    scheduleWindowInMilliseconds: 10 * 60 * 1000,
    // the time interval for checking database and schedule tasks to memory
    databaseCheckIntervalInMilliseconds: 5 * 60 * 1000
};

const collection = 'taskScheduler';

/**
 * Database backed scheduler, it accepts request for emitting an event at a specified timestamp. Each request consists of the following info
 * 1. event
 * 2. context
 * 3. trigger timestamp
 * The task scheduler will then emit the specified event with the context at the timestamp provided.
 *
 * Upon receiving the request, the task scheduler stores in database. With a configurable time interval, it checks the database and load the events within a time window to in-memory timer.
 * As all events are stored in database, the event can remain even if the server shuts down or restarts. The regular check prevents busy reading from database at each second or millisecond.
 */
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

    /**
     * starts the scheduling, if the scheduler is not started, it will only store the events to database without triggering them
     */
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
     * to scheduler an event and fire it with context at the given timestamp
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
                await this._loadFromDatabase(new Date(timestampInMilliseconds));
            }
            return id;
        } else {
            logger.error({
                record: record,
                result: insertResult.result
            }, 'invalid taskScheduler record insert result');
        }
    }

    /**
     * Internal method for checking if there is an event within the schedule window and load it to in-memory timer if exists
     * @param {Date} scheduleWindow for checking if there are any events in database to be emitted before the specified time
     * @returns {Promise<void>} resolve when one event is scheduled or no available events found.
     * @private
     */
    async _loadFromDatabase(scheduleWindow) {
        logger.trace({
            scheduleWindow: scheduleWindow
        }, 'loadFromDatabase triggered');

        try {
            // check from database
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

            if (result.ok && result.value) { // record found
                const record = result.value;
                const id = record._id.toHexString();

                logger.debug({id: id}, 'scheduling task from database to memory');

                // schedule the event to in memory time
                this._scheduleSingleEventToMemory(id, record.event, record.context, record.triggerTime.getTime());

                if (this.active) {
                    // check and schedule the next event if exists
                    this._loadFromDatabase(scheduleWindow);
                }
            }
        } catch (err) {
            logger.error({err: err}, 'failed to load task from database');
        }
    }


    /**
     * schedule one event to in-memory timer
     * @param {string} id the database record id, for marking the record as fired upon emit or rollback to created status when closing the scheduler
     * @param {string} event the event name
     * @param context arbitrary data to be fired with the event
     * @param {number} triggerTimestampInMilliseconds the timestamp at which the event to be fired
     * @private
     */
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

    /**
     * stop the in-memory timer and rollback the status of the events which schedule to in-memory but not yet triggered.
     * @returns {*}
     */
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
