const MongoClient = require('mongodb').MongoClient;
const nconf = require('nconf');

const url = nconf.get('mongodb:url');
const database = nconf.get('mongodb:database');

class MongoDB {

    constructor(url, database) {
        this.url = url;
        this.dbName = database;
    }

    async connect() {
        this.client = await MongoClient.connect(url, {
            useNewUrlParser: true
        });
        this.database = this.client.db(this.dbName);
        return this;
    }

    async close() {
        return await this.client.close();
    }

}

module.exports = new MongoDB(url, database);

