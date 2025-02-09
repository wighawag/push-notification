import {ApplicationServerKeys, generatePushHTTPRequest} from 'webpush-webcrypto';
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
	}: {vapidKeys: VapidKeys; subject: string; topic?: string; urgency: Urgency; ttl?: number},
): Promise<Response> {
	if (!subject.startsWith('mailto:')) {
		throw new Error(`except mailto:<email>`);
	}
	const adminContact = subject.slice(7);
	const applicationServerKeys = await ApplicationServerKeys.fromJSON(vapidKeys);
	const {headers, body, endpoint} = await generatePushHTTPRequest({
		applicationServerKeys,
		payload,
		adminContact,
		target: {
			endpoint: subscription.endpoint,
			keys: subscription.keys,
		},
		ttl: ttl || 4 * 7 * 24 * 60 * 60, // 4 weeks
		topic,
		urgency,
	});

	return fetch(endpoint, {
		method: 'POST',
		headers,
		body,
	});
}
