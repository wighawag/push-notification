import { derived, writable, type Readable } from 'svelte/store';
import { serviceWorker, type ServiceWorkerState } from '..';

export type SubscriptionState =
	| {
			settled: true;
			subscription?: PushSubscription;
	  }
	| {
			settled: false;
			loading: boolean;
	  };

async function getSubscriptionState(registration: ServiceWorkerRegistration): Promise<{
	settled: true;
	subscription?: PushSubscription;
}> {
	const subscription = await registration.pushManager.getSubscription();
	return {
		settled: true,
		subscription: subscription ? subscription : undefined
	};
}

function createSubscriptionStore() {
	let guard: object | undefined;

	const trigger = writable(1);

	const { subscribe } = derived<
		[Readable<ServiceWorkerState>, Readable<number>],
		SubscriptionState
	>(
		[serviceWorker, trigger],
		([$serviceWorker, $trigger], set) => {
			if ($serviceWorker.registration && $trigger > 0) {
				set({ settled: false, loading: true });
				const inner = (guard = {});
				Promise.resolve(getSubscriptionState($serviceWorker.registration)).then((value) => {
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

	function refresh() {
		trigger.update((v) => v + 1);
	}

	return { subscribe, refresh };
}

export const subscription = createSubscriptionStore();
