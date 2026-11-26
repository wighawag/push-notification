import {REQUEST_SIGNATURE_HEADER} from 'delegated-identity';
import {
	AccountParamsSchema,
	EndpointParamsSchema,
	PushResultSchema,
	PushSchema,
	RegisteredCountSchema,
	RegistrationResultSchema,
	RemovalResultSchema,
	SubscriptionAccountsSchema,
	SubscriptionCheckSchema,
	SubscriptionParamsSchema,
	SubscriptionRegistrationSchema,
	SubscriptionRemovalSchema,
} from '../schemas/index.js';

// The API's routes as data: their path, the schemas validating their body or path, and
// what the OpenAPI document says of them. `getAPI` validates with these schemas and
// `generateOpenAPIDocument` (../openapi.ts, the `./openapi` export) describes them, so the
// server's runtime never imports the OpenAPI generator (it would put hono-openapi's
// JSON-schema converters in every bundle, a Cloudflare worker included).

export type Header = {name: string; description: string; required: boolean};

const signatureHeader: Header = {
	name: REQUEST_SIGNATURE_HEADER,
	description: "the delegate key's signature over the request envelope (see delegated-identity)",
	required: true,
};
const authorizationHeader: Header = {
	name: 'Authorization',
	description: "`Bearer <the domain's token>`",
	required: true,
};
const idempotencyKeyHeader: Header = {
	name: 'Idempotency-Key',
	description:
		'names the push, 1 to 256 characters: a retry with the same key reaches only the subscriptions not yet delivered',
	required: false,
};

export const apiRoutes = {
	register: {
		method: 'post',
		path: '/register',
		description:
			"Records the subscription for the account in the app, proven by the account's two signatures. With `replaceOtherAccounts`, the same transaction removes the endpoint's registrations for every other account of the app (one account per device).",
		json: SubscriptionRegistrationSchema,
		response: RegistrationResultSchema,
		refusals: [400, 401, 403],
		headers: [signatureHeader],
	},
	unregister: {
		method: 'post',
		path: '/unregister',
		description:
			'Removes the subscription (its endpoint) registered for the account in the app, proven as /register is.',
		json: SubscriptionRemovalSchema,
		response: RemovalResultSchema,
		refusals: [400, 401, 403],
		headers: [signatureHeader],
	},
	subscriptionCheck: {
		method: 'get',
		path: '/registered/:address/:domain/:subscriptionID',
		description: 'Whether the subscription (its endpoint, URL-encoded) is registered for the account in the app.',
		param: SubscriptionParamsSchema,
		response: SubscriptionCheckSchema,
	},
	subscriptionAccounts: {
		method: 'get',
		path: '/accounts/:domain/:subscriptionID',
		description:
			'The accounts the subscription (its endpoint, URL-encoded) is registered for in the app, so the app can say which account a device is notified for.',
		param: EndpointParamsSchema,
		response: SubscriptionAccountsSchema,
	},
	registeredCount: {
		method: 'get',
		path: '/registered/:address/:domain',
		description: "How many live subscriptions the account has in the app, for the domain's service (its token).",
		param: AccountParamsSchema,
		response: RegisteredCountSchema,
		refusals: [401, 403],
		headers: [authorizationHeader],
	},
	push: {
		method: 'post',
		path: '/push',
		description:
			"Sends the notification to the account's live subscriptions in the app, for the domain's service (its token).",
		json: PushSchema,
		response: PushResultSchema,
		refusals: [400, 401, 403],
		/** statuses answering `response` too */
		alsoAnswer: [409, 502],
		headers: [authorizationHeader, idempotencyKeyHeader],
	},
} as const;
