import { derived, type Readable } from 'svelte/store';
import { serviceWorker, type ServiceWorkerState } from '..';
import { urlB64ToUint8Array } from './utils';

export type SettledPushNotificationsState =
	| {
			settled: true;
			denied: true;
			error?: any;
	  }
	| {
			settled: true;
			subscription: PushSubscription;
			subscribing: false;
			registeredOnServer: boolean;
			error?: any;
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
			error?: any;
	  };

type PrivateAccount = { address: string; privateKey: string } | undefined;

export function createPushNotificationStore(params: {
	serverPublicKey: string;
	serverEndpoint: string;
	domain: string;
	account: Readable<PrivateAccount>;
}) {
	const domain = params.domain;
	async function getSubscriptionState(
		registration: ServiceWorkerRegistration,
		account: PrivateAccount
	): Promise<PushNotificationsState> {
		if (!account) {
			return {
				settled: false,
				loading: false
			};
		}
		const subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			const accountAddress = account.address;
			const registrationOnServerResponse = await fetch(
				`${params.serverEndpoint}/registered/${accountAddress}/${domain}/${encodeURIComponent(subscription.endpoint)}`
			);
			const registrationResult = await registrationOnServerResponse.json();

			return {
				settled: true,
				subscription,
				subscribing: false,
				registeredOnServer: registrationResult.registered
			};
		} else {
			if (Notification.permission === 'denied') {
				return {
					settled: true,
					denied: true
				};
			}
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
	let _account: PrivateAccount | undefined;

	function setState(newState: PushNotificationsState) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	function updateState() {
		if (
			_account &&
			_serviceWorker &&
			!_serviceWorker.loading &&
			!_serviceWorker.notSupported &&
			!_serviceWorker.registering &&
			_serviceWorker.registration
		) {
			setState({ settled: false, loading: true });
			const inner = (guard = {});
			Promise.resolve(getSubscriptionState(_serviceWorker.registration, _account)).then((value) => {
				if (guard === inner) {
					setState(value);
				}
			});
		} else {
			setState({ settled: false, loading: false });
		}
	}

	const { subscribe } = derived<
		[Readable<ServiceWorkerState>, Readable<PrivateAccount>],
		PushNotificationsState
	>(
		[serviceWorker, params.account],
		([$serviceWorker, $account], set) => {
			_account = $account;
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
		if (_state.settled && 'subscription' in _state && _state.subscription) {
			// throw new Error(`already subscribed`);
			setState({ ..._state, error: 'already subscribed' });
			return;
		}

		if (_state.settled && 'denied' in _state && _state.denied) {
			// throw new Error(`subscription denied`);
			setState({ ..._state, error: 'subscription denied' });
			return;
		}
		const applicationServerKey = urlB64ToUint8Array(params.serverPublicKey);
		if (
			_account &&
			_serviceWorker &&
			!_serviceWorker.loading &&
			!_serviceWorker.notSupported &&
			!_serviceWorker.registering &&
			_serviceWorker.registration
		) {
			const accountBeingUsed = _account.address;
			setState({ settled: true, subscribing: true, subscription: undefined });
			_serviceWorker.registration.pushManager
				.subscribe({
					userVisibleOnly: true,
					applicationServerKey: applicationServerKey
				})
				.then(async function (subscription) {
					// TODO one more state update to show registrating on server

					if (_account?.address != accountBeingUsed) {
						return;
					}

					await _registerOnServer(_account.address, subscription);
				})
				.catch(function (error) {
					if (Notification.permission === 'denied') {
						setState({ settled: true, denied: true });
						return {
							settled: true,
							denied: true
						};
					} else {
						setState({ settled: true, subscription: undefined, subscribing: false, error });
					}
				});
		} else {
			throw new Error(`account or service worker not set`);
		}
	}

	async function _registerOnServer(address: string, subscription: PushSubscription) {
		let registeredOnServer = false;
		try {
			const response = await fetch(`${params.serverEndpoint}/register`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					address,
					domain: domain,
					subscription: subscription.toJSON()
				})
			});
			if (response.ok) {
				const json = await response.json();
				if (_account?.address != address) {
					// changed in between
					return;
				}
				registeredOnServer = json.registered;
			}
		} catch (err) {
			// TODO
			// show error ?
		}

		setState({ settled: true, subscription, subscribing: false, registeredOnServer });
	}

	function registerOnServer() {
		if (_state.settled && 'subscription' in _state && _state.subscription && _account?.address) {
			_registerOnServer(_account.address, _state.subscription);
		} else {
			throw new Error(`not ready`);
		}
	}

	function acknowledgeError() {
		if ('error' in _state && _state.error) {
			setState({ ..._state, error: undefined });
		}
	}

	async function testPush(message: string) {
		const response = await fetch(`${params.serverEndpoint}/push`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				address: _account?.address,
				domain,
				message
			})
		});
		const text = await response.text();
		console.log({ text });
		return response.ok;
	}

	return { subscribe, refresh, subscribeToPush, registerOnServer, acknowledgeError, testPush };
}
