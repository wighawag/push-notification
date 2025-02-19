import { get } from 'svelte/store';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
import { createPushNotificationService } from './web/service-worker/push-notifications';
import { createServiceWorker } from './web/service-worker';
import { createFakeOwnerAccount } from './fake-owner-account';
import { createPrivateAccount } from './private-account';
import { createEncryptedStorage } from './encrypted-storage';

export const fakeOwnerAccount = createFakeOwnerAccount();

export const privateAccount = createPrivateAccount({
	ownerAccount: fakeOwnerAccount,
	skipConfirmation: true
});

export const storage = createEncryptedStorage({
	defaultData: { hello: 'world' },
	dbName: 'push-notifications-example',
	sync: { uri: 'http://localhost:34001' },
	account: privateAccount,
	// TODO
	merge: (a, b) => ({
		newData: a && b ? { ...a, ...b } : { ...a },
		newDataOnLocal: true,
		newDataOnRemote: true
	}),
	// TODO can remove based on timestamp
	clean: async (d) => d
});

export const serviceWorker = createServiceWorker();

export const pushNotifications = createPushNotificationService({
	serverEndpoint: 'http://localhost:34005/api',
	serverPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io',
	account: privateAccount,
	serviceWorker
});

(globalThis as any).state = {
	fakeOwnerAccount,
	privateAccount,
	storage,
	serviceWorker,
	pushNotifications
};
(globalThis as any).get = get;
