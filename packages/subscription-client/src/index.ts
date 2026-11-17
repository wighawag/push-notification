// The browser side of push-notification-service-server: a store of whether the
// current account receives push notifications on this device, and the actions
// that change it. It subscribes the service worker with the server's VAPID key,
// registers the subscription for the account (both proofs, missiv-identity),
// and unregisters it.
//
// It is a Svelte-compatible store (sveltore), so a Svelte app reads it with `$`
// and any other code with `subscribe`; its inputs are stores of the same shape.

import {derived, writable, type Readable} from 'sveltore';
import {
	delegatePublicKey,
	fromDomainToOrigin,
	originPublicKeyPublicationMessage,
	REQUEST_SIGNATURE_HEADER,
	signRequest,
} from 'missiv-identity';

/** The account notifications are addressed to, and the delegate key the app holds for it. */
export type PushAccount =
	| {
			/** the wallet address */
			address: string;
			/** the delegate key, which signs each request */
			delegatePrivateKey: `0x${string}`;
			/**
			 * The wallet's signature over the publication message for this
			 * delegate key and app origin, if the app already has it (as
			 * `@etherplay/connect` does); else `signOwnership` is asked.
			 */
			ownershipSignature?: `0x${string}`;
	  }
	| undefined;

export type PushStatus =
	/** this browser has no service worker or no Push API */
	| 'unsupported'
	/** no account (or no service worker registration yet) */
	| 'no-account'
	| 'loading'
	/** the user refused notifications for this site */
	| 'denied'
	/** this browser has no push subscription */
	| 'off'
	/** a push subscription exists, not registered for this account */
	| 'unregistered'
	/** the account receives push notifications on this device */
	| 'on';

export type PushState = {
	status: PushStatus;
	/** an action (enable, disable) is running */
	busy: boolean;
	/** the last action's failure, until acknowledged */
	error?: unknown;
};

export type PushNotificationsOptions = {
	/** the server's API root, e.g. `https://push.example/api` */
	serverEndpoint: string;
	/** the server's VAPID public key (base64url) */
	vapidPublicKey: string;
	/** the app: a bare host (`game.example`) or an origin, as the server's tokens name it */
	domain: string;
	account: Readable<PushAccount>;
	/** the service worker registration, once registered */
	serviceWorker: Readable<ServiceWorkerRegistration | undefined>;
	/** the wallet signing the publication message, when the account carries no ownershipSignature */
	signOwnership?: (address: string, message: string) => Promise<`0x${string}`>;
	fetch?: typeof fetch;
	/** the notification permission; defaults to `Notification.permission` */
	permission?: () => NotificationPermission | undefined;
	/** whether this browser has service workers and the Push API; defaults to feature detection */
	supported?: () => boolean;
};

export type PushNotifications = Readable<PushState> & {
	/** Subscribes this browser if needed and registers it for the account (may prompt for permission). */
	enable(): Promise<void>;
	/** Unregisters this browser for the account; other accounts registered here keep theirs. */
	disable(): Promise<void>;
	/** Checks again with the browser and the server. */
	refresh(): void;
	acknowledgeError(): void;
};

