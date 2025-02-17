import { derived, type Readable } from 'svelte/store';

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

export function createPrivateAccount<Data>(params: {
	ownerAccount: Readable<OwnerAccount> & { getLocalSigner(): Promise<Signer> };
	skipConfirmation?: boolean;
}) {
	let _state: PrivateAccount = undefined;
	let _set: ((value: PrivateAccount) => void) | undefined;
	let _ownerAccount: OwnerAccount | undefined;

	function setState(newState: PrivateAccount) {
		_state = newState;
		if (_set) {
			_set(newState);
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
				if (params.skipConfirmation) {
					_requestSigner(newOwner);
				} else {
					setState({ owner: newOwner, step: 'RequireConfirmation', signer: undefined });
				}
			}
		} else {
			setState(undefined);
		}
	}

	async function _requestSigner(newOwner: string) {
		setState({ owner: newOwner, step: 'Generating', signer: undefined });
		const value = await getSigner();
		if (newOwner === _ownerAccount?.address) {
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
