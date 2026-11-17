import {Env} from '../env.js';
import {PushSender} from '../types.js';
import {sendNotification} from './via-webcrypto-web-push.js';

/** The production sender: Web Push, signed with the env's VAPID keys. */
export function webPushSender(env: Env): PushSender {
	return async (subscription, payload, {topic, urgency}) => {
		try {
			const response = await sendNotification(subscription, payload, {
				subject: 'mailto:notifications@etherplay.io',
				vapidKeys: {
					privateKey: env.VAPID_PRIVATE_KEY,
					publicKey: env.VAPID_PUBLIC_KEY,
				},
				urgency,
				topic,
			});
			return {ok: response.ok, status: response.status, body: response.ok ? undefined : await response.text()};
		} catch (err) {
			return {ok: false, status: 0, body: err instanceof Error ? err.message : String(err)};
		}
	};
}
