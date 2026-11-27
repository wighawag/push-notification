// The browser side of @push-notification/server: a store of whether the
// current account receives push notifications on this device, and the actions
// that change it. It subscribes the service worker with the server's VAPID key,
// registers the subscription for the account (both proofs, delegated-identity),
// and unregisters it.
//
// It is a Svelte-compatible store (sveltore), so a Svelte app reads it with `$`
// and any other code with `subscribe`; its inputs are stores of the same shape.

import {derived, writable, type Readable} from 'sveltore';
import {
	fromDomainToOrigin,
	originPublicKeyPublicationMessage,
	REQUEST_SIGNATURE_HEADER,
	signRequest,
	type Key,
	type KeyPair,
} from 'delegated-identity';

/** The account notifications are addressed to, and the key set the app holds for it. */
export type PushAccount =
	| {
			/** the wallet address */
			address: string;
			/**
			 * The account's key set in the app, as `@etherplay/connect` derives
			 * it from the origin key (a delegated-identity `KeySet` fits): its
			 * Ed25519 signing private key signs each request; only the two public
			 * keys are sent. The encryption key's private half is not needed.
			 */
			keySet: {signing: KeyPair; encryption: {publicKey: Key}};
			/**
			 * The wallet's signature over the publication message for this key
			 * set and app origin, if the app already has it (as
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
	/**
	 * The OTHER accounts (lowercased) this device's subscription is registered
	 * for in this app, so the app can say "this device is notified for 0x..."
	 * and offer to switch it (`enable({replaceOtherAccounts: true})`). Empty
	 * when none; undefined while unknown: no account or subscription checked
	 * yet, or a server older than `GET /accounts` (0.2.0).
	 */
	otherAccounts?: string[];
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
	/**
	 * One account per device: `enable()` registers with `replaceOtherAccounts`,
	 * so the server removes this device's registrations for the app's other
	 * accounts in the same transaction, and a device switched to another
	 * account stops receiving the previous one's notifications. Default false:
	 * a device may be registered for several accounts, each notified.
	 */
	replaceOtherAccounts?: boolean;
};

export type EnableOptions = {
	/** overrides the store's `replaceOtherAccounts` for this call */
	replaceOtherAccounts?: boolean;
};

export type PushNotifications = Readable<PushState> & {
	/**
	 * Subscribes this browser if needed and registers it for the account (may
	 * prompt for permission); with `replaceOtherAccounts` (this call's, else the
	 * store's), the device leaves the app's other accounts.
	 */
	enable(options?: EnableOptions): Promise<void>;
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
		return options.signOwnership(of.address, originPublicKeyPublicationMessage(appOrigin, of.keySet));
	}

	async function signedPost(route: 'register' | 'unregister', of: NonNullable<PushAccount>, payload: object) {
		const url = new URL(`${options.serverEndpoint}/${route}`);
		const body = JSON.stringify({
			address: of.address,
			domain: options.domain,
			...payload,
			// the public keys only: never the private halves the account carries
			keySet: {
				signing: {publicKey: of.keySet.signing.publicKey},
				encryption: {publicKey: of.keySet.encryption.publicKey},
			},
			ownershipSignature: await ownershipSignatureOf(of),
		});
		const signature = await signRequest(
			{serverOrigin: url.origin, method: 'POST', path: url.pathname, body},
			of.keySet.signing.privateKey,
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

	/** The accounts the subscription is registered for in the app, or undefined from a server without the route. */
	async function accountsOf(subscription: PushSubscription): Promise<string[] | undefined> {
		const response = await doFetch(
			`${options.serverEndpoint}/accounts/${encodeURIComponent(options.domain)}/${encodeURIComponent(subscription.endpoint)}`,
		);
		if (response.status === 404) {
			return undefined;
		}
		if (!response.ok) {
			throw new Error(`accounts check failed (${response.status})`);
		}
		const {accounts} = (await response.json()) as {accounts?: unknown};
		return Array.isArray(accounts) ? accounts.map((account) => String(account).toLowerCase()) : undefined;
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
			set({status: 'no-account', otherAccounts: undefined});
			return;
		}
		if (!registration.pushManager) {
			set({status: 'unsupported', otherAccounts: undefined});
			return;
		}
		set({status: 'loading', otherAccounts: undefined});
		try {
			const subscription = await registration.pushManager.getSubscription();
			let status: PushStatus;
			let otherAccounts: string[] | undefined;
			if (!subscription) {
				status = permission() === 'denied' ? 'denied' : 'off';
				otherAccounts = [];
			} else {
				const accounts = await accountsOf(subscription);
				if (accounts) {
					const me = account.address.toLowerCase();
					status = accounts.includes(me) ? 'on' : 'unregistered';
					otherAccounts = accounts.filter((other) => other !== me);
				} else {
					status = (await isRegistered(account, subscription)) ? 'on' : 'unregistered';
				}
			}
			if (mine === generation) {
				set({status, otherAccounts});
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
		async enable(enableOptions?: EnableOptions) {
			const replaceOtherAccounts = enableOptions?.replaceOtherAccounts ?? options.replaceOtherAccounts ?? false;
			await act(async (of, on) => {
				let subscription = await on.pushManager.getSubscription();
				if (!subscription) {
					subscription = await on.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: base64UrlToBytes(options.vapidPublicKey) as BufferSource,
					});
				}
				await signedPost('register', of, {
					subscription: subscription.toJSON(),
					...(replaceOtherAccounts ? {replaceOtherAccounts: true} : {}),
				});
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
