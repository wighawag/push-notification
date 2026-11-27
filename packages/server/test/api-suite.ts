// The API's behaviour, as every platform must serve it. A platform's test calls
// `describeAPI` with a function building its app; nothing here opens a port.
import {beforeEach, describe, expect, it} from 'vitest';
import {
	createIdentity,
	legacyPublicationMessage,
	newKeySet,
	newSubscription,
	originOf,
	publicationMessage,
	SERVER_ORIGIN,
	signLegacyRequest,
	registration,
	removal,
	type Identity,
	type SubscriptionJSON,
} from './protocol.js';
import {DOMAIN_A, DOMAIN_B, TOKEN_A, TOKEN_B, freshDatabase, recordingSender, testEnv} from './harness.js';
import type {MakeApp, RecordingSender} from './harness.js';

const message = {web_push: 8030, notification: {title: 'A new greeting', navigate: 'https://game-a.example/'}};

export function describeAPI(platform: string, makeApp: MakeApp) {
	describe(`${platform}: the push notification API`, () => {
		let request: (path: string, init?: RequestInit) => Promise<Response>;
		let sender: RecordingSender;

		beforeEach(async () => {
			sender = recordingSender();
			const app = await makeApp({...(await freshDatabase()), env: await testEnv(), sender: sender.send});
			request = app.request;
		});

		async function register(identity: Identity, subscription: SubscriptionJSON = newSubscription()) {
			const response = await request('/api/register', await registration(identity, subscription));
			expect(response.status, await response.clone().text()).toBe(200);
			return subscription;
		}

		function push(
			body: Record<string, unknown>,
			options?: {token?: string | null; idempotencyKey?: string},
		): Promise<Response> {
			const headers: Record<string, string> = {'content-type': 'application/json'};
			const token = options?.token === undefined ? TOKEN_A : options.token;
			if (token !== null) {
				headers.Authorization = `Bearer ${token}`;
			}
			if (options?.idempotencyKey) {
				headers['Idempotency-Key'] = options.idempotencyKey;
			}
			return request('/api/push', {method: 'POST', headers, body: JSON.stringify(body)});
		}

		describe('POST /register: a subscription is keyed by the wallet and proven by its key set', () => {
			it('registers a subscription whose proofs recover the address', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const subscription = newSubscription();
				const response = await request('/api/register', await registration(alice, subscription));
				expect(response.status).toBe(200);
				expect(await response.json()).toMatchObject({success: true, registered: true});

				const check = await request(
					`/api/registered/${alice.address}/${DOMAIN_A}/${encodeURIComponent(subscription.endpoint)}`,
				);
				expect(await check.json()).toMatchObject({success: true, registered: true});
			});

			it('registers the same subscription again without error', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const subscription = newSubscription();
				await register(alice, subscription);
				await register(alice, subscription);
			});

			it('refuses a registration without the request signature', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const response = await request(
					'/api/register',
					await registration(alice, newSubscription(), {noSignature: true}),
				);
				expect(response.status).toBe(401);
			});

			it('refuses a subscription for an address whose proof does not recover it', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const mallory = await createIdentity(DOMAIN_A);
				// mallory's own valid proof, claiming alice's address
				const subscription = newSubscription();
				const response = await request(
					'/api/register',
					await registration(mallory, subscription, {address: alice.address}),
				);
				expect(response.status).toBe(403);
				const check = await request(
					`/api/registered/${alice.address}/${DOMAIN_A}/${encodeURIComponent(subscription.endpoint)}`,
				);
				expect(await check.json()).toMatchObject({registered: false});
			});

			it('refuses a proof the wallet made for another domain', async () => {
				const alice = await createIdentity(DOMAIN_A, {signedForDomain: DOMAIN_B});
				const response = await request('/api/register', await registration(alice, newSubscription()));
				expect(response.status).toBe(403);
			});

			it("refuses a request signed by a key the wallet did not authorize (alice's public proof replayed)", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const mallory = await createIdentity(DOMAIN_A);
				const response = await request(
					'/api/register',
					await registration(alice, newSubscription(), {signer: mallory}),
				);
				expect(response.status).toBe(403);
			});

			it('refuses a request signed for another server or another route', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const forMissiv = await registration(alice, newSubscription(), {serverOrigin: 'https://missiv.example'});
				expect((await request('/api/register', forMissiv)).status).toBe(403);
				const forAnotherRoute = await registration(alice, newSubscription(), {path: '/api/unregister'});
				expect((await request('/api/register', forAnotherRoute)).status).toBe(403);
			});

			it('refuses a request signed more than a minute ago', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const old = await registration(alice, newSubscription(), {timestamp: Date.now() - 120_000});
				expect((await request('/api/register', old)).status).toBe(401);
			});

			it('names the app by its origin: a bare domain and its https origin are one app, an http LAN origin registers', async () => {
				const alice = await createIdentity(`https://${DOMAIN_A}`);
				await register(alice);
				await push({address: alice.address, domain: DOMAIN_A, message});
				expect(sender.sent).toHaveLength(1);

				const lan = await createIdentity('http://192.168.1.10:5173');
				const response = await request('/api/register', await registration(lan, newSubscription()));
				expect(response.status).toBe(200);
			});

			it('refuses a malformed request signature', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const init = await registration(alice, newSubscription());
				(init.headers as Record<string, string>).SIGNATURE = 'not-a-signature';
				expect((await request('/api/register', init)).status).toBe(400);
			});

			it('refuses a body changed after it was signed', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const response = await request(
					'/api/register',
					await registration(alice, newSubscription(), {
						tamper: (body) => body.replace('https://push.invalid/', 'https://attacker.invalid/'),
					}),
				);
				expect(response.status).toBe(403);
			});

			it("refuses another key set than the one the wallet authorized, signed by that key set's own key", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const mallory = await createIdentity(DOMAIN_A);
				// mallory's keys, presented with alice's proof: it recovers another account than alice
				const response = await request(
					'/api/register',
					await registration(alice, newSubscription(), {keySet: mallory.keySet, signer: mallory}),
				);
				expect(response.status).toBe(403);
			});

			it('refuses a key set whose encryption key is not the one the wallet authorized', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const keySet = {signing: alice.keySet.signing, encryption: newKeySet().keySet.encryption};
				const response = await request('/api/register', await registration(alice, newSubscription(), {keySet}));
				expect(response.status).toBe(403);
			});

			it('refuses a malformed key set', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const keySet = {signing: alice.keySet.signing, encryption: {publicKey: '0x1234' as const}};
				const response = await request('/api/register', await registration(alice, newSubscription(), {keySet}));
				expect(response.status).toBe(400);
				const withoutKeySet = await registration(alice, newSubscription(), {
					tamper: (body) => JSON.stringify({...JSON.parse(body), keySet: undefined}),
				});
				expect((await request('/api/register', withoutKeySet)).status).toBe(400);
			});

			it('refuses an ownership proof over the old publication message (one secp256k1 key)', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const old = await signLegacyRequest({
					serverOrigin: SERVER_ORIGIN,
					method: 'POST',
					path: '/api/register',
					body: '',
					timestamp: Date.now(),
				});
				const ownershipSignature = await alice.signMessage(legacyPublicationMessage(originOf(DOMAIN_A), old.publicKey));
				const response = await request(
					'/api/register',
					await registration(alice, newSubscription(), {ownershipSignature}),
				);
				expect(response.status).toBe(403);
				// the same wallet, over the new message: accepted
				const renewed = await alice.signMessage(publicationMessage(originOf(DOMAIN_A), alice.keySet));
				await register({...alice, ownershipSignature: renewed});
			});

			it('refuses an old-format (secp256k1) request signature', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const init = await registration(alice, newSubscription());
				const old = await signLegacyRequest({
					serverOrigin: SERVER_ORIGIN,
					method: 'POST',
					path: '/api/register',
					body: init.body as string,
					timestamp: Date.now(),
				});
				(init.headers as Record<string, string>).SIGNATURE = old.signature;
				expect((await request('/api/register', init)).status).toBe(400);
			});

			it('keys the subscription by the address, whatever its case', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const response = await push({address: alice.address.toLowerCase(), domain: DOMAIN_A, message});
				expect(response.status).toBe(200);
				expect(sender.sent).toHaveLength(1);
			});
		});

		describe('POST /register with replaceOtherAccounts: one account per device in an app', () => {
			async function accountsOf(subscription: SubscriptionJSON, domain = DOMAIN_A) {
				const response = await request(`/api/accounts/${domain}/${encodeURIComponent(subscription.endpoint)}`);
				expect(response.status).toBe(200);
				return ((await response.json()) as {accounts: string[]}).accounts;
			}
			async function registerOnly(identity: Identity, subscription: SubscriptionJSON) {
				const response = await request(
					'/api/register',
					await registration(identity, subscription, {extra: {replaceOtherAccounts: true}}),
				);
				expect(response.status, await response.clone().text()).toBe(200);
				return (await response.json()) as {success: boolean; registered: boolean; replacedAccounts: string[]};
			}

			it('by default, one browser registers for several accounts of the app, each notified', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				const first = await request('/api/register', await registration(alice, shared));
				expect(await first.json()).toEqual({success: true, registered: true, replacedAccounts: []});
				await register(bob, shared);
				expect(await accountsOf(shared)).toEqual([alice.address, bob.address].map((a) => a.toLowerCase()).sort());
				await push({address: alice.address, domain: DOMAIN_A, message});
				await push({address: bob.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(shared.endpoint)).toBe(2);
			});

			it("removes the endpoint's registrations for the other accounts of the app, and names them", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				const carol = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				await register(alice, shared);
				await register(carol, shared);
				const result = await registerOnly(bob, shared);
				expect(result).toEqual({
					success: true,
					registered: true,
					replacedAccounts: [alice.address, carol.address].map((a) => a.toLowerCase()).sort(),
				});
				expect(await accountsOf(shared)).toEqual([bob.address.toLowerCase()]);
				await push({address: alice.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(shared.endpoint)).toBe(0);
				await push({address: bob.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(shared.endpoint)).toBe(1);
			});

			it("leaves the other accounts' other devices, and the same account's registration", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				const alicePhone = await register(alice);
				await register(alice, shared);
				await registerOnly(bob, shared);
				expect(await registerOnly(bob, shared)).toMatchObject({replacedAccounts: []});
				await push({address: alice.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(alicePhone.endpoint)).toBe(1);
				expect(sender.deliveredTo(shared.endpoint)).toBe(0);
			});

			it("leaves the endpoint's registrations in another app", async () => {
				const aliceOnB = await createIdentity(DOMAIN_B);
				const bob = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				await register(aliceOnB, shared);
				expect(await registerOnly(bob, shared)).toMatchObject({replacedAccounts: []});
				expect(await accountsOf(shared, DOMAIN_B)).toEqual([aliceOnB.address.toLowerCase()]);
			});

			it('replaces nothing when the registration is refused', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const mallory = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				await register(alice, shared);
				const response = await request(
					'/api/register',
					await registration(mallory, shared, {address: alice.address, extra: {replaceOtherAccounts: true}}),
				);
				expect(response.status).toBe(403);
				expect(await accountsOf(shared)).toEqual([alice.address.toLowerCase()]);
			});

			it('the option is signed with the body: one added after signing is refused', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				await register(alice, shared);
				const response = await request(
					'/api/register',
					await registration(bob, shared, {
						tamper: (body) => JSON.stringify({...JSON.parse(body), replaceOtherAccounts: true}),
					}),
				);
				expect(response.status).toBe(403);
				expect(await accountsOf(shared)).toEqual([alice.address.toLowerCase()]);
			});
		});

		describe('GET /accounts/:domain/:subscriptionID: which accounts a device is registered for', () => {
			it('answers none for an unknown endpoint, and is scoped to the app', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const none = await request(`/api/accounts/${DOMAIN_A}/${encodeURIComponent('https://push.invalid/never')}`);
				expect(await none.json()).toEqual({success: true, accounts: []});
				const other = await request(`/api/accounts/${DOMAIN_B}/${encodeURIComponent(phone.endpoint)}`);
				expect(await other.json()).toEqual({success: true, accounts: []});
				const mine = await request(`/api/accounts/${DOMAIN_A}/${encodeURIComponent(phone.endpoint)}`);
				expect(await mine.json()).toEqual({success: true, accounts: [alice.address.toLowerCase()]});
			});

			it('forgets an account once it unregisters the device', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				await request('/api/unregister', await removal(alice, phone.endpoint));
				const response = await request(`/api/accounts/${DOMAIN_A}/${encodeURIComponent(phone.endpoint)}`);
				expect(await response.json()).toEqual({success: true, accounts: []});
			});
		});

		describe('POST /unregister: a device leaves an account', () => {
			it("removes the account's subscription, and pushes no longer reach it", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const laptop = await register(alice);
				const response = await request('/api/unregister', await removal(alice, phone.endpoint));
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({success: true, unregistered: true});
				await push({address: alice.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(phone.endpoint)).toBe(0);
				expect(sender.deliveredTo(laptop.endpoint)).toBe(1);
			});

			it('removes it for that account only: the same browser registered for another account keeps it', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				const shared = newSubscription();
				await register(alice, shared);
				await register(bob, shared);
				await request('/api/unregister', await removal(alice, shared.endpoint));
				await push({address: bob.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(shared.endpoint)).toBe(1);
			});

			it('answers unregistered: false for a subscription that was not there', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const response = await request('/api/unregister', await removal(alice, 'https://push.invalid/never'));
				expect(await response.json()).toEqual({success: true, unregistered: false});
			});

			it("refuses to remove another account's subscription", async () => {
				const alice = await createIdentity(DOMAIN_A);
				const mallory = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const response = await request(
					'/api/unregister',
					await removal(mallory, phone.endpoint, {address: alice.address}),
				);
				expect(response.status).toBe(403);
				await push({address: alice.address, domain: DOMAIN_A, message});
				expect(sender.deliveredTo(phone.endpoint)).toBe(1);
			});

			it('refuses a /register signature presented at /unregister', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const signed = await registration(alice, phone);
				const body = JSON.stringify({
					address: alice.address,
					domain: DOMAIN_A,
					endpoint: phone.endpoint,
					keySet: alice.keySet,
					ownershipSignature: alice.ownershipSignature,
				});
				const response = await request('/api/unregister', {...signed, body});
				expect(response.status).toBe(403);
			});
		});

		describe('POST /push: authenticated per domain', () => {
			it('refuses a push without a token, and sends nothing', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const response = await push({address: alice.address, domain: DOMAIN_A, message}, {token: null});
				expect(response.status).toBe(401);
				expect(sender.sent).toHaveLength(0);
			});

			it('refuses a push with an unknown token', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const response = await push({address: alice.address, domain: DOMAIN_A, message}, {token: 'guessed'});
				expect(response.status).toBe(401);
				expect(sender.sent).toHaveLength(0);
			});

			it("refuses a push with another domain's token", async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const response = await push({address: alice.address, domain: DOMAIN_A, message}, {token: TOKEN_B});
				expect(response.status).toBe(403);
				expect(sender.sent).toHaveLength(0);
			});

			it('delivers the message to every subscription of the address in that domain, and only there', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const laptop = await register(alice);
				const aliceOnB = await createIdentity(DOMAIN_B);
				const elsewhere = await register(aliceOnB);

				const response = await push({
					address: alice.address,
					domain: DOMAIN_A,
					message,
					topic: 'greetings',
					urgency: 'high',
				});
				expect(response.status).toBe(200);
				expect(await response.json()).toMatchObject({success: true, delivered: 2});
				expect(sender.deliveredTo(phone.endpoint)).toBe(1);
				expect(sender.deliveredTo(laptop.endpoint)).toBe(1);
				expect(sender.deliveredTo(elsewhere.endpoint)).toBe(0);
				expect(JSON.parse(sender.sent[0].payload)).toEqual(message);
				expect(sender.sent[0]).toMatchObject({topic: 'greetings', urgency: 'high'});
			});

			it('removes a subscription the push service answers 410 or 404 for', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const gone = await register(alice);
				const missing = await register(alice);
				sender.answer(gone.endpoint, 410);
				sender.answer(missing.endpoint, 404);
				const response = await push({address: alice.address, domain: DOMAIN_A, message});
				expect(await response.json()).toMatchObject({removed: 2});
				const again = await push({address: alice.address, domain: DOMAIN_A, message});
				expect(await again.json()).toMatchObject({delivered: 0, removed: 0});
				expect(sender.sent).toHaveLength(0);
			});

			it('removes an expired subscription without sending to it', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const expired = await register(alice, newSubscription({expirationTime: Date.now() - 1000}));
				const live = await register(alice, newSubscription({expirationTime: Date.now() + 3_600_000}));
				const response = await push({address: alice.address, domain: DOMAIN_A, message});
				expect(await response.json()).toMatchObject({delivered: 1, removed: 1});
				expect(sender.deliveredTo(expired.endpoint)).toBe(0);
				expect(sender.deliveredTo(live.endpoint)).toBe(1);
			});
		});

		describe('POST /push: an Idempotency-Key makes a retry safe', () => {
			it('a retried push with the same key delivers nothing twice', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				await register(alice);
				const body = {address: alice.address, domain: DOMAIN_A, message};
				const first = await push(body, {idempotencyKey: '1:0xblock:3:alice'});
				expect(await first.json()).toMatchObject({success: true, delivered: 2, alreadyDelivered: 0});
				const retry = await push(body, {idempotencyKey: '1:0xblock:3:alice'});
				expect(retry.status).toBe(200);
				expect(await retry.json()).toMatchObject({success: true, delivered: 0, alreadyDelivered: 2});
				expect(sender.sent).toHaveLength(2);
			});

			it('after a partial failure, answers a retryable status, and the retry reaches only the subscriptions not yet delivered', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const laptop = await register(alice);
				sender.answer(laptop.endpoint, 503);
				const body = {address: alice.address, domain: DOMAIN_A, message};
				const first = await push(body, {idempotencyKey: 'key-1'});
				expect(first.status).toBe(502);
				expect(await first.json()).toMatchObject({success: false, delivered: 1, failed: 1});
				const retry = await push(body, {idempotencyKey: 'key-1'});
				expect(retry.status).toBe(200);
				expect(await retry.json()).toMatchObject({success: true, delivered: 1, alreadyDelivered: 1});
				expect(sender.deliveredTo(phone.endpoint)).toBe(1);
				expect(sender.deliveredTo(laptop.endpoint)).toBe(1);
			});

			it('while another request with the same key is still sending, answers 409 and sends nothing', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const phone = await register(alice);
				const release = sender.hold(phone.endpoint);
				const body = {address: alice.address, domain: DOMAIN_A, message};
				const first = push(body, {idempotencyKey: 'slow'});
				// let the first request claim the delivery and reach the held send
				await new Promise((resolve) => setTimeout(resolve, 50));
				const concurrent = await push(body, {idempotencyKey: 'slow'});
				expect(concurrent.status).toBe(409);
				expect(await concurrent.json()).toMatchObject({success: false, inFlight: 1, delivered: 0});
				release();
				expect((await first).status).toBe(200);
				expect(sender.deliveredTo(phone.endpoint)).toBe(1);
			});

			it('refuses an overlong key', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const body = {address: alice.address, domain: DOMAIN_A, message};
				expect((await push(body, {idempotencyKey: 'x'.repeat(257)})).status).toBe(400);
				expect(sender.sent).toHaveLength(0);
			});

			it('another key delivers again, and a key is scoped to its address', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const bob = await createIdentity(DOMAIN_A);
				await register(alice);
				await register(bob);
				await push({address: alice.address, domain: DOMAIN_A, message}, {idempotencyKey: 'k'});
				await push({address: bob.address, domain: DOMAIN_A, message}, {idempotencyKey: 'k'});
				await push({address: alice.address, domain: DOMAIN_A, message}, {idempotencyKey: 'k2'});
				expect(sender.sent).toHaveLength(3);
			});

			it('without a key, every call delivers', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const body = {address: alice.address, domain: DOMAIN_A, message};
				await push(body);
				await push(body);
				expect(sender.sent).toHaveLength(2);
			});
		});

		describe('GET /registered/:address/:domain: does the address have any live subscription', () => {
			it('answers a count, to a caller holding that domain token', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const headers = {Authorization: `Bearer ${TOKEN_A}`};
				const none = await request(`/api/registered/${alice.address}/${DOMAIN_A}`, {headers});
				expect(none.status).toBe(200);
				expect(await none.json()).toEqual({success: true, registered: false, count: 0});
				await register(alice);
				await register(alice);
				await register(alice, newSubscription({expirationTime: Date.now() - 1000}));
				const two = await request(`/api/registered/${alice.address}/${DOMAIN_A}`, {headers});
				expect(await two.json()).toEqual({success: true, registered: true, count: 2});
			});

			it("refuses a caller without a token or with another domain's", async () => {
				const alice = await createIdentity(DOMAIN_A);
				expect((await request(`/api/registered/${alice.address}/${DOMAIN_A}`)).status).toBe(401);
				const other = await request(`/api/registered/${alice.address}/${DOMAIN_A}`, {
					headers: {Authorization: `Bearer ${TOKEN_B}`},
				});
				expect(other.status).toBe(403);
			});
		});

		describe('an invalid body is refused (400) before any proof or token is looked at', () => {
			async function expectRefused(response: Response, ...paths: string[]) {
				expect(response.status).toBe(400);
				const body = (await response.json()) as {success: boolean; errors: {message: string}[]};
				expect(body.success).toBe(false);
				expect(body.errors).toHaveLength(paths.length);
				for (const [i, path] of paths.entries()) {
					expect(body.errors[i].message).toContain(` at ${path}:`);
				}
			}
			const json = (body: unknown): RequestInit => ({
				method: 'POST',
				headers: {'content-type': 'application/json'},
				body: JSON.stringify(body),
			});

			it('POST /register, naming each invalid field', async () => {
				const alice = await createIdentity(DOMAIN_A);
				const init = await registration(alice, newSubscription());
				const body = JSON.parse(init.body as string);
				await expectRefused(
					await request('/api/register', json({...body, subscription: {...body.subscription, keys: {}}})),
					'subscription.keys.p256dh',
					'subscription.keys.auth',
				);
				await expectRefused(
					await request('/api/register', json({...body, ownershipSignature: 'no-0x-prefix'})),
					'ownershipSignature',
				);
				await expectRefused(
					await request('/api/register', json({...body, keySet: {...body.keySet, encryption: {publicKey: 'ab'}}})),
					'keySet.encryption.publicKey',
				);
				await expectRefused(
					await request('/api/register', json({...body, replaceOtherAccounts: 'yes'})),
					'replaceOtherAccounts',
				);
			});

			it('POST /unregister', async () => {
				await expectRefused(
					await request(
						'/api/unregister',
						json({address: '0x1', domain: DOMAIN_A, keySet: {signing: {}}, ownershipSignature: '0x1'}),
					),
					'endpoint',
					'keySet.signing.publicKey',
					'keySet.encryption',
				);
			});

			it('POST /push, even without a token', async () => {
				await expectRefused(
					await push({address: '0x1', domain: DOMAIN_A, message, urgency: 'urgent'}, {token: null}),
					'urgency',
				);
				await expectRefused(
					await push({address: '0x1', domain: DOMAIN_A, message: {...message, web_push: 8031}}),
					'message.web_push',
				);
				expect(sender.sent).toHaveLength(0);
			});

			// what 0.1.0's validators accepted and refused, compared case by case on 79c6683:
			// a refused body answers 400, an accepted one reaches the token check (401 without it)
			const subscription = {endpoint: 'https://push.example/1', expirationTime: null, keys: {p256dh: 'a', auth: 'b'}};
			const keySet = {signing: {publicKey: '0x1'}, encryption: {publicKey: '0x2'}};
			const signed = {address: '0xabc', domain: DOMAIN_A, subscription, keySet, ownershipSignature: '0x12'};
			const pushed = {address: '0xabc', domain: DOMAIN_A, message};
			const notifying = (fields: Record<string, unknown>) => ({
				...pushed,
				message: {...message, notification: {...message.notification, ...fields}},
			});
			const parity: [string, string, unknown, 400 | 401][] = [
				['register: an unknown key', '/api/register', {...signed, extra: 1}, 401],
				['register: no 0x prefix', '/api/register', {...signed, ownershipSignature: '12'}, 400],
				['register: 0x and no hex (the prefix only)', '/api/register', {...signed, ownershipSignature: '0xzz'}, 401],
				[
					'register: expirationTime missing',
					'/api/register',
					{...signed, subscription: {endpoint: 'e', keys: {p256dh: 'a', auth: 'b'}}},
					400,
				],
				[
					'register: expirationTime a string',
					'/api/register',
					{...signed, subscription: {...subscription, expirationTime: '1'}},
					400,
				],
				[
					'register: expirationTime a fraction',
					'/api/register',
					{...signed, subscription: {...subscription, expirationTime: 1.5}},
					401,
				],
				['register: null', '/api/register', null, 400],
				['register: an array', '/api/register', [signed], 400],
				['push: an unknown key', '/api/push', {...pushed, extra: 1}, 401],
				['push: web_push as a string', '/api/push', {...pushed, message: {...message, web_push: '8030'}}, 400],
				['push: null for an optional key', '/api/push', {...pushed, urgency: null}, 400],
				['push: topic a number', '/api/push', {...pushed, topic: 1}, 400],
				['push: dir outside its enum', '/api/push', notifying({dir: 'up'}), 400],
				['push: dir rtl', '/api/push', notifying({dir: 'rtl'}), 401],
				['push: vibrate of strings', '/api/push', notifying({vibrate: ['1']}), 400],
				['push: data an array', '/api/push', notifying({data: [1]}), 400],
				['push: data null', '/api/push', notifying({data: null}), 400],
				['push: data an object', '/api/push', notifying({data: {a: 1}}), 401],
				['push: an action without navigate', '/api/push', notifying({actions: [{action: 'a', title: 't'}]}), 400],
				['push: timestamp a boolean', '/api/push', notifying({timestamp: true}), 400],
				['push: app_badge a string', '/api/push', {...pushed, message: {...message, app_badge: '1'}}, 400],
			];
			for (const [name, path, body, status] of parity) {
				it(`as 0.1.0 did, ${name}: ${status}`, async () => {
					expect((await request(path, json(body))).status).toBe(status);
				});
			}

			it('POST /push forwards the message as sent, fields it does not know included', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const future = {...message, notification: {...message.notification, not_yet_listed: 1}, also_new: true};
				expect((await push({address: alice.address, domain: DOMAIN_A, message: future})).status).toBe(200);
				expect(JSON.parse(sender.sent[0].payload)).toEqual(future);
			});
		});
	});
}
