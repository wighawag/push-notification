// The API's behaviour, as every platform must serve it. A platform's test calls
// `describeAPI` with a function building its app; nothing here opens a port.
import {beforeEach, describe, expect, it} from 'vitest';
import {createIdentity, newSubscription, registration, type Identity, type SubscriptionJSON} from './protocol.js';
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

		describe('POST /register: a subscription is keyed by the wallet and proven by its delegate key', () => {
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

			it('refuses a registration without the delegate signature', async () => {
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

			it('keys the subscription by the address, whatever its case', async () => {
				const alice = await createIdentity(DOMAIN_A);
				await register(alice);
				const response = await push({address: alice.address.toLowerCase(), domain: DOMAIN_A, message});
				expect(response.status).toBe(200);
				expect(sender.sent).toHaveLength(1);
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
	});
}
