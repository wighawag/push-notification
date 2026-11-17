import {Context, Hono} from 'hono';
import {ServerOptions, Subscription} from '../types.js';
import {setup} from '../setup.js';
import {Env} from '../env.js';
import {typiaValidator} from '@hono/typia-validator';
import {createValidate} from 'typia';
import {logs} from 'named-logs';
import {REQUEST_SIGNATURE_HEADER, verifyRequest} from 'missiv-identity';
import {Urgency} from '../web-push/types.js';
import {authorizeDomain, bearerToken} from '../auth/tokens.js';

const logger = logs('push-notification-service-server-api');

/** How long a request's claim on a delivery holds before a retry may take it over. */
const CLAIM_TIMEOUT_MS = 60_000;
/** How long an Idempotency-Key is remembered: a retry later than this delivers again. */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/**
 * POST /register's body. The request carries two proofs (see missiv-identity):
 * the SIGNATURE header, the delegate key's signature over this raw body; and
 * `ownershipSignature`, the wallet's signature over the publication message
 * naming that delegate key for the domain's origin. The subscription is
 * recorded for `address` only if both recover it.
 */
export type SubscriptionRegistration = {
	/** the account (wallet) address, the key notifications are addressed by */
	address: string;
	domain: string;
	subscription: Subscription;
	ownershipSignature: `0x${string}`;
};

type NotificationAction = {
	action: string;
	title: string;
	navigate: string;
	icon?: string;
};
export type DeclarativePushNotification = {
	web_push: 8030;
	notification: {
		title: string;
		navigate: string;
		dir?: NotificationDirection;
		lang?: string;
		body?: string;
		tag?: string;
		image?: string;
		icon?: string;
		badge?: string;
		vibrate?: number[];
		timestamp?: number;
		renotify?: boolean;
		silent?: boolean;
		requireInteraction?: boolean;
		data?: Record<string, unknown>;
		actions?: NotificationAction[];
	};
	app_badge?: number;
	mutable?: boolean;
};

/**
 * POST /push's body, sent with `Authorization: Bearer <the domain's token>`
 * and, by a caller that retries, an `Idempotency-Key` header naming the push.
 */
export type Push = {
	address: string;
	domain: string;
	message: DeclarativePushNotification;
	topic?: string;
	urgency?: Urgency;
};

/**
 * POST /push's answer: 200 when every live subscription has the push, 502 when
 * a send failed (retry with the same key), 409 when another request with the
 * same key is still sending (retry later).
 */
export type PushResult = {
	success: boolean;
	/** subscriptions this call delivered to */
	delivered: number;
	/** subscriptions an earlier call with the same Idempotency-Key delivered to */
	alreadyDelivered: number;
	/** subscriptions another call with the same key is delivering to right now */
	inFlight: number;
	/** subscriptions whose send failed */
	failed: number;
	/** subscriptions removed: expired, or gone at the push service (404, 410) */
	removed: number;
};

function refuse(c: Context, status: 400 | 401 | 403, message: string) {
	return c.json({success: false, errors: [{message}]}, status);
}

async function authorize(c: Context<{Bindings: Env}>, domain: string) {
	const config = c.get('config');
	const authorization = await authorizeDomain(
		config.env.PUSH_TOKENS,
		bearerToken(c.req.header('Authorization')),
		domain,
	);
	if (authorization === 'unauthenticated') {
		return refuse(c, 401, 'a token for the domain is required');
	}
	if (authorization === 'forbidden') {
		return refuse(c, 403, `the token is not for domain ${domain}`);
	}
	return undefined;
}

function isExpired(subscription: Subscription, nowMS: number) {
	return !!subscription.expirationTime && subscription.expirationTime < nowMS;
}

