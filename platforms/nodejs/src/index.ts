import {createClient, type Client} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createServer, setupDatabase, type Env, type PushSender} from '@push-notification/server';

export type NodeServerOptions = {
	/** a libSQL URL (file:..., libsql://..., :memory:) or a client already made */
	db: string | Client;
	env: Env;
	/** Defaults to Web Push signed with env's VAPID keys. */
	getPushSender?: (env: Env) => PushSender;
};

/** The server's app over libSQL, its tables created: serve its `fetch`, or call its `request` in tests. */
export async function createNodeServer(options: NodeServerOptions) {
	const client = typeof options.db === 'string' ? createClient({url: options.db}) : options.db;
	const db = new RemoteLibSQL(client);
	await setupDatabase(db);
	return createServer({
		getDB: () => db,
		getEnv: () => options.env,
		getPushSender: options.getPushSender,
	});
}
