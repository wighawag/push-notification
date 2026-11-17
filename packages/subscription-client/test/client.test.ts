// The client against the real server, in process: app.request stands for the
// network, an in-memory libSQL database for its storage, a recording sender for
// Web Push, and fakes for the browser's PushManager. No port.
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {get, writable, type Readable} from 'sveltore';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {createServer, setupDatabase, type PushSender} from '@push-notification/server';
import {createPushNotifications, type PushAccount, type PushState} from '../src/index.js';

const DOMAIN = 'game.example';
const TOKEN = 'the-game-service-token';

async function sha256Hex(text: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let devices = 0;
function fakeBrowser(options?: {deny?: boolean}) {
	let subscription: {endpoint: string; toJSON(): unknown} | null = null;
	let permission: NotificationPermission = 'default';
	const registration = {
		pushManager: {
			getSubscription: async () => subscription,
			subscribe: vi.fn(async () => {
				if (options?.deny) {
					permission = 'denied';
					throw new Error('NotAllowedError');
				}
				permission = 'granted';
				const endpoint = `https://push.invalid/device-${++devices}`;
				subscription = {
					endpoint,
					toJSON: () => ({endpoint, expirationTime: null, keys: {p256dh: 'p256dh', auth: 'auth'}}),
				};
				return subscription;
			}),
		},
	};
	return {
		registration: registration as unknown as ServiceWorkerRegistration,
		permission: () => permission,
		endpoint: () => subscription?.endpoint,
	};
}

function newAccount() {
	const wallet = privateKeyToAccount(generatePrivateKey());
	return {
		wallet,
		account: {address: wallet.address, delegatePrivateKey: generatePrivateKey()} as NonNullable<PushAccount>,
	};
}

async function until(store: Readable<PushState>, predicate: (state: PushState) => boolean): Promise<PushState> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`timed out at ${JSON.stringify(get(store))}`)), 2000);
		let unsubscribe: (() => void) | undefined;
		unsubscribe = store.subscribe((state) => {
			if (predicate(state)) {
				clearTimeout(timeout);
				queueMicrotask(() => unsubscribe?.());
				resolve(state);
			}
		});
	});
}
const settled = (state: PushState) => state.status !== 'loading' && !state.busy;

