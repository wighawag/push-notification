import {buildPushPayload} from '@block65/webcrypto-web-push';
import {PushSubscription, Urgency, VapidKeys} from './types.js';

export async function sendNotification(
	subscription: PushSubscription,
	payload: string,
	{
		vapidKeys,
		subject,
		topic,
		urgency,
		ttl,
	}: {vapidKeys: Omit<VapidKeys, 'subject'>; subject: string; topic?: string; urgency: Urgency; ttl?: number},
): Promise<Response> {
	const fetchData = await buildPushPayload(
		{
			data: payload,
			options: {
				topic,
				ttl: ttl || 0,
				urgency: urgency,
			},
		},
		{
			endpoint: subscription.endpoint,
			expirationTime: subscription.expirationTime ? subscription.expirationTime : null,
			keys: {
				auth: subscription.keys.auth,
				p256dh: subscription.keys.p256dh,
			},
		},
		{...vapidKeys, subject},
	);

	return fetch(subscription.endpoint, fetchData);
}
