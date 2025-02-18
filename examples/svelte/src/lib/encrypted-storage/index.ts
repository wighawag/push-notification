import { createSync } from '$lib/sync';
import { decrypt, encrypt } from '$lib/utils/encryption';
import { wait } from '$lib/utils/time';
import { createLocalStorageProvider } from '$lib/web/local-storage';
import { debounce } from 'perfect-debounce';
import { derived, type Readable } from 'svelte/store';

type Signer = { address: string; privateKey: string };
type LoadedPrivateAccount = { signer: Signer };
type PrivateAccount = LoadedPrivateAccount | { signer: undefined } | undefined;

export type EncryptedStorage<Data> =
	| undefined
	| {
			loading: true;
			data: undefined;
			remoteFetchedAtLeastOnce: false;
	  }
	| {
			loading: false;
			data: Data;
			counter: number;
			syncError?: { message: string; cause: any };
			remoteFetchedAtLeastOnce: boolean;
	  };

export type StorageProvider = {
	save(key: string, data: string): Promise<void>;
	load(key: string): Promise<string>;
};

export type MergeFunction<T> = (
	localData: Readonly<T>,
	remoteData: Readonly<T>
) => { newData: T; newDataOnLocal: boolean; newDataOnRemote: boolean };

export type CleanFunction<T> = (data: Readonly<T>) => T;

const localStorageProvider = createLocalStorageProvider();

