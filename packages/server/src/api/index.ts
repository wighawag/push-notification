import {Context, Hono, MiddlewareHandler} from 'hono';
import {ServerOptions, Subscription} from '../types.js';
import {setup} from '../setup.js';
import {Env} from '../env.js';
import {logs} from 'named-logs';
import {fromDomainToOrigin, REQUEST_SIGNATURE_HEADER, verifyRequest} from 'delegated-identity';
import {authorizeDomain, bearerToken} from '../auth/tokens.js';
import {describe, validate} from '../validation.js';
import {
	AccountParamsSchema,
	PushResultSchema,
	PushSchema,
	RegisteredCountSchema,
	RegistrationResultSchema,
	RemovalResultSchema,
	SubscriptionCheckSchema,
	SubscriptionParamsSchema,
	SubscriptionRegistrationSchema,
	SubscriptionRemovalSchema,
} from '../schemas/index.js';
import type {
	ErrorResult,
	PushResult,
	RegisteredCount,
	RegistrationResult,
	RemovalResult,
	SubscriptionCheck,
} from './types.js';

export type * from './types.js';

const logger = logs('push-notification-server-api');

/** How long a request's claim on a delivery holds before a retry may take it over. */
const CLAIM_TIMEOUT_MS = 60_000;
/** How long an Idempotency-Key is remembered: a retry later than this delivers again. */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

function refuse(c: Context, status: 400 | 401 | 403, message: string) {
	const error: ErrorResult = {success: false, errors: [{message}]};
	return c.json(error, status);
}

const signatureHeader = {
	name: REQUEST_SIGNATURE_HEADER,
	description: "the delegate key's signature over the request envelope (see delegated-identity)",
	required: true,
};
const authorizationHeader = {name: 'Authorization', description: "`Bearer <the domain's token>`", required: true};
const idempotencyKeyHeader = {
	name: 'Idempotency-Key',
	description:
		'names the push, 1 to 256 characters: a retry with the same key reaches only the subscriptions not yet delivered',
	required: false,
};

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

/** The app origin a `domain` names: the key subscriptions, tokens and deliveries are stored under. */
const appOrigin = (domain: string) => fromDomainToOrigin(domain);

/** This server's public origin, as a request envelope names it: env PUBLIC_ORIGIN, else the request's. */
function serverOrigin(c: Context<{Bindings: Env}>) {
	return c.get('config').env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
}

function isExpired(subscription: Subscription, nowMS: number) {
	return !!subscription.expirationTime && subscription.expirationTime < nowMS;
}

/** The raw body, cached before the validator parses it: the request signature is over these bytes. */
const cacheRawBody: MiddlewareHandler = async (c, next) => {
	await c.req.text();
	await next();
};

/**
 * The two proofs of a signed request (see delegated-identity): the account it
 * speaks for and the app origin, or the refusal to answer with: 401 without a
 * signature or outside its minute, 400 malformed, 403 when the proofs do not
 * recover `address` for this server, route, body and app.
 */
async function proveAccount(
	c: Context<{Bindings: Env}>,
	claim: {address: string; domain: string; ownershipSignature: `0x${string}`},
): Promise<{address: string; origin: string} | Response> {
	const requestSignature = c.req.header(REQUEST_SIGNATURE_HEADER);
	if (!requestSignature) {
		return refuse(c, 401, `the ${REQUEST_SIGNATURE_HEADER} header is required`);
	}
	const url = new URL(c.req.url);
	const origin = appOrigin(claim.domain);
	const verified = await verifyRequest({
		serverOrigin: serverOrigin(c),
		method: c.req.method,
		path: url.pathname + url.search,
		body: await c.req.text(),
		signature: requestSignature,
		appOrigin: origin,
		address: claim.address,
		ownershipSignature: claim.ownershipSignature,
	});
	if (!verified.ok) {
		return verified.reason === 'malformed'
			? refuse(c, 400, 'a signature is malformed')
			: verified.reason === 'expired'
				? refuse(c, 401, 'the request signature is outside its time window: sign it again')
				: refuse(c, 403, `the proofs do not recover ${claim.address} on ${origin}`);
	}
	return {address: verified.address, origin};
}

