import { get } from 'svelte/store';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
import { createPushNotificationStore } from './web/service-worker/push-notifications';

export const pushNotifications = createPushNotificationStore({
	serverEndpoint: 'https://push-notifications.etherplay.io/api',
	serverPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io'
});

(globalThis as any).state = {
	pushNotifications
};
(globalThis as any).get = get;
