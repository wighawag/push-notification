import { derived, type Readable } from 'svelte/store';
import { type ServiceWorkerState } from '..';
import { urlB64ToUint8Array } from './utils';
import {
	delegatePublicKey,
	fromDomainToOrigin,
	originPublicKeyPublicationMessage,
	REQUEST_SIGNATURE_HEADER,
	signRequest
} from 'missiv-identity';

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

/**
 * The account notifications are addressed to (`owner`, the wallet) and the
 * delegate key the app holds for it (`signer`), which signs each registration.
 */
type PrivateAccount =
	| { owner: string; signer: { address: string; privateKey: string } | undefined }
	| undefined;

export function createPushNotificationService(params: {
	serverPublicKey: string;
	serverEndpoint: string;
	domain: string;
	account: Readable<PrivateAccount>;
	serviceWorker: Readable<ServiceWorkerState>;
	/**
	 * The owner's wallet signing `message` (EIP-191): the ownership proof that
	 * authorizes the delegate key for this domain. Asked once per registration.
	 */
	signOwnership: (owner: string, message: string) => Promise<`0x${string}`>;
}) {
	const domain = params.domain;
	async function getSubscriptionState(
		registration: ServiceWorkerRegistration,
		account: PrivateAccount
	): Promise<PushNotificationsState> {
		const accountAddress = account?.signer ? account.owner : undefined;
		if (!accountAddress) {
			return {
				settled: false,
				loading: false
			};
		}
		const subscription = await registration.pushManager.getSubscription();
		if (subscription) {
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
		[params.serviceWorker, params.account],
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
		const accountAddress = _account?.signer ? _account.owner : undefined;
		if (
			accountAddress &&
			_serviceWorker &&
			!_serviceWorker.notSupported &&
			!_serviceWorker.registering &&
			_serviceWorker.registration
		) {
			const accountBeingUsed = accountAddress;
			setState({ settled: true, subscribing: true, subscription: undefined });
			_serviceWorker.registration.pushManager
				.subscribe({
					userVisibleOnly: true,
					applicationServerKey: applicationServerKey
				})
				.then(async function (subscription) {
					// TODO one more state update to show registrating on server

					if (!_account?.signer || _account.owner != accountBeingUsed) {
						return;
					}

					await _registerOnServer(_account.owner, _account.signer.privateKey, subscription);
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

	async function _registerOnServer(
		address: string,
		delegatePrivateKey: string,
		subscription: PushSubscription
	) {
		let registeredOnServer = false;
		try {
			// the wallet authorizes the delegate key for this domain, the delegate key signs the request
			const ownershipSignature = await params.signOwnership(
				address,
				originPublicKeyPublicationMessage(
					fromDomainToOrigin(domain),
					delegatePublicKey(delegatePrivateKey as `0x${string}`)
				)
			);
			const body = JSON.stringify({
				address,
				domain: domain,
				subscription: subscription.toJSON(),
				ownershipSignature
			});
			const response = await fetch(`${params.serverEndpoint}/register`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					[REQUEST_SIGNATURE_HEADER]: await signRequest(body, delegatePrivateKey as `0x${string}`)
				},
				body
			});
			if (response.ok) {
				const json = await response.json();
				if (_account?.owner != address) {
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
		const signer = _account?.signer;
		if (_state.settled && 'subscription' in _state && _state.subscription && _account && signer) {
			_registerOnServer(_account.owner, signer.privateKey, _state.subscription);
		} else {
			throw new Error(`not ready`);
		}
	}

	function acknowledgeError() {
		if ('error' in _state && _state.error) {
			setState({ ..._state, error: undefined });
		}
	}

	// a push is sent by a service holding the domain's token (POST /push), never by the browser
	return { subscribe, refresh, subscribeToPush, registerOnServer, acknowledgeError };
}
