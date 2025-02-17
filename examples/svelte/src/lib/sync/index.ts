import { decrypt, encrypt } from '$lib/utils/encryption';
import { privateKeyToAccount } from 'viem/accounts';

type Signer = {
	address: string;
	privateKey: string;
};

export function createSync<T>(params: { syncURI: string; dbName: string }) {
	const dbName = params.dbName;
	const syncURI = params.syncURI;
	let _lastId = 1;

	async function fetchRemoteData(
		signer: Signer
	): Promise<{ data: T; counter: bigint } | undefined> {
		let response: Response;
		try {
			response = await _syncRequest('wallet_getString', [signer.address, dbName]);
		} catch (e) {
			console.error(e);
			return undefined;
		}

		const json = await response.json();
		if (json.error) {
			console.error(json.error);
			return undefined;
		}
		let data: T;
		if (json.result.data && json.result.data !== '') {
			try {
				const decryptedData = decrypt(signer.privateKey, json.result.data);
				data = JSON.parse(decryptedData);
			} catch (err: any) {
				console.error(err);
				return undefined;
			}
		} else {
			data = {} as T;
		}
		return { data, counter: BigInt(json.result.counter) };
	}

	async function postToRemote(signer: Signer, data: T, syncDownCounter: bigint): Promise<void> {
		const dataToEncrypt = JSON.stringify(data);
		const encryptedData = encrypt(signer.privateKey, dataToEncrypt);

		const counter = (syncDownCounter + 1n).toString();
		const viemSigner = privateKeyToAccount(signer.privateKey as `0x${string}`);
		const signature = await viemSigner.signMessage({
			message: 'put:' + dbName + ':' + counter + ':' + encryptedData
		});

		let json;
		let error;
		try {
			const response = await _syncRequest('wallet_putString', [
				signer.address,
				dbName,
				counter,
				encryptedData,
				signature
			]);
			json = await response.json();
			if (json.error) {
				throw new Error(json.error);
			}
		} catch (e) {
			error = e;
		}
		if (error || json.error) {
			console.error(error || json.error);
			return; // TODO retry ?
		}
		if (!json.result || !json.result.success) {
			console.error('sync no success', json);
			return; // TODO retry ?
		} else {
			// logger.info('synced!');
		}
	}

	async function _syncRequest(method: string, params: string[]): Promise<Response> {
		return fetch(syncURI, {
			// TODO env variable
			method: 'POST',
			body: JSON.stringify({
				method,
				params,
				jsonrpc: '2.0',
				id: ++_lastId
			}),
			headers: {
				'Content-type': 'application/json; charset=UTF-8'
			}
		});
	}

	return {
		postToRemote,
		fetchRemoteData
	};
}
