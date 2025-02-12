import { dev } from '$app/environment';
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

	function pingServideWorker(state: 'installing' | 'waiting' | 'active' = 'active') {
		const $serviceWorker = get(store);
		const registration = $serviceWorker.registration;
		if (!registration) {
			throw new Error(`no registration`);
		}
		if (!registration[state]) {
			throw new Error(`no registration in state: ${state}`);
		}
		registration[state].postMessage({
			type: 'ping'
		});
	}

	function sendMessage(message: string, state: 'installing' | 'waiting' | 'active' = 'active') {
		const $serviceWorker = get(store);
		const registration = $serviceWorker.registration;
		if (!registration) {
			throw new Error(`no registration`);
		}
		if (!registration[state]) {
			throw new Error(`no registration in state: ${state}`);
		}
		registration[state].postMessage(message);
	}

	function skipWaiting() {
		console.log(`accepting update...`);
		const $serviceWorker = get(store);
		if ($serviceWorker.updateAvailable && $serviceWorker.registration) {
			const registration = $serviceWorker.registration;
			if (!registration) {
				throw new Error(`no registration`);
			}

			if (registration.waiting) {
				console.log(`was waiting, skipping...`);
				registration.waiting.postMessage('skipWaiting');
			} else {
				console.log(`was not waiting, should we reload?`);
				console.error(`not waiting..., todo reload?`);
				// window.location.reload();
			}

			if (!dev) {
				console.log(`update store`);
				store.set({ updateAvailable: false });
			}
		}
	}

	function skip() {
		store.set({ updateAvailable: false });
	}
	return {
		subscribe: store.subscribe,
		set: store.set, // TODO remove and move handler logic in here
		get registration(): ServiceWorkerRegistration | undefined {
			return get(store).registration;
		},
		get updateAvailable(): boolean {
			return get(store).updateAvailable;
		},
		pingServideWorker,
		sendMessage,
		skipWaiting,
		skip
	};
}

// allow to test service worker notifcation by executing the following in the console:
// serviceWorker.update(v => {v.updateAvailable = true; v.registration = "anything"; return v});
export const serviceWorker = createServiceWorkerStore();
(globalThis as any).serviceWorker = serviceWorker;
