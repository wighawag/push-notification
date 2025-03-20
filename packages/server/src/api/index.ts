import {Hono} from 'hono';
import {ServerOptions, Subscription} from '../types.js';
import {setup} from '../setup.js';
import {Env} from '../env.js';
import {typiaValidator} from '@hono/typia-validator';
import {createValidate} from 'typia';
import {logs} from 'named-logs';
import {sendNotification} from '../web-push/via-webcrypto-web-push.js';
import {Urgency} from '../web-push/types.js';

const logger = logs('push-notification-service-server-api');

export type SubscriptionRegistration = {
	address: string;
	domain: string;
	subscription: Subscription;
};

export type Push = {
	address: string;
	domain: string;
	message: string;
	topic?: string;
	urgency?: Urgency;
};

export function getAPI(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>()
		.use(setup({serverOptions: options}))
		.post(
			'/register',
			// async (c, next) => {
			// 	console.log(await c.req.json());
			// 	await next();
			// },
			typiaValidator('json', createValidate<SubscriptionRegistration>()),
			async (c) => {
				const config = c.get('config');
				const storage = config.storage;

				const registration = c.req.valid('json');
				registration.address = registration.address.toLowerCase();

				// TODO authentication of address
				await storage.recordSubscription(registration.address, registration.domain, registration.subscription);
				return c.json({succes: true, registered: true});
			},
		)
		.get('/registered/:address/:domain/:subscriptionID', async (c) => {
			const config = c.get('config');
			const storage = config.storage;

			const address = c.req.param('address').toLowerCase();
			const domain = c.req.param('domain');
			const subscriptionID = c.req.param('subscriptionID');

			const subscription = await storage.getSubscription(address, domain, subscriptionID);
			if (subscription) {
				return c.json({succes: true, registered: true});
			} else {
				return c.json({succes: true, registered: false});
			}
		})
		.post('/push', typiaValidator('json', createValidate<Push>()), async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const push = c.req.valid('json');
			push.address = push.address.toLowerCase();
			// TODO authentication via tokens
			const subscriptions = await storage.getSubscriptions(push.address, push.domain);
			const toDelete: string[] = [];

			let oneSuccess = false;
			const failedSubscriptions: Subscription[] = [];
			for (const subscription of subscriptions) {
				if (subscription.expirationTime && subscription.expirationTime < Date.now() / 1000) {
					toDelete.push(subscription.endpoint);
				} else {
					const response = await sendNotification(subscription, push.message, {
						subject: 'mailto:notifications@etherplay.io',
						vapidKeys: {
							privateKey: config.env.VAPID_PRIVATE_KEY,
							publicKey: config.env.VAPID_PUBLIC_KEY,
						},
						urgency: push.urgency,
						topic: push.topic,
					});

					if (response.ok) {
						oneSuccess = true;
					} else {
						if (response.status === 410) {
							// Gone
							toDelete.push(subscription.endpoint);
						} else if (response.status === 404) {
							// 404
							toDelete.push(subscription.endpoint);
						} else {
							logger.error(`Could Not push (${response.status}) : ${response.body}`);
							if (response.status >= 500 && response.status < 600) {
								// TODO Retry
							}
							failedSubscriptions.push(subscription);
						}

						console.log(await response.text());
					}
				}
			}

			if (toDelete.length > 0) {
				for (const d of toDelete) {
					await storage.removeSubscription(d);
				}
			}

			if (failedSubscriptions.length > 0) {
				return c.json({
					success: false,
					successfullPush: subscriptions.length - failedSubscriptions.length,
					failedPush: failedSubscriptions.length,
				});
			} else {
				return c.json({
					success: oneSuccess,
					successfullPush: subscriptions.length - failedSubscriptions.length,
					deletedSubscriptions: toDelete.length,
				});
			}
		});

	return app;
}
