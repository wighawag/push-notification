import { derived, type Readable } from 'svelte/store';

type PrivateAccount = { address: string; privateKey: string } | undefined;

export type EncryptedStorage<Data> =
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

export function createEncryptedStorage<Data>(params: { account: Readable<PrivateAccount> }) {
	let guard: object | undefined;

	let _state: EncryptedStorage<Data> = { state: 'Idle', account: undefined, data: undefined };
	let _set: ((value: EncryptedStorage<Data>) => void) | undefined;
	let _account: PrivateAccount | undefined;

	function setState(newState: EncryptedStorage<Data>) {
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

	const { subscribe } = derived<Readable<PrivateAccount>, EncryptedStorage<Data>>(
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
