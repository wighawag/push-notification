import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {ServerOptions} from './types.js';
import {hc} from 'hono/client';
import {HTTPException} from 'hono/http-exception';
import {Env} from './env.js';
import {getDummyAPI} from './api/dummy.js';
import {logs} from 'named-logs';
import {getAPI} from './api/index.js';

const logger = logs('push-notification-server-app');

export type {Env};

const corsSetup = cors({
	origin: '*',
	allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type', 'SIGNATURE'],
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