function base64UrlToBytes(base64Url: string): Uint8Array {
	const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

export function createPushNotifications(options: PushNotificationsOptions): PushNotifications {
	const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
	const permission = options.permission ?? (() => globalThis.Notification?.permission);
	const supported =
		options.supported ??
		(() => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in globalThis);
	const appOrigin = fromDomainToOrigin(options.domain);

	const state = writable<PushState>({status: 'loading', busy: false});
	let current: PushState = {status: 'loading', busy: false};
	function set(next: Partial<PushState>) {
		current = {...current, ...next};
		state.set(current);
	}

	let account: PushAccount;
	let registration: ServiceWorkerRegistration | undefined;
	// a check started for an account or registration that changed since answers nothing
	let generation = 0;

	async function ownershipSignatureOf(of: NonNullable<PushAccount>): Promise<`0x${string}`> {
		if (of.ownershipSignature) {
			return of.ownershipSignature;
		}
		if (!options.signOwnership) {
			throw new Error('the account has no ownershipSignature and no signOwnership was given');
		}
		return options.signOwnership(
			of.address,
			originPublicKeyPublicationMessage(appOrigin, delegatePublicKey(of.delegatePrivateKey)),
		);
	}

	async function signedPost(route: 'register' | 'unregister', of: NonNullable<PushAccount>, payload: object) {
		const url = new URL(`${options.serverEndpoint}/${route}`);
		const body = JSON.stringify({
			address: of.address,
			domain: options.domain,
			...payload,
			ownershipSignature: await ownershipSignatureOf(of),
		});
		const signature = await signRequest(
			{serverOrigin: url.origin, method: 'POST', path: url.pathname, body},
			of.delegatePrivateKey,
		);
		const response = await doFetch(url.toString(), {
			method: 'POST',
			headers: {'Content-Type': 'application/json', [REQUEST_SIGNATURE_HEADER]: signature},
			body,
		});
		if (!response.ok) {
			throw new Error(`${route} failed (${response.status}): ${await response.text()}`);
		}
		return response.json();
	}

	async function isRegistered(of: NonNullable<PushAccount>, subscription: PushSubscription): Promise<boolean> {
		const response = await doFetch(
			`${options.serverEndpoint}/registered/${of.address}/${encodeURIComponent(options.domain)}/${encodeURIComponent(subscription.endpoint)}`,
		);
		if (!response.ok) {
			throw new Error(`registered check failed (${response.status})`);
		}
		return (await response.json()).registered === true;
	}

	async function check() {
		const mine = ++generation;
		if (!supported()) {
			set({status: 'unsupported'});
			return;
		}
		if (!account || !registration) {
			set({status: 'no-account'});
			return;
		}
		if (!registration.pushManager) {
			set({status: 'unsupported'});
			return;
		}
		set({status: 'loading'});
		try {
			const subscription = await registration.pushManager.getSubscription();
			let status: PushStatus;
			if (!subscription) {
				status = permission() === 'denied' ? 'denied' : 'off';
			} else {
				status = (await isRegistered(account, subscription)) ? 'on' : 'unregistered';
			}
			if (mine === generation) {
				set({status});
			}
		} catch (error) {
			if (mine === generation) {
				set({status: 'unregistered', error});
			}
		}
	}

	async function act(action: (of: NonNullable<PushAccount>, on: ServiceWorkerRegistration) => Promise<void>) {
		const of = account;
		const on = registration;
		if (!of || !on || !on.pushManager) {
			throw new Error('no account or no service worker');
		}
		set({busy: true, error: undefined});
		try {
			await action(of, on);
		} catch (error) {
			set({error});
		} finally {
			set({busy: false});
			if (account === of && registration === on) {
				await check();
			}
		}
	}

	const store = derived(
		[options.account, options.serviceWorker, state] as const,
		([$account, $registration, $state], _set) => {
			if ($account !== account || $registration !== registration) {
				account = $account;
				registration = $registration;
				// not from inside the derived store's own update: its set would be lost
				queueMicrotask(() => void check());
			}
			_set($state);
		},
		current,
	);

	return {
		subscribe: store.subscribe,
		async enable() {
			await act(async (of, on) => {
				let subscription = await on.pushManager.getSubscription();
				if (!subscription) {
					subscription = await on.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: base64UrlToBytes(options.vapidPublicKey) as BufferSource,
					});
				}
				await signedPost('register', of, {subscription: subscription.toJSON()});
			});
		},
		async disable() {
			await act(async (of, on) => {
				const subscription = await on.pushManager.getSubscription();
				if (subscription) {
					await signedPost('unregister', of, {endpoint: subscription.endpoint});
				}
			});
		},
		refresh() {
			void check();
		},
		acknowledgeError() {
			set({error: undefined});
		},
	};
}
