import {Subscription} from '../types.js';
import {Urgency} from '../web-push/types.js';

// The API's request and response types: the source of truth. Each is validated (or
// described) by a zod schema in ../schemas pinned to it with `schemaFor`, exact identity.

/**
 * POST /register's body. The request carries two proofs (see delegated-identity):
 * the SIGNATURE header, the delegate key's signature over the request envelope
 * (this server's origin, `POST /api/register`, a timestamp, this raw body);
 * and `ownershipSignature`, the wallet's signature over the publication message
 * naming that delegate key for the app's origin. The subscription is recorded
 * for `address` only if both recover it.
 *
 * `domain` is the app: a bare host (`game.example`, meaning
 * `https://game.example`; `localhost:5173`, meaning `http://`) or an origin.
 * Everything is keyed by the origin it names.
 */
export type SubscriptionRegistration = {
	/** the account (wallet) address, the key notifications are addressed by */
	address: string;
	domain: string;
	subscription: Subscription;
	ownershipSignature: `0x${string}`;
};

/**
 * POST /unregister's body, signed as /register is: removes the subscription
 * (its endpoint) registered for `address` in the app, so a device stops
 * receiving the account's notifications (a logout, an account switch).
 */
export type SubscriptionRemoval = {
	address: string;
	domain: string;
	endpoint: string;
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

/** POST /register's answer. */
export type RegistrationResult = {success: boolean; registered: boolean};

/** POST /unregister's answer: `unregistered` is false when nothing was registered. */
export type RemovalResult = {success: boolean; unregistered: boolean};

/** GET /registered/:address/:domain/:subscriptionID's answer: whether that subscription is registered. */
export type SubscriptionCheck = {success: boolean; registered: boolean};

/** GET /registered/:address/:domain's answer (token-authenticated): the account's live subscriptions in the app. */
export type RegisteredCount = {success: boolean; registered: boolean; count: number};

/** The path of GET /registered/:address/:domain. `domain` is a bare host or an origin, as in the bodies. */
export type AccountParams = {address: string; domain: string};

/** The path of GET /registered/:address/:domain/:subscriptionID (the subscription's endpoint). */
export type SubscriptionParams = {address: string; domain: string; subscriptionID: string};

/**
 * Every refusal's body: an invalid body or path (400), a missing or stale
 * proof or token (401), a proof or token for something else (403).
 */
export type ErrorResult = {success: false; errors: {message: string}[]};
