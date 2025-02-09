import {Storage} from './index.js';
import {RemoteSQL} from 'remote-sql';
import setupDB from '../schema/ts/db.sql.js';
import {sqlToStatements} from './utils.js';
import dropTables from '../schema/ts/drop.sql.js';
import {Subscription} from '../types.js';

type SubscriptionInDB = {
	address: string;
	domain: string;
	subscriptionID: string;
	subscription: string;
	timestamp: number;
	expiry: number | null;
};

export class RemoteSQLStorage implements Storage {
	constructor(private db: RemoteSQL) {}

	async recordSubscription(address: string, domain: string, subscription: Subscription): Promise<void> {
		const sqlStatement = `INSERT INTO Subscriptions (address, domain, subscriptionID, subscription, timestamp, expiry) 
		 VALUES(?1, ?2, ?3, ?4, UNIXTIMESTAMP(), ?5);`;
		const statement = this.db.prepare(sqlStatement);
		await statement
			.bind(
				address,
				domain,
				subscription.endpoint,
				JSON.stringify(subscription),
				subscription.expirationTime ? Math.floor(subscription.expirationTime / 1000) : null,
			)
			.all();
	}

	async getSubscriptions(address: string, domain: string): Promise<Subscription[]> {
		const statement = this.db.prepare(`SELECT * FROM Subscriptions WHERE address = ?1 AND domain = ?2;`);
		const {results} = await statement.bind(address, domain).all<SubscriptionInDB>();
		return results.map((v) => {
			return JSON.parse(v.subscription);
		});
	}

	async removeSubscription(address: string, domain: string, subscriptionID: string): Promise<void> {
		const statement = this.db.prepare(
			`DELETE * FROM Subscriptions WHERE address = ?1 AND domain = ?2 AND subscriptionID = ?3;`,
		);
		await statement.bind(address, domain, subscriptionID).all<Subscription>();
	}

	async getSubscription(address: string, domain: string, subscriptionID: string): Promise<Subscription | undefined> {
		const statement = this.db.prepare(
			`SELECT * FROM Subscriptions WHERE address = ?1 AND domain = ?2 AND subscriptionID = ?3;`,
		);
		const {results} = await statement.bind(address, domain, subscriptionID).all<SubscriptionInDB>();
		if (results.length === 0) {
			return undefined;
		}
		return JSON.parse(results[0].subscription);
	}

	async setup() {
		const statements = sqlToStatements(setupDB);
		// The following do not work on bun sqlite:
		//  (seems like prepared statement are partially executed and index cannot be prepared when table is not yet created)
		// await this.db.batch(statements.map((v) => this.db.prepare(v)));
		for (const statement of statements) {
			await this.db.prepare(statement).all();
		}
	}
	async reset() {
		const dropStatements = sqlToStatements(dropTables);
		const statements = sqlToStatements(setupDB);
		const allStatements = dropStatements.concat(statements);
		// The following do not work on bun sqlite:
		//  (seems like prepared statement are partially executed and index cannot be prepared when table is not yet created)
		// await this.db.batch(allStatements.map((v) => this.db.prepare(v)));
		for (const statement of allStatements) {
			await this.db.prepare(statement).all();
		}
	}
}
