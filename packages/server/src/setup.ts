import {MiddlewareHandler} from 'hono/types';
import {PushSender, ServerOptions} from './types.js';
import {Env} from './env.js';
import {RemoteSQLStorage} from './storage/RemoteSQLStorage.js';
import {webPushSender} from './web-push/sender.js';

export type SetupOptions = {
	serverOptions: ServerOptions;
};

export type Config = {
	storage: RemoteSQLStorage;
	env: Env;
	pushSender: PushSender;
};

declare module 'hono' {
	interface ContextVariableMap {
		config: Config;
	}
}

export function setup(options: SetupOptions): MiddlewareHandler {
	const {getDB, getEnv, getPushSender} = options.serverOptions;

	return async (c, next) => {
		const env = getEnv(c);

		const db = getDB(c);
		const storage = new RemoteSQLStorage(db);

		c.set('config', {
			storage,
			env,
			pushSender: (getPushSender ?? webPushSender)(env),
		});

		return next();
	};
}
