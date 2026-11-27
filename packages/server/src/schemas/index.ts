import {z} from 'zod';
import {schemaFor} from 'zod-schema-for';
import type {Subscription} from '../types.js';
import type {
	AccountParams,
	DeclarativePushNotification,
	EndpointParams,
	ErrorResult,
	Push,
	PublicKeySet,
	PushResult,
	RegisteredCount,
	RegistrationResult,
	RemovalResult,
	SubscriptionAccounts,
	SubscriptionCheck,
	SubscriptionParams,
	SubscriptionRegistration,
	SubscriptionRemoval,
} from '../api/types.js';
import type {Urgency} from '../web-push/types.js';

// The TypeScript types (../api/types.ts, ../types.ts) are the source of truth: every
// schema here is pinned to one with `schemaFor` (exact identity, not assignability), so a
// schema that drifts from its type, by a key or a narrowed value, does not compile.
//
// Acceptance is that of the compile-time validators these replace (up to 0.1.0): the same
// required and optional keys, the same primitive types, `0x${string}` checked for its
// prefix only. One difference: unknown keys are stripped (zod's default) where those let
// them through; see `PushSchema` for the one place that would matter.

export {schemaFor};

// ------------------------------------------------------------------------------------------------
// Primitives
// ------------------------------------------------------------------------------------------------

/**
 * A `0x`-prefixed string, as 0.1.0 checked the template literal (`/^0x(.*)/`): no hex or
 * length check, no change of case. A malformed signature is delegated-identity's to
 * refuse (400 "a signature is malformed"), as before.
 */
export const OwnershipSignatureSchema = schemaFor<`0x${string}`>()(z.templateLiteral(['0x', z.string()]));

/**
 * A key, `0x`-prefixed, checked for its prefix only like a signature: a key that is not 32
 * bytes of hex is delegated-identity's to refuse (400 "a signature is malformed").
 */
const KeySchema = z.templateLiteral(['0x', z.string()]);

export const PublicKeySetSchema = schemaFor<PublicKeySet>()(
	z.object({
		signing: z.object({publicKey: KeySchema}),
		encryption: z.object({publicKey: KeySchema}),
	}),
);

export const UrgencySchema = schemaFor<Urgency>()(z.enum(['low', 'normal', 'high']));

export const NotificationDirectionSchema = schemaFor<NotificationDirection>()(z.enum(['auto', 'ltr', 'rtl']));

// ------------------------------------------------------------------------------------------------
// Request bodies
// ------------------------------------------------------------------------------------------------

export const SubscriptionSchema = schemaFor<Subscription>()(
	z.object({
		endpoint: z.string(),
		expirationTime: z.number().nullable(),
		keys: z.object({p256dh: z.string(), auth: z.string()}),
	}),
);

export const SubscriptionRegistrationSchema = schemaFor<SubscriptionRegistration>()(
	z.object({
		address: z.string(),
		domain: z.string(),
		subscription: SubscriptionSchema,
		keySet: PublicKeySetSchema,
		ownershipSignature: OwnershipSignatureSchema,
		replaceOtherAccounts: z.boolean().optional(),
	}),
);

export const SubscriptionRemovalSchema = schemaFor<SubscriptionRemoval>()(
	z.object({
		address: z.string(),
		domain: z.string(),
		endpoint: z.string(),
		keySet: PublicKeySetSchema,
		ownershipSignature: OwnershipSignatureSchema,
	}),
);

export const DeclarativePushNotificationSchema = schemaFor<DeclarativePushNotification>()(
	z.object({
		web_push: z.literal(8030),
		notification: z.object({
			title: z.string(),
			navigate: z.string(),
			dir: NotificationDirectionSchema.optional(),
			lang: z.string().optional(),
			body: z.string().optional(),
			tag: z.string().optional(),
			image: z.string().optional(),
			icon: z.string().optional(),
			badge: z.string().optional(),
			vibrate: z.array(z.number()).optional(),
			timestamp: z.number().optional(),
			renotify: z.boolean().optional(),
			silent: z.boolean().optional(),
			requireInteraction: z.boolean().optional(),
			data: z.record(z.string(), z.unknown()).optional(),
			actions: z
				.array(
					z.object({
						action: z.string(),
						title: z.string(),
						navigate: z.string(),
						icon: z.string().optional(),
					}),
				)
				.optional(),
		}),
		app_badge: z.number().optional(),
		mutable: z.boolean().optional(),
	}),
);

/**
 * POST /push's body. It validates the message, but the handler forwards the message AS
 * SENT (the parsed JSON, not this schema's output) to the push services: 0.1.0 let unknown
 * keys through, and stripping them would silently drop fields of the Declarative Web Push
 * format this type does not list yet.
 */
export const PushSchema = schemaFor<Push>()(
	z.object({
		address: z.string(),
		domain: z.string(),
		message: DeclarativePushNotificationSchema,
		topic: z.string().optional(),
		urgency: UrgencySchema.optional(),
	}),
);

// ------------------------------------------------------------------------------------------------
// Path parameters (never refused: a path segment is always a string; described for OpenAPI)
// ------------------------------------------------------------------------------------------------

export const AccountParamsSchema = schemaFor<AccountParams>()(z.object({address: z.string(), domain: z.string()}));

export const EndpointParamsSchema = schemaFor<EndpointParams>()(
	z.object({domain: z.string(), subscriptionID: z.string()}),
);

export const SubscriptionParamsSchema = schemaFor<SubscriptionParams>()(
	z.object({address: z.string(), domain: z.string(), subscriptionID: z.string()}),
);

// ------------------------------------------------------------------------------------------------
// Responses (described for OpenAPI)
// ------------------------------------------------------------------------------------------------

export const RegistrationResultSchema = schemaFor<RegistrationResult>()(
	z.object({success: z.boolean(), registered: z.boolean(), replacedAccounts: z.array(z.string())}),
);

export const RemovalResultSchema = schemaFor<RemovalResult>()(
	z.object({success: z.boolean(), unregistered: z.boolean()}),
);

export const SubscriptionCheckSchema = schemaFor<SubscriptionCheck>()(
	z.object({success: z.boolean(), registered: z.boolean()}),
);

export const SubscriptionAccountsSchema = schemaFor<SubscriptionAccounts>()(
	z.object({success: z.boolean(), accounts: z.array(z.string())}),
);

export const RegisteredCountSchema = schemaFor<RegisteredCount>()(
	z.object({success: z.boolean(), registered: z.boolean(), count: z.number()}),
);

export const PushResultSchema = schemaFor<PushResult>()(
	z.object({
		success: z.boolean(),
		delivered: z.number(),
		alreadyDelivered: z.number(),
		inFlight: z.number(),
		failed: z.number(),
		removed: z.number(),
	}),
);

export const ErrorResultSchema = schemaFor<ErrorResult>()(
	z.object({success: z.literal(false), errors: z.array(z.object({message: z.string()}))}),
);
