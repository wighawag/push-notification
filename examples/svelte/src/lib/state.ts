import { get, writable } from 'svelte/store';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
import { createPushNotificationStore } from './web/service-worker/push-notifications';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

const privateKey = generatePrivateKey();
const address = privateKeyToAddress(privateKey);
export const dummyAccount = writable<{ address: string; privateKey: string }>({
	address,
	privateKey
});

export const pushNotifications = createPushNotificationStore({
	serverEndpoint: 'http://localhost:34005/api',
	serverPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io',
	account: dummyAccount
});

(globalThis as any).state = {
	pushNotifications
};
(globalThis as any).get = get;
