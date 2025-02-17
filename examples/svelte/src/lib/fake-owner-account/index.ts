import { writable } from 'svelte/store';
import { privateKeyToAddress, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

export type FakeOwnerAccount = { address: string | undefined } | undefined;

export function createFakeOwnerAccount() {
	const accountsPrivateKeys = [
		'0xedc1b70e424ba5ba048248afd5c1a69c37e83db9c91381443e109acb5cb2b29a',
		'0x144f288928a9b292ba05e96a91cd870846af40e24292c5716cf6ae45d3f08cec',
		'0xb257341b5ff898fbc760edf43795f68d086b03db71ab5b695e0d59c800c5d5eb',
		'0x7d0c2c1e739e0371fb10ef47df9535b3ea514bfe572748c9d267a381cb6e295c',
		'0x3f81609e73d3c100ad513e728fed531e3a5b16e669f5ef1ecaabd0f4934ccb9a'
	] as const;
	const accounts = accountsPrivateKeys.map((v) => {
		return {
			address: privateKeyToAddress(v),
			privateKey: v,
			viemAccount: privateKeyToAccount(v)
		};
	});

	let currentAccount:
		| { index: number; address: string; privateKey: string; viemAccount: PrivateKeyAccount }
		| undefined = {
		...accounts[0],
		index: 0
	};

	const store = writable<FakeOwnerAccount>({ address: currentAccount.address });
	function switchAccount(i?: number) {
		const newIndex =
			typeof i === 'undefined'
				? (currentAccount ? currentAccount.index + 1 : 0) % accounts.length
				: i;

		console.log({ newIndex, oldIndex: currentAccount?.index, i });
		currentAccount = {
			...accounts[newIndex],
			index: newIndex
		};
		store.set({ address: currentAccount.address });
	}
	function disableAccount() {
		currentAccount = undefined;
		store.set(undefined);
	}

	// TODO accept parameter, message ?
	async function getLocalSigner(): Promise<{ address: string; privateKey: string }> {
		if (!currentAccount) {
			throw new Error(`no account`);
		}
		const currentAccountAddress = currentAccount.address;
		const signature = await currentAccount.viemAccount.signMessage({ message: 'hello world' });

		if (currentAccount.address !== currentAccountAddress) {
			throw new Error(`account changed`);
		}
		const privateKey = signature.slice(0, 66) as `0x${string}`;

		return {
			address: privateKeyToAddress(privateKey),
			privateKey
		};
	}

	return {
		subscribe: store.subscribe,
		switchAccount,
		disableAccount,
		getLocalSigner
	};
}
