import { derived, type Readable } from 'svelte/store';
import { privateKeyToAddress } from 'viem/accounts';

// TODO ensure it is the best type
type OwnerAccount = { address: string | undefined } | undefined;

export type Signer = {
	address: string;
	privateKey: string;
};

export type PrivateAccount =
	| undefined
	| {
			step: 'RequireConfirmation' | 'Generating';
			owner: string;
			signer: undefined;
	  }
	| {
			step: 'Settled';
			owner: string;
			signer: Signer;
	  };

function computeStorageKey(ownerAddress: string): string {
	return `__private_account_${ownerAddress.toLowerCase()}`;
}

export function createPrivateAccount<Data>(params: {
	ownerAccount: Readable<OwnerAccount> & { getLocalSigner(): Promise<Signer> };
	skipConfirmation?: boolean;
}) {
	let _state: PrivateAccount = undefined;
	let _set: ((value: PrivateAccount) => void) | undefined;
	let _ownerAccount: OwnerAccount | undefined;
	let _cache: Map<string, Signer> = new Map();

	function setState(newState: PrivateAccount) {
		_state = newState;
		if (_set) {
			_set(newState);
		}
	}

	function getSavedSigner(ownerAddress: string) {
		let signer: Signer | undefined = undefined;
		const storageKey = computeStorageKey(ownerAddress);
		const fromMemory = _cache.get(ownerAddress.toLowerCase());
		if (fromMemory) {
			signer = fromMemory;
		} else {
			let fromStorage: string | null | undefined;
			try {
				fromStorage = localStorage.getItem(storageKey);
			} catch {}
			if (fromStorage && fromStorage.startsWith('0x')) {
				const privateKey = fromStorage as `0x${string}`;
				signer = {
					privateKey,
					address: privateKeyToAddress(privateKey)
				};
			}
		}
		return signer;
	}

	function saveSigner(ownerAddress: string, signer: Signer, options?: { toStorage?: boolean }) {
		_cache.set(ownerAddress.toLowerCase(), signer);
		if (options?.toStorage) {
			const storageKey = computeStorageKey(ownerAddress);
			try {
				localStorage.setItem(storageKey, signer.privateKey);
			} catch (err) {
				// TODO error
				console.error(err);
			}
		}
	}

	async function getSigner(): Promise<Signer> {
		return params.ownerAccount.getLocalSigner();
	}

	async function updateState($ownerAccount: OwnerAccount) {
		if ($ownerAccount && $ownerAccount.address) {
			const newOwner = $ownerAccount.address;
			if (_ownerAccount?.address !== newOwner) {
				_ownerAccount = $ownerAccount;
				const savedSigner = getSavedSigner(newOwner);
				if (savedSigner) {
					setState({ owner: newOwner, step: 'Settled', signer: savedSigner });
				} else if (params.skipConfirmation) {
					_requestSigner(newOwner);
				} else {
					setState({ owner: newOwner, step: 'RequireConfirmation', signer: undefined });
				}
			}
		} else {
			_ownerAccount = undefined;
			setState(undefined);
		}
	}

	async function _requestSigner(newOwner: string) {
		setState({ owner: newOwner, step: 'Generating', signer: undefined });
		const value = await getSigner();
		if (newOwner === _ownerAccount?.address) {
			saveSigner(newOwner, value);
			setState({ owner: _ownerAccount.address, step: 'Settled', signer: value });
		} else {
			// setState will have been called then, so we just ignore the result of getSigner
		}
	}

	const { subscribe } = derived<Readable<OwnerAccount>, PrivateAccount>(
		params.ownerAccount,
		($ownerAccount, set) => {
			_set = set;
			updateState($ownerAccount);
		},
		_state
	);

	function requestSigner() {
		if (!_ownerAccount?.address) {
			throw new Error(`no owner set`);
		}
		_requestSigner(_ownerAccount?.address);
	}

	return { subscribe, requestSigner };
}
