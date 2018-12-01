const TaskScheduler = require('../services/TaskScheduler');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const moment = require('moment');

describe('TaskScheduler', () => {

    let client;
    let database;

    before(async () => {
        client = await MongoClient.connect('mongodb://localhost:27017', {
            useNewUrlParser: true
        });
        database = client.db('test');
    });

    after(async () => {
        await database.dropDatabase();
        await client.close();
    });

    describe('in memory scheduling', () => {

        let scheduler;

        beforeEach(async () => {
            scheduler = new TaskScheduler({database: database}, {
                scheduleWindowInMilliseconds: 500,
                databaseCheckIntervalInMilliseconds: 100
            });
            scheduler.start();
            await database.dropDatabase();
        });

        it('should schedule in memory and fire', () => {
            return new Promise((resolve, reject) => {
                scheduler.on('test', async (context) => {
                    assert.strictEqual(context, 'context', 'context should be the same');
                    const count = await database.collection('taskScheduler').countDocuments({
                        status: 'FIRED'
                    });
                    assert.strictEqual(count, 1, 'there should be one fired record');
                    resolve(true);
                });
                scheduler.fireAt('test', 'context', moment().valueOf() + 100);
            });
        });

        it('should schedule in database and fire', () => {
            return new Promise((resolve, reject) => {
                scheduler.on('test', async (context) => {
                    assert.strictEqual(context, 'context', 'context should be the same');
                    const count = await database.collection('taskScheduler').countDocuments({
                        status: 'FIRED'
                    });
                    assert.strictEqual(count, 1, 'there should be one fired record');
                    resolve(true);
                });
                scheduler.fireAt('test', 'context', moment().valueOf() + 1000);
            });
        });

        it('should roll back to CREATED status after closing', async () => {
            await scheduler.fireAt('test', 'context', moment().valueOf() + 100);
            await scheduler.fireAt('test', 'context', moment().valueOf() + 1000);
            await scheduler.close();
            const count = await database.collection('taskScheduler').countDocuments({
                status: 'CREATED'
            });
            assert.strictEqual(count, 2, 'all records should rollback to CREATED');
        });

        afterEach(async () => {
            await scheduler.close();
        });
    });


});
