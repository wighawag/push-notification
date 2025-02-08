import { derived, type Readable } from 'svelte/store';
import { serviceWorker, type ServiceWorkerState } from '../service-worker';

export type SubscriptionState =
	| {
			settled: true;
			subscription?: PushSubscription;
	  }
	| {
			settled: false;
			loading: boolean;
	  };

async function update(registration: ServiceWorkerRegistration): Promise<{
	settled: true;
	subscription?: PushSubscription;
}> {
	const subscription = await registration.pushManager.getSubscription();
	return {
		settled: true,
		subscription: subscription ? subscription : undefined
	};
}

let guard: object | undefined;

export const subscription = derived<Readable<ServiceWorkerState>, SubscriptionState>(
	serviceWorker,
	($serviceWorker, set) => {
		if ($serviceWorker.registration) {
			set({ settled: false, loading: true });
			const inner = (guard = {});
			Promise.resolve(update($serviceWorker.registration)).then((value) => {
				if (guard === inner) {
					set(value);
				}
			});
		} else {
			set({ settled: false, loading: false });
		}
	},
	{ settled: false, loading: false }
);
