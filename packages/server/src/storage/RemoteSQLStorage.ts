import {DeliveryClaim, Storage} from './index.js';
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

	async recordSubscription(
		address: string,
		domain: string,
		subscription: Subscription,
		options: {replaceOtherAccounts?: boolean} = {},
	): Promise<{replacedAccounts: string[]}> {
		const record = this.db
			.prepare(
				`INSERT INTO Subscriptions (address, domain, subscriptionID, subscription, timestamp, expiry)
		 VALUES(?1, ?2, ?3, ?4, UNIXEPOCH(), ?5)
		 ON CONFLICT (address, domain, subscriptionID) DO UPDATE SET
		 subscription = excluded.subscription, timestamp = excluded.timestamp, expiry = excluded.expiry;`,
			)
			.bind(
				address,
				domain,
				subscription.endpoint,
				JSON.stringify(subscription),
				subscription.expirationTime ? Math.floor(subscription.expirationTime / 1000) : null,
			);
		if (!options.replaceOtherAccounts) {
			await record.all();
			return {replacedAccounts: []};
		}
		// one batch, one transaction (libSQL's and D1's batch): the device never
		// belongs to two accounts, nor to none, as another request sees it
		const removeOthers = this.db
			.prepare(
				`DELETE FROM Subscriptions WHERE domain = ?1 AND subscriptionID = ?2 AND address != ?3 RETURNING address;`,
			)
			.bind(domain, subscription.endpoint, address);
		const [removed] = await this.db.batch<{address: string}>([removeOthers, record]);
		return {replacedAccounts: removed.results.map((row) => String(row.address)).sort()};
	}

	async getAccountsOf(domain: string, subscriptionID: string): Promise<string[]> {
		const statement = this.db.prepare(
			`SELECT address FROM Subscriptions WHERE domain = ?1 AND subscriptionID = ?2 ORDER BY address;`,
		);
		const {results} = await statement.bind(domain, subscriptionID).all<{address: string}>();
		return results.map((row) => String(row.address));
	}

	async getSubscriptions(address: string, domain: string): Promise<Subscription[]> {
		const statement = this.db.prepare(`SELECT * FROM Subscriptions WHERE address = ?1 AND domain = ?2;`);
		const {results} = await statement.bind(address, domain).all<SubscriptionInDB>();
		return results.map((v) => {
			return JSON.parse(v.subscription);
		});
	}

	async removeSubscription(subscriptionID: string): Promise<void> {
		const statement = this.db.prepare(`DELETE FROM Subscriptions WHERE subscriptionID = ?1;`);
		await statement.bind(subscriptionID).all<Subscription>();
	}

	async removeSubscriptionOf(address: string, domain: string, subscriptionID: string): Promise<void> {
		const statement = this.db.prepare(
			`DELETE FROM Subscriptions WHERE address = ?1 AND domain = ?2 AND subscriptionID = ?3;`,
		);
		await statement.bind(address, domain, subscriptionID).all();
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

	async countLiveSubscriptions(address: string, domain: string, nowMS: number): Promise<number> {
		const statement = this.db.prepare(
			`SELECT COUNT(*) AS count FROM Subscriptions WHERE address = ?1 AND domain = ?2 AND (expiry IS NULL OR expiry > ?3);`,
		);
		const {results} = await statement.bind(address, domain, Math.floor(nowMS / 1000)).all<{count: number}>();
		return Number(results[0]?.count ?? 0);
	}

	async claimDelivery(
		address: string,
		domain: string,
		key: string,
		subscriptionID: string,
		nowMS: number,
		staleBeforeMS: number,
	): Promise<DeliveryClaim> {
		const claim = this.db.prepare(
			`INSERT INTO Deliveries (address, domain, idempotencyKey, subscriptionID, delivered, claimedAt)
			 VALUES (?1, ?2, ?3, ?4, 0, ?5)
			 ON CONFLICT (address, domain, idempotencyKey, subscriptionID) DO UPDATE SET claimedAt = excluded.claimedAt
			 WHERE Deliveries.delivered = 0 AND Deliveries.claimedAt < ?6
			 RETURNING delivered;`,
		);
		const {results} = await claim.bind(address, domain, key, subscriptionID, nowMS, staleBeforeMS).all();
		if (results.length > 0) {
			return 'claimed';
		}
		const existing = this.db.prepare(
			`SELECT delivered FROM Deliveries WHERE address = ?1 AND domain = ?2 AND idempotencyKey = ?3 AND subscriptionID = ?4;`,
		);
		const found = await existing.bind(address, domain, key, subscriptionID).all<{delivered: number}>();
		return Number(found.results[0]?.delivered) === 1 ? 'delivered' : 'in-flight';
	}

	async markDelivered(address: string, domain: string, key: string, subscriptionID: string): Promise<void> {
		const statement = this.db.prepare(
			`UPDATE Deliveries SET delivered = 1 WHERE address = ?1 AND domain = ?2 AND idempotencyKey = ?3 AND subscriptionID = ?4;`,
		);
		await statement.bind(address, domain, key, subscriptionID).all();
	}

	async releaseDelivery(address: string, domain: string, key: string, subscriptionID: string): Promise<void> {
		const statement = this.db.prepare(
			`DELETE FROM Deliveries WHERE address = ?1 AND domain = ?2 AND idempotencyKey = ?3 AND subscriptionID = ?4 AND delivered = 0;`,
		);
		await statement.bind(address, domain, key, subscriptionID).all();
	}

	async pruneDeliveries(beforeMS: number): Promise<void> {
		await this.db.prepare(`DELETE FROM Deliveries WHERE claimedAt < ?1;`).bind(beforeMS).all();
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
