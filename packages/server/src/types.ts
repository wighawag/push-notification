import {Context} from 'hono';
import {RemoteSQL} from 'remote-sql';
import {Env} from './env.js';
import {Urgency} from './web-push/types.js';

export type Subscription = {
	endpoint: string;
	/** when the push service expires it, in milliseconds since the epoch (a DOMHighResTimeStamp) */
	expirationTime: number | null;
	keys: {p256dh: string; auth: string};
};

/** What a push service answered: `ok` for a 2xx, `status` 0 when it could not be reached. */
export type PushSendResult = {ok: boolean; status: number; body?: string};

/** Delivers one payload to one subscription (Web Push in production, a recording double in tests). */
export type PushSender = (
	subscription: Subscription,
	payload: string,
	options: {topic?: string; urgency?: Urgency},
) => Promise<PushSendResult>;

export type ServerOptions = {
	getDB: (c: Context<{Bindings: Env}>) => RemoteSQL;
	getEnv: (c: Context<{Bindings: Env}>) => Env;
	/** Defaults to Web Push signed with the env's VAPID keys. */
	getPushSender?: (env: Env) => PushSender;
};
