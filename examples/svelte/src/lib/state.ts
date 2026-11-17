import { derived, get } from 'svelte/store';
import { createPushNotifications, type PushAccount } from '@push-notification/client';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
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

export const pushNotifications = createPushNotifications({
	serverEndpoint: 'http://localhost:34005/api',
	vapidPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io',
	// the wallet (owner) is who notifications are addressed to; the local signer is its delegate key
	account: derived(
		privateAccount,
		($privateAccount): PushAccount =>
			$privateAccount?.signer
				? {
						address: $privateAccount.owner,
						delegatePrivateKey: $privateAccount.signer.privateKey as `0x${string}`
					}
				: undefined
	),
	serviceWorker: derived(serviceWorker, ($serviceWorker) =>
		$serviceWorker && 'registration' in $serviceWorker ? $serviceWorker.registration : undefined
	),
	signOwnership: async (owner, message) => {
		if (get(fakeOwnerAccount)?.address !== owner) {
			throw new Error(`the owner changed`);
		}
		return fakeOwnerAccount.signMessage(message);
	}
});

(globalThis as any).state = {
	fakeOwnerAccount,
	privateAccount,
	storage,
	serviceWorker,
	pushNotifications
};
(globalThis as any).get = get;
