import { createSync } from '$lib/sync';
import { decrypt, encrypt } from '$lib/utils/encryption';
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
	  }
	| {
			loading: false;
			data: Data;
	  };

export type StorageProvider = {
	save(key: string, data: string): Promise<void>;
	load(key: string): Promise<string>;
};

export type MergeFunction<T> = (
	localData?: T,
	remoteData?: T
) => { newData: T | undefined; newDataOnLocal: boolean; newDataOnRemote: boolean };

export type CleanFunction<T> = (data: T) => T;

const localStorageProvider = createLocalStorageProvider();

export function createEncryptedStorage<Data>(params: {
	defaultData: Data;
	account: Readable<PrivateAccount>;
	dbName: string;
	syncURI?: string;
	storageProvider?: StorageProvider;
	merge: MergeFunction<Data>;
	clean: CleanFunction<Data>;
}) {
	const dbName = params.dbName;
	const syncURI = params.syncURI;

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

	function computeStorageKey(account: string) {
		return `__storage_${dbName}_${account}`;
	}

	function setState(newState: EncryptedStorage<Data>) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	async function firstLoad(account: LoadedPrivateAccount): Promise<Data> {
		const accountAddress = account.signer.address;
		const privateKey = account.signer.privateKey;
		const key = computeStorageKey(accountAddress);
		const fromStorage = await storageProvider.load(key);
		// TODO ignore if account change
		let local: Data;
		if (fromStorage) {
			try {
				const decrypted = decrypt(privateKey, fromStorage);
				local = JSON.parse(decrypted) as Data;
			} catch {
				local = structuredClone(_defaultData);
			}
		} else {
			local = structuredClone(_defaultData);
		}

		if (!sync) {
			return local;
		}

		const remote = await sync.fetchRemoteData({ address: accountAddress, privateKey });
		if (!remote) {
			// TODO epect error in sync and show error in store
			return local;
		}
		// TODO ignore if account change
		if (!remote.data) {
			return local;
		}
		const merged = params.merge(local, remote.data);

		// TODO use the result of merge to sync back with remote or saveToStorage

		return merged.newData || _defaultData;
	}

	async function updateState($account: PrivateAccount) {
		if ($account && $account.signer) {
			if ($account.signer.address != _account?.signer?.address) {
				_account = $account;
				setState({ loading: true, data: undefined });
				const accountAddress = _account.signer.address;

				const value = await firstLoad(_account);
				if (accountAddress == _account.signer.address) {
					setState({ loading: false, data: value });
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

	async function syncFromStorage() {
		// read local storage or indexed db and merge with in-memory
		// (could have been modified by another tab / window)
	}

	async function syncFromRemote() {
		// we should sync regularly from remote
		// and merge with in-memory
	}

	async function _saveToStorage() {
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
		const data = structuredClone(_state.data);

		const key = computeStorageKey(accountAddress);
		const toStore = encrypt(privateKey, JSON.stringify(data));
		await localStorageProvider.save(key, toStore);
	}

	function saveToStorage() {
		debounce(_saveToStorage, 100);
	}

	function update(func: (v: Data) => Data) {
		if (!_state) {
			throw new Error(`No State`);
		}
		if (_state.loading) {
			throw new Error(`Not loaded`);
		}

		const newValue = func(_state.data);
		setState({ ..._state, data: newValue });

		saveToStorage();
	}

	const { subscribe } = derived<Readable<PrivateAccount>, EncryptedStorage<Data>>(
		params.account,
		($account, set) => {
			_set = set;
			updateState($account);
		},
		_state
	);

	return { subscribe, update };
}
