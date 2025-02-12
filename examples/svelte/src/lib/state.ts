import { get, writable } from 'svelte/store';
import { PUBLIC_VAPID_SERVER_PUBLIC_KEY } from './config';
import { createPushNotificationStore } from './web/service-worker/push-notifications';
import { privateKeyToAddress } from 'viem/accounts';
import { createServiceWorkerStore } from './web/service-worker';

const accountsPrivateKeys = [
	'0xedc1b70e424ba5ba048248afd5c1a69c37e83db9c91381443e109acb5cb2b29a',
	'0x144f288928a9b292ba05e96a91cd870846af40e24292c5716cf6ae45d3f08cec',
	'0xb257341b5ff898fbc760edf43795f68d086b03db71ab5b695e0d59c800c5d5eb',
	'0x7d0c2c1e739e0371fb10ef47df9535b3ea514bfe572748c9d267a381cb6e295c',
	'0x3f81609e73d3c100ad513e728fed531e3a5b16e669f5ef1ecaabd0f4934ccb9a'
] as const;
const accounts = accountsPrivateKeys.map((v) => {
	return {
		address: privateKeyToAddress(v),
		privateKey: v
	};
});

const dummyAccountStore = writable<{ address: string; privateKey: string } | undefined>(
	accounts[0]
);
function switchAccount(i?: number) {
	dummyAccountStore.update((v) =>
		!v
			? accounts[0]
			: accounts[i || (accounts.findIndex((a) => v.address === a.address) + 1) % accounts.length]
	);
}
function disableAccount() {
	dummyAccountStore.set(undefined);
}
export const dummyAccount = {
	subscribe: dummyAccountStore.subscribe,
	switchAccount,
	disableAccount
};

export const serviceWorker = createServiceWorkerStore();

export const pushNotifications = createPushNotificationStore({
	serverEndpoint: 'http://localhost:34005/api',
	serverPublicKey: PUBLIC_VAPID_SERVER_PUBLIC_KEY,
	domain: 'push-notifications-example.etherplay.io',
	account: dummyAccount,
	serviceWorker
});

(globalThis as any).state = {
	pushNotifications,
	serviceWorker
};
(globalThis as any).get = get;