export function createEncryptedStorage<Data>(params: {
	defaultData: Data;
	account: Readable<PrivateAccount>;
	dbName: string;
	debug?: {
		delay?: number;
	};
	sync?: {
		uri: string;
		syncIntervalInSeconds?: number;
	};
	localSyncIntervalInSeconds?: number;
	storageProvider?: StorageProvider;
	merge: MergeFunction<Data>;
	clean: CleanFunction<Data>;
}) {
	const dbName = params.dbName;
	const syncURI = params.sync?.uri;

	const sync = syncURI
		? createSync<Data>({
				syncURI,
				dbName
			})
		: undefined;

	let _state: EncryptedStorage<Data> = undefined;
	let _set: ((value: EncryptedStorage<Data>) => void) | undefined;
	let _account: PrivateAccount | undefined;

	const _defaultData = structuredClone(params.defaultData);
	const storageProvider = params.storageProvider || localStorageProvider;

	const localSyncIntervalInSeconds = params.localSyncIntervalInSeconds;
	const remoteSyncIntervalInSeconds = params.sync?.syncIntervalInSeconds || 300; // 5 min by default

	function computeStorageKey(account: string) {
		return `__storage_${dbName}_${account}`;
	}

	function setState(newState: EncryptedStorage<Data>) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	async function firstLoad(signer: Signer): Promise<{
		data: Data;
		newDataToSaveOnLocal: boolean;
		newDataToSaveOnRemote: boolean;
		remoteCounter: bigint | undefined;
	}> {
		const {
			data: dataAfterRemoteSync,
			newDataOnRemote,
			remoteCounter
		} = await _syncWithRemote(signer, _defaultData);
		const {
			data: dataAfterLocalSync,
			newDataOnLocal: newDataToSaveOnLocal,
			newDataOnRemote: newDataToSaveOnRemote
		} = await _syncWithLocalStorage(signer, dataAfterRemoteSync);

		const cleaned = params.clean(dataAfterLocalSync);

		return { data: cleaned, newDataToSaveOnLocal, newDataToSaveOnRemote, remoteCounter };
	}

	async function updateState($account: PrivateAccount) {
		if (typeof window === 'undefined') {
			return;
		}
		if ($account && $account.signer) {
			if ($account.signer.address != _account?.signer?.address) {
				_account = $account;
				setState({ loading: true, data: undefined, remoteFetchedAtLeastOnce: false });
				const signer = structuredClone(_account.signer);
				const { data, newDataToSaveOnLocal, newDataToSaveOnRemote, remoteCounter } =
					await firstLoad(signer);
				if (signer.address == _account.signer.address) {
					setState({
						loading: false,
						data,
						counter: 0,
						remoteFetchedAtLeastOnce: typeof remoteCounter !== 'undefined'
					});
					if (newDataToSaveOnRemote && remoteCounter) {
						saveToRemoteOnceIdle(data, remoteCounter);
					}
					if (newDataToSaveOnLocal) {
						await _saveToStorageDirectly(data);
					}
				} else {
					// skip as we are dealing with an outdated response, pertaining to an other account
				}
			} else {
				// nothing to do
			}
		} else {
			_account = undefined;
			setState(undefined);
		}
	}

	async function _syncWithLocalStorage(
		signer: Signer,
		localData: Data
	): Promise<{
		data: Data;
		newDataOnRemote: boolean;
		newDataOnLocal: boolean;
	}> {
		const key = computeStorageKey(signer.address);

		const fromStorage = await storageProvider.load(key);

		let dataFromStorage: Data | undefined;
		if (fromStorage) {
			try {
				const decrypted = decrypt(signer.privateKey, fromStorage);
				dataFromStorage = JSON.parse(decrypted) as Data;
			} catch {
				dataFromStorage = undefined;
			}
		}

		if (dataFromStorage) {
			const merged = params.merge(localData, dataFromStorage);

			const cleaned = params.clean(merged.newData);

			return {
				data: cleaned,
				newDataOnRemote: merged.newDataOnRemote,
				newDataOnLocal: merged.newDataOnLocal
			};
		} else {
			return { data: localData, newDataOnRemote: false, newDataOnLocal: false };
		}
	}

	async function _syncWithRemote(
		signer: Signer,
		localData: Data
	): Promise<{
		data: Data;
		newDataOnRemote: boolean;
		newDataOnLocal: boolean;
		remoteCounter: bigint | undefined;
	}> {
		if (params?.debug?.delay) {
			await wait(params?.debug?.delay);
		}
		let remoteResult: { data: Data; counter: bigint } | undefined;
		if (sync) {
			try {
				remoteResult = await sync.fetchRemoteData(signer);
			} catch (err) {
				// console.error(err);
				// TODO
			}
		}

		if (remoteResult && remoteResult.data) {
			const merged = params.merge(localData || _defaultData, remoteResult.data);

			if (merged.newData) {
				const cleaned = params.clean(merged.newData);

				return {
					data: cleaned,
					newDataOnRemote: merged.newDataOnRemote,
					newDataOnLocal: merged.newDataOnLocal,
					remoteCounter: remoteResult.counter
				};
			} else {
				return {
					data: _defaultData,
					newDataOnRemote: false,
					newDataOnLocal: false,
					remoteCounter: remoteResult.counter
				};
			}
		} else {
			return {
				data: localData || _defaultData,
				newDataOnRemote: false,
				newDataOnLocal: false,
				remoteCounter: undefined
			};
		}
	}

	async function _saveToStorageDirectly(data: Data) {
		if (!_state) {
			throw new Error(`No State`);
		}
		if (_state.loading) {
			throw new Error(`Not loaded`);
		}
		const account = _account;
		if (!account || !account.signer) {
			throw new Error(`cannot save as no account set`);
		}
		const accountAddress = account.signer.address;
		const privateKey = account.signer.privateKey;

		const key = computeStorageKey(accountAddress);
		const toStore = encrypt(privateKey, JSON.stringify(data));

		if (params?.debug?.delay) {
			await wait(params?.debug?.delay);
		}
		try {
			await localStorageProvider.save(key, toStore);
		} catch (err) {
			// console.error(err);
			// TODO state
		}
	}

	const _saveToStorageOnceIdle = debounce(_saveToStorageDirectly, 100);
	function saveToStorageOnceIdle(data: Data) {
		const dataToStore = structuredClone(data);
		return _saveToStorageOnceIdle(dataToStore);
	}

	async function _saveToRemoteDirectly(data: Data, counter: bigint) {
		if (!sync) {
			return;
		}
		if (!_state) {
			throw new Error(`No State`);
		}
		if (_state.loading) {
			throw new Error(`Not loaded`);
		}
		const account = _account;
		if (!account || !account.signer) {
			throw new Error(`cannot save as no account set`);
		}
		const accountAddress = account.signer.address;
		const privateKey = account.signer.privateKey;
		const dataToStore = structuredClone(data);

		if (params?.debug?.delay) {
			await wait(params?.debug?.delay);
		}
		await sync.postToRemote({ address: accountAddress, privateKey }, dataToStore, counter);
	}

	const _saveToRemoteOnceIdle = debounce(_saveToRemoteDirectly, 100);
	function saveToRemoteOnceIdle(data: Data, counter: bigint) {
		const dataToStore = structuredClone(data);
		return _saveToRemoteOnceIdle(dataToStore, counter);
	}

	async function update(func: (v: Data) => Data) {
		if (!_state) {
			throw new Error(`No State`);
		}
		if (_state.loading) {
			throw new Error(`Not loaded`);
		}

		const newValue = func(_state.data);
		if (!newValue) {
			return;
		}
		// every time we modify the data , we increase the counter
		// this allow us to ensure that on pending merge or sync, we can ignore them if new data arrived in between
		setState({ ..._state, data: newValue, counter: _state.counter + 1 });

		await saveToStorageOnceIdle(newValue);
	}

	let pendingRemoteSync: NodeJS.Timeout | undefined;
	async function periodicRemoteSync() {
		if (!_account?.signer) {
			return;
		}
		if (!_state) {
			return;
		}
		if (_state?.loading) {
			return;
		}
		const signer = structuredClone(_account.signer);
		const counter = _state.counter;

		const {
			data: dataAfterRemoteSync,
			newDataOnRemote,
			remoteCounter
		} = await _syncWithRemote(signer, _state.data);
		const {
			data: dataAfterLocalSync,
			newDataOnLocal: newDataToSaveOnLocal,
			newDataOnRemote: newDataToSaveOnRemote
		} = await _syncWithLocalStorage(signer, dataAfterRemoteSync);

		if (_state.counter != counter) {
			// we skip // TODO trigger it again, use setTimeout instead of setInterval
			return;
		}

		if (signer.address != _account.signer?.address) {
			// skip as we are dealing with an outdated response, pertaining to an other account
			return;
		}

		const cleaned = params.clean(dataAfterLocalSync);

		if (newDataOnRemote || newDataToSaveOnRemote) {
			setState({
				loading: false,
				data: cleaned,
				counter: _state.counter,
				remoteFetchedAtLeastOnce:
					_state.remoteFetchedAtLeastOnce || typeof remoteCounter !== 'undefined'
			});
		}

		if (newDataToSaveOnRemote && remoteCounter) {
			saveToRemoteOnceIdle(cleaned, remoteCounter);
		}
		if (newDataToSaveOnLocal) {
			saveToStorageOnceIdle(cleaned);
		}
	}
	let pendingLocalSync: NodeJS.Timeout | undefined;
	async function preiodicLocalSync() {
		if (!_account?.signer) {
			return;
		}
		if (!_state) {
			return;
		}
		if (_state?.loading) {
			return;
		}

		const signer = structuredClone(_account.signer);
		const counter = _state.counter;

		const {
			data: dataAfterLocalSync,
			newDataOnLocal: newDataToSaveOnLocal,
			newDataOnRemote: newDataToSaveOnMemory
		} = await _syncWithLocalStorage(signer, _state.data);

		if (_state.counter != counter) {
			// we skip // TODO trigger it again, use setTimeout instead of setInterval
			return;
		}

		if (signer.address != _account.signer?.address) {
			// skip as we are dealing with an outdated response, pertaining to an other account
			return;
		}
		const cleaned = params.clean(dataAfterLocalSync);

		if (newDataToSaveOnMemory) {
			setState({
				loading: false,
				data: cleaned,
				counter: _state.counter,
				remoteFetchedAtLeastOnce: _state.remoteFetchedAtLeastOnce
			});
		}
		if (newDataToSaveOnLocal) {
			saveToStorageOnceIdle(cleaned);
		}
	}

	const { subscribe } = derived<Readable<PrivateAccount>, EncryptedStorage<Data>>(
		params.account,
		($account, set) => {
			_set = set;
			updateState($account);

			pendingRemoteSync = setInterval(periodicRemoteSync, remoteSyncIntervalInSeconds * 1000);
			if (localSyncIntervalInSeconds) {
				pendingLocalSync = setInterval(preiodicLocalSync, localSyncIntervalInSeconds * 1000);
			}

			return () => {
				if (pendingRemoteSync) {
					clearInterval(pendingRemoteSync);
					pendingRemoteSync = undefined;
				}
				if (pendingLocalSync) {
					clearInterval(pendingLocalSync);
					pendingLocalSync = undefined;
				}
			};
		},
		_state
	);

	return { subscribe, update };
}
