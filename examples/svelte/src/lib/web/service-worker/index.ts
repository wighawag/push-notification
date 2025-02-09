import { get, writable } from 'svelte/store';

export type ServiceWorkerState = {
	registration?: ServiceWorkerRegistration;
	updateAvailable: boolean;
};

function createServiceWorkerStore() {
	const store = writable<ServiceWorkerState>({
		registration: undefined,
		updateAvailable: false
	});
	return {
		...store,
		get registration(): ServiceWorkerRegistration | undefined {
			return get(store).registration;
		},
		get updateAvailable(): boolean {
			return get(store).updateAvailable;
		}
	};
}

// allow to test service worker notifcation by executing the following in the console:
// serviceWorker.update(v => {v.updateAvailable = true; v.registration = "anything"; return v});
export const serviceWorker = createServiceWorkerStore();
(globalThis as any).serviceWorker = serviceWorker;
