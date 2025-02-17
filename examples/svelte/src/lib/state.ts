import { get } from 'svelte/store';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
import { createPushNotificationStore } from './web/service-worker/push-notifications';
import { createServiceWorkerStore } from './web/service-worker';
import { createFakeOwnerAccount } from './fake-owner-account';
import { createPrivateAccount } from './private-account';

export const fakeOwnerAccount = createFakeOwnerAccount();

export const privateAccount = createPrivateAccount({
	ownerAccount: fakeOwnerAccount,
	skipConfirmation: true
});

export const serviceWorker = createServiceWorkerStore();

export const pushNotifications = createPushNotificationStore({
	serverEndpoint: 'http://localhost:34005/api',
	serverPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io',
	account: privateAccount,
	serviceWorker
});

(globalThis as any).state = {
	pushNotifications,
	serviceWorker
};
(globalThis as any).get = get;
