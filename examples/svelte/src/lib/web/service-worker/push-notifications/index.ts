import { derived, type Readable } from 'svelte/store';
import { serviceWorker, type ServiceWorkerState } from '..';
import { urlB64ToUint8Array } from './utils';

export type SettledPushNotificationsState =
	| {
			settled: true;
			subscription: PushSubscription;
			subscribing: false;
			registeredOnServer: boolean;
	  }
	| {
			settled: true;
			subscription: undefined;
			subscribing: boolean;
			error?: any;
	  };

export type PushNotificationsState =
	| SettledPushNotificationsState
	| {
			settled: false;
			loading: boolean;
	  };

export function createPushNotificationStore(params: {
	serverPublicKey: string;
	serverEndpoint: string;
	domain: string;
}) {
	const domain = params.domain;
	async function getSubscriptionState(
		registration: ServiceWorkerRegistration
	): Promise<SettledPushNotificationsState> {
		const subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			const accountAddress = ''; // TODO
			const registrationOnServerResponse = await fetch(
				`${params.serverEndpoint}/registered/${accountAddress}/${domain}/${subscription.endpoint}`
			);
			const registrationResult = await registrationOnServerResponse.json();

			return {
				settled: true,
				subscription,
				subscribing: false,
				registeredOnServer: registrationResult.registered
			};
		} else {
			return {
				settled: true,
				subscription: undefined,
				subscribing: false
			};
		}
	}

	let guard: object | undefined;

	let _state: PushNotificationsState = { settled: false, loading: false };
	let _set: ((value: PushNotificationsState) => void) | undefined;
	let _serviceWorker: ServiceWorkerState | undefined;

	function setState(newState: PushNotificationsState) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	function updateState() {
		if (_serviceWorker && _serviceWorker.registration) {
			setState({ settled: false, loading: true });
			const inner = (guard = {});
			Promise.resolve(getSubscriptionState(_serviceWorker.registration)).then((value) => {
				if (guard === inner) {
					setState(value);
				}
			});
		} else {
			setState({ settled: false, loading: false });
		}
	}

	const { subscribe } = derived<Readable<ServiceWorkerState>, PushNotificationsState>(
		serviceWorker,
		($serviceWorker, set) => {
			_serviceWorker = $serviceWorker;
			_set = set;
			updateState();
		},
		_state
	);

	function refresh() {
		updateState();
	}

	function subscribeToPush() {
		if (_state.settled && _state.subscription) {
			throw new Error(`already subscribed`);
		}
		const applicationServerKey = urlB64ToUint8Array(params.serverPublicKey);
		if (_serviceWorker && _serviceWorker.registration) {
			setState({ settled: true, subscribing: true, subscription: undefined });
			_serviceWorker.registration.pushManager
				.subscribe({
					userVisibleOnly: true,
					applicationServerKey: applicationServerKey
				})
				.then(async function (subscription) {
					// TODO one more state update to show registrating on server

					let registeredOnServer = false;
					try {
						const response = await fetch(`${params.serverEndpoint}/register`, {
							method: 'POST',
							body: JSON.stringify({
								address: '', // params.address, // TODO if address change, should we also consider being registered ?
								domain: domain,
								subscription: subscription.toJSON()
							})
						});
						if (response.ok) {
							const json = await response.json();
							registeredOnServer = json.registered;
						}
					} catch (err) {
						// TODO
						// show error ?
					}

					setState({ settled: true, subscription, subscribing: false, registeredOnServer });
				})
				.catch(function (error) {
					setState({ settled: true, subscription: undefined, subscribing: false, error });
				});
		}
	}

	function acknowledgeError() {
		if ('error' in _state && _state.error) {
			setState({ ..._state, error: undefined });
		}
	}

	return { subscribe, refresh, subscribeToPush, acknowledgeError };
}