export function getAPI(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>()
		.use(setup({serverOptions: options}))
		.post(
			'/register',
			// the raw body, cached before the validator parses it: the request signature is over these bytes
			async (c, next) => {
				await c.req.text();
				await next();
			},
			typiaValidator('json', createValidate<SubscriptionRegistration>()),
			async (c) => {
				const config = c.get('config');
				const storage = config.storage;
				const registration = c.req.valid('json');

				const requestSignature = c.req.header(REQUEST_SIGNATURE_HEADER);
				if (!requestSignature) {
					return refuse(c, 401, `the ${REQUEST_SIGNATURE_HEADER} header is required`);
				}
				const verified = await verifyRequest({
					domain: registration.domain,
					body: await c.req.text(),
					requestSignature,
					address: registration.address,
					ownershipSignature: registration.ownershipSignature,
				});
				if (!verified.ok) {
					return verified.reason === 'malformed'
						? refuse(c, 400, 'a signature is malformed')
						: refuse(c, 403, `the proofs do not recover ${registration.address} on ${registration.domain}`);
				}

				await storage.recordSubscription(verified.address, registration.domain, registration.subscription);
				return c.json({success: true, registered: true});
			},
		)
		.get('/registered/:address/:domain/:subscriptionID', async (c) => {
			const config = c.get('config');
			const storage = config.storage;

			const address = c.req.param('address').toLowerCase();
			const domain = c.req.param('domain');
			const subscriptionID = c.req.param('subscriptionID');

			const subscription = await storage.getSubscription(address, domain, subscriptionID);
			return c.json({success: true, registered: !!subscription});
		})
		.get('/registered/:address/:domain', async (c) => {
			const domain = c.req.param('domain');
			const refused = await authorize(c, domain);
			if (refused) {
				return refused;
			}
			const storage = c.get('config').storage;
			const count = await storage.countLiveSubscriptions(c.req.param('address').toLowerCase(), domain, Date.now());
			return c.json({success: true, registered: count > 0, count});
		})
		.post('/push', typiaValidator('json', createValidate<Push>()), async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const push = c.req.valid('json');
			const refused = await authorize(c, push.domain);
			if (refused) {
				return refused;
			}
			const address = push.address.toLowerCase();
			const key = c.req.header('Idempotency-Key');
			if (key !== undefined && (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH)) {
				return refuse(c, 400, `an Idempotency-Key has 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
			}

			const now = Date.now();
			if (key) {
				await storage.pruneDeliveries(now - DELIVERY_RETENTION_MS);
			}

			const result: PushResult = {
				success: false,
				delivered: 0,
				alreadyDelivered: 0,
				inFlight: 0,
				failed: 0,
				removed: 0,
			};
			const payload = JSON.stringify(push.message);
			const subscriptions = await storage.getSubscriptions(address, push.domain);
			for (const subscription of subscriptions) {
				const subscriptionID = subscription.endpoint;
				if (isExpired(subscription, now)) {
					await storage.removeSubscription(subscriptionID);
					result.removed++;
					continue;
				}
				if (key) {
					const claim = await storage.claimDelivery(
						address,
						push.domain,
						key,
						subscriptionID,
						now,
						now - CLAIM_TIMEOUT_MS,
					);
					if (claim === 'delivered') {
						result.alreadyDelivered++;
						continue;
					}
					if (claim === 'in-flight') {
						result.inFlight++;
						continue;
					}
				}

				const sent = await config.pushSender(subscription, payload, {urgency: push.urgency, topic: push.topic});
				if (sent.ok) {
					result.delivered++;
					if (key) {
						await storage.markDelivered(address, push.domain, key, subscriptionID);
					}
					continue;
				}
				if (key) {
					await storage.releaseDelivery(address, push.domain, key, subscriptionID);
				}
				if (sent.status === 410 || sent.status === 404) {
					// the push service no longer knows the subscription
					await storage.removeSubscription(subscriptionID);
					result.removed++;
				} else {
					logger.error(`Could not push (${sent.status}): ${sent.body}`);
					result.failed++;
				}
			}

			result.success = result.failed === 0 && result.inFlight === 0;
			return c.json(result, result.failed > 0 ? 502 : result.inFlight > 0 ? 409 : 200);
		});

	return app;
}
