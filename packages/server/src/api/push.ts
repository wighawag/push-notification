import {Hono} from 'hono';
import {ServerOptions, Subscription} from '../types.js';
import {setup} from '../setup.js';
import {Env} from '../env.js';
import {typiaValidator} from '@hono/typia-validator';
import {createValidate} from 'typia';
import webPush, {Urgency} from 'web-push';
import {logs} from 'named-logs';

const logger = logs('push-notification-server-app');

export type Push = {
	address: string;
	domain: string;
	message: string;
	topic?: string;
	urgeny?: Urgency;
};

export function getPushAPI(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>()
		.use(setup({serverOptions: options}))
		.post('/push', typiaValidator('json', createValidate<Push>()), async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const push = await c.req.json();
			// TODO authentication via tokens
			const subscriptions = await storage.getSubscriptions(push.address, push.domain);
			const toDelete: string[] = [];
			const vapidKeys = JSON.parse(config.env.VAPID_KEYS);
			const vapidDetails = {...vapidKeys, subject: 'https://notifications.etherplay.io'};
			const failedSubscriptions: Subscription[] = [];
			for (const subscription of subscriptions) {
				if (subscription.expirationTime && subscription.expirationTime < Date.now() / 1000) {
					toDelete.push(subscription.endpoint);
				} else {
					const response = await webPush.sendNotification(subscription, push.message, {
						vapidDetails,
						topic: push.topic,
						urgency: push.urgency,
					});

					if (response.statusCode === 410) {
						// Gon
						toDelete.push(subscription.endpoint);
					} else if (response.statusCode < 200 || response.statusCode >= 300) {
						logger.error(`Could Not push (${response.statusCode}) : ${response.body}`);
						if (response.statusCode >= 500 && response.statusCode < 600) {
							// TODO Retry
						}
						failedSubscriptions.push(subscription);
					}
				}
			}

			if (toDelete.length > 0) {
				for (const d of toDelete) {
					await storage.removeSubscription(push.address, push.domain, d);
				}
			}

			if (failedSubscriptions.length > 0) {
				return c.json({
					success: false,
					successfullPush: subscriptions.length - failedSubscriptions.length,
					failedPush: failedSubscriptions.length,
				});
			} else {
				return c.json({success: true});
			}
		});

	return app;
}
