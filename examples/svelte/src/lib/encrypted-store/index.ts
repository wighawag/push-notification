import { derived, type Readable } from 'svelte/store';

type PrivateAccount = { address: string; privateKey: string } | undefined;

export type EncryptedStoreState<Data> =
	| {
			account: undefined;
			state: 'Idle';
			data: undefined;
	  }
	| {
			state: 'Loading';
			account: PrivateAccount;
			data: undefined;
	  }
	| {
			state: 'Loaded';
			account: PrivateAccount;
			data: Data;
	  };

export function createEncryptedStore<Data>(params: { account: Readable<PrivateAccount> }) {
	let guard: object | undefined;

	let _state: EncryptedStoreState<Data> = { state: 'Idle', account: undefined, data: undefined };
	let _set: ((value: EncryptedStoreState<Data>) => void) | undefined;
	let _account: PrivateAccount | undefined;

	function setState(newState: EncryptedStoreState<Data>) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	async function readAndDecrypt(): Promise<Data> {
		return {} as Data; // TODO
	}

	async function updateState() {
		if (_account) {
			setState({ state: 'Loading', account: _account, data: undefined });
			const inner = (guard = {});

			const value = await readAndDecrypt();
			if (guard === inner) {
				setState({ state: 'Loaded', account: _account, data: value });
			}
		} else {
			setState({ state: 'Idle', account: undefined, data: undefined });
		}
	}

	const { subscribe } = derived<Readable<PrivateAccount>, EncryptedStoreState<Data>>(
		params.account,
		($account, set) => {
			_account = $account;
			_set = set;
			updateState();
		},
		_state
	);

	return { subscribe };
}
