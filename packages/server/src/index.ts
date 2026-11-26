import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {ServerOptions} from './types.js';
import {hc} from 'hono/client';
import {HTTPException} from 'hono/http-exception';
import {Env} from './env.js';
import {getDummyAPI} from './api/dummy.js';
import {logs} from 'named-logs';
import {getAPI} from './api/index.js';
import {RemoteSQL} from 'remote-sql';
import {RemoteSQLStorage} from './storage/RemoteSQLStorage.js';

const logger = logs('push-notification-server');

export type {Env};
export type {ServerOptions, PushSender, PushSendResult, Subscription} from './types.js';
export type {
	Push,
	SubscriptionRegistration,
	SubscriptionRemoval,
	DeclarativePushNotification,
	PushResult,
	RegistrationResult,
	RemovalResult,
	SubscriptionCheck,
	SubscriptionAccounts,
	RegisteredCount,
	ErrorResult,
} from './api/index.js';

/** Creates the tables if they are not there (idempotent): what a platform runs before serving. */
export async function setupDatabase(db: RemoteSQL): Promise<void> {
	await new RemoteSQLStorage(db).setup();
}

const corsSetup = cors({
	origin: '*',
	allowHeaders: [
		'X-Custom-Header',
		'Upgrade-Insecure-Requests',
		'Content-Type',
		'SIGNATURE',
		'Authorization',
		'Idempotency-Key',
	],
	allowMethods: ['POST', 'GET', 'HEAD', 'OPTIONS'],
	exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
	maxAge: 600,
	credentials: true,
});

export function createServer(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>();

	const dummy = getDummyAPI(options);
	const api = getAPI(options);

	return app
		.use('/*', corsSetup)
		.route('/', dummy)
		.route('/api', api)
		.onError((err, c) => {
			const config = c.get('config');
			const env = config?.env || {};
			logger.error(err);
			if (err instanceof HTTPException) {
				if (err.res) {
					return err.getResponse();
				}
			}

			return c.json(
				{
					success: false,
					errors: [
						{
							name: 'name' in err ? err.name : undefined,
							code: 'code' in err ? err.code : 5000,
							status: 'status' in err ? err.status : undefined,
							message: err.message,
							cause: env.DEV ? err.cause : undefined,
							stack: env.DEV ? err.stack : undefined,
						},
					],
				},
				500,
			);
		});
}

export type App = ReturnType<typeof createServer>;

// this is a trick to calculate the type when compiling
const client = hc<App>('');
export type Client = typeof client;
export const createClient = (...args: Parameters<typeof hc>): Client => hc<App>(...args);