describe('createPushNotifications, against the server in process', () => {
	let app: ReturnType<typeof createServer>;
	let sent: string[];

	beforeEach(async () => {
		const db = new RemoteLibSQL(createClient({url: ':memory:'}));
		await setupDatabase(db);
		sent = [];
		const sender: PushSender = async (subscription) => {
			sent.push(subscription.endpoint);
			return {ok: true, status: 201};
		};
		const env = {VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', PUSH_TOKENS: `${DOMAIN}:${await sha256Hex(TOKEN)}`};
		app = createServer({getDB: () => db, getEnv: () => env, getPushSender: () => sender});
	});

	function client(account: Readable<PushAccount>, browser: ReturnType<typeof fakeBrowser>, extra?: object) {
		const signOwnership = vi.fn(async (address: string, message: string) => {
			const wallet = walletsByAddress.get(address);
			if (!wallet) throw new Error('unknown wallet');
			return wallet.signMessage({message});
		});
		const notifications = createPushNotifications({
			serverEndpoint: 'https://push.example/api',
			vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
			domain: DOMAIN,
			account,
			serviceWorker: writable(browser.registration),
			signOwnership,
			fetch: ((input: string, init?: RequestInit) => app.request(input, init)) as typeof fetch,
			permission: browser.permission,
			supported: () => true,
			...extra,
		});
		return {notifications, signOwnership};
	}
	const walletsByAddress = new Map<string, ReturnType<typeof privateKeyToAccount>>();
	function account() {
		const created = newAccount();
		walletsByAddress.set(created.wallet.address, created.wallet);
		return created.account;
	}

	async function push(address: string) {
		const response = await app.request('https://push.example/api/push', {
			method: 'POST',
			headers: {'content-type': 'application/json', Authorization: `Bearer ${TOKEN}`},
			body: JSON.stringify({
				address,
				domain: DOMAIN,
				message: {web_push: 8030, notification: {title: 't', navigate: '/'}},
			}),
		});
		return response.json();
	}

	it('says unsupported in a browser without service workers or push, and no-account without an account', async () => {
		const browser = fakeBrowser();
		const unsupported = client(writable(account()), browser, {supported: () => false}).notifications;
		expect((await until(unsupported, settled)).status).toBe('unsupported');
		const noAccount = client(writable<PushAccount>(undefined), browser).notifications;
		expect((await until(noAccount, settled)).status).toBe('no-account');
	});

	it('is off before enabling, and on after: the account then receives pushes on this device', async () => {
		const alice = account();
		const browser = fakeBrowser();
		const {notifications} = client(writable(alice), browser);
		expect((await until(notifications, settled)).status).toBe('off');

		await notifications.enable();
		expect(await until(notifications, settled)).toMatchObject({status: 'on', error: undefined});
		expect(await push(alice.address)).toMatchObject({success: true, delivered: 1});
		expect(sent).toEqual([browser.endpoint()]);
	});

	it("uses the account's ownershipSignature when it has one, and asks the wallet otherwise", async () => {
		const alice = account();
		const wallet = walletsByAddress.get(alice.address)!;
		const {originPublicKeyPublicationMessage, delegatePublicKey} = await import('missiv-identity');
		const ownershipSignature = await wallet.signMessage({
			message: originPublicKeyPublicationMessage('https://game.example', delegatePublicKey(alice.delegatePrivateKey)),
		});
		const {notifications, signOwnership} = client(writable({...alice, ownershipSignature}), fakeBrowser());
		await until(notifications, settled);
		await notifications.enable();
		expect((await until(notifications, settled)).status).toBe('on');
		expect(signOwnership).not.toHaveBeenCalled();

		const bob = account();
		const asked = client(writable(bob), fakeBrowser());
		await until(asked.notifications, settled);
		await asked.notifications.enable();
		expect((await until(asked.notifications, settled)).status).toBe('on');
		expect(asked.signOwnership).toHaveBeenCalledTimes(1);
	});

	it('says denied when the user refused notifications', async () => {
		const browser = fakeBrowser({deny: true});
		const {notifications} = client(writable(account()), browser);
		await until(notifications, settled);
		await notifications.enable();
		const state = await until(notifications, settled);
		expect(state.status).toBe('denied');
		expect(state.error).toBeInstanceOf(Error);
	});

	it('follows an account switch: one browser, each account enabled and disabled on its own', async () => {
		const alice = account();
		const bob = account();
		const current = writable<PushAccount>(alice);
		const browser = fakeBrowser();
		const {notifications} = client(current, browser);
		await until(notifications, settled);
		await notifications.enable();
		expect((await until(notifications, settled)).status).toBe('on');

		current.set(bob);
		expect((await until(notifications, (s) => settled(s) && s.status !== 'on')).status).toBe('unregistered');
		await notifications.enable();
		expect((await until(notifications, settled)).status).toBe('on');

		await notifications.disable();
		expect((await until(notifications, settled)).status).toBe('unregistered');
		expect(await push(bob.address)).toMatchObject({delivered: 0});
		expect(await push(alice.address)).toMatchObject({delivered: 1});
	});

	it('surfaces a refused registration as an error', async () => {
		const alice = account();
		const {notifications} = client(writable(alice), fakeBrowser(), {
			// the wallet signs for another delegate key: the server refuses (403)
			signOwnership: async () =>
				walletsByAddress.get(alice.address)!.signMessage({message: 'not the publication message'}),
		});
		await until(notifications, settled);
		await notifications.enable();
		const state = await until(notifications, settled);
		expect(state.status).toBe('unregistered');
		expect(String(state.error)).toContain('403');
		notifications.acknowledgeError();
		expect(get(notifications).error).toBeUndefined();
	});
});