export function getAPI(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>()
		.use(setup({serverOptions: options}))
		.post(
			'/register',
			describe({
				description: "Records the subscription for the account in the app, proven by the account's two signatures.",
				response: RegistrationResultSchema,
				refusals: [400, 401, 403],
				headers: [signatureHeader],
			}),
			cacheRawBody,
			validate('json', SubscriptionRegistrationSchema),
			async (c) => {
				const registration = c.req.valid('json');
				const proven = await proveAccount(c, registration);
				if (proven instanceof Response) {
					return proven;
				}
				await c.get('config').storage.recordSubscription(proven.address, proven.origin, registration.subscription);
				const result: RegistrationResult = {success: true, registered: true};
				return c.json(result);
			},
		)
		.post(
			'/unregister',
			describe({
				description:
					'Removes the subscription (its endpoint) registered for the account in the app, proven as /register is.',
				response: RemovalResultSchema,
				refusals: [400, 401, 403],
				headers: [signatureHeader],
			}),
			cacheRawBody,
			validate('json', SubscriptionRemovalSchema),
			async (c) => {
				const removal = c.req.valid('json');
				const proven = await proveAccount(c, removal);
				if (proven instanceof Response) {
					return proven;
				}
				const storage = c.get('config').storage;
				const existed = !!(await storage.getSubscription(proven.address, proven.origin, removal.endpoint));
				await storage.removeSubscriptionOf(proven.address, proven.origin, removal.endpoint);
				const result: RemovalResult = {success: true, unregistered: existed};
				return c.json(result);
			},
		)
		.get(
			'/registered/:address/:domain/:subscriptionID',
			describe({
				description: 'Whether the subscription (its endpoint, URL-encoded) is registered for the account in the app.',
				response: SubscriptionCheckSchema,
			}),
			validate('param', SubscriptionParamsSchema),
			async (c) => {
				const config = c.get('config');
				const storage = config.storage;
				const params = c.req.valid('param');

				const address = params.address.toLowerCase();
				const domain = appOrigin(params.domain);
				const subscriptionID = params.subscriptionID;

				const subscription = await storage.getSubscription(address, domain, subscriptionID);
				const result: SubscriptionCheck = {success: true, registered: !!subscription};
				return c.json(result);
			},
		)
		.get(
			'/registered/:address/:domain',
			describe({
				description: "How many live subscriptions the account has in the app, for the domain's service (its token).",
				response: RegisteredCountSchema,
				refusals: [401, 403],
				headers: [authorizationHeader],
			}),
			validate('param', AccountParamsSchema),
			async (c) => {
				const params = c.req.valid('param');
				const domain = appOrigin(params.domain);
				const refused = await authorize(c, domain);
				if (refused) {
					return refused;
				}
				const storage = c.get('config').storage;
				const count = await storage.countLiveSubscriptions(params.address.toLowerCase(), domain, Date.now());
				const result: RegisteredCount = {success: true, registered: count > 0, count};
				return c.json(result);
			},
		)
		.post(
			'/push',
			describe({
				description:
					"Sends the notification to the account's live subscriptions in the app, for the domain's service (its token).",
				response: PushResultSchema,
				refusals: [400, 401, 403],
				alsoAnswer: [409, 502],
				headers: [authorizationHeader, idempotencyKeyHeader],
			}),
			validate('json', PushSchema),
			async (c) => {
				const config = c.get('config');
				const storage = config.storage;
				const push = c.req.valid('json');
				const refused = await authorize(c, appOrigin(push.domain));
				if (refused) {
					return refused;
				}
				const address = push.address.toLowerCase();
				const domain = appOrigin(push.domain);
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
				// the message as sent, unknown keys included (see PushSchema), not the schema's output
				const asSent: {message: unknown} = await c.req.json();
				const payload = JSON.stringify(asSent.message);
				const subscriptions = await storage.getSubscriptions(address, domain);
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
							domain,
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
							await storage.markDelivered(address, domain, key, subscriptionID);
						}
						continue;
					}
					if (key) {
						await storage.releaseDelivery(address, domain, key, subscriptionID);
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
			},
		);

	return app;
}
