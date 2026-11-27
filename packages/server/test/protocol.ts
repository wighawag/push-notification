// A client of the wire protocol, written from the protocol and NOT from the
// server's code (nor delegated-identity's), so the tests pin what a caller sends:
// the account's key set (an Ed25519 signing key and an X25519 encryption key,
// both in the body as `keySet`), the wallet's EIP-191 signature over the
// publication message naming both for the app origin (the ownership proof),
// and the signing key's Ed25519 signature over the request envelope (the
// SIGNATURE header: <timestamp>:<signing key hex>:<signature hex>).
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {ed25519, x25519} from '@noble/curves/ed25519';
import {sha256} from '@noble/hashes/sha2';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex, hexToBytes} from '@noble/hashes/utils';
import {hashMessage} from 'viem';

/** The origin app.request gives a path: what the server sees as its own. */
export const SERVER_ORIGIN = 'http://localhost';

/** The public keys of a key set, as a body carries them (0x-prefixed hex, 32 bytes each). */
export type PublicKeySet = {signing: {publicKey: `0x${string}`}; encryption: {publicKey: `0x${string}`}};

export type Identity = {
	address: `0x${string}`;
	/** the Ed25519 private key (seed) that signs each request */
	signingPrivateKey: Uint8Array;
	keySet: PublicKeySet;
	ownershipSignature: `0x${string}`;
	domain: string;
	/** the wallet, to sign another publication in a test */
	signMessage(message: string): Promise<`0x${string}`>;
};

export function publicationMessage(origin: string, keySet: PublicKeySet): string {
	return [
		`Origin: ${origin}`,
		'',
		'IMPORTANT: Only sign on trusted websites.',
		'',
		'This authorizes the following keys for your account:',
		'',
		'Signing key, to act for your account in this app:',
		`ed25519:${keySet.signing.publicKey.toLowerCase()}`,
		'',
		'Encryption key, for others to send you encrypted messages:',
		`x25519:${keySet.encryption.publicKey.toLowerCase()}`,
	].join('\n');
}

/** The publication message of delegated-identity 0.1.0, naming one secp256k1 key: no longer accepted. */
export function legacyPublicationMessage(origin: string, publicKey: `0x${string}`): string {
	return `Origin: ${origin}\n\nIMPORTANT: Only sign on trusted websites.\n\nThis authorizes the following Public Key to represent your account:\n\n${publicKey}\n\nOthers can use this key to write encrypted messages to you securely.`;
}

export function originOf(domain: string): string {
	if (domain.startsWith('https://') || domain.startsWith('http://')) {
		return domain;
	}
	if (domain === 'localhost' || domain.startsWith('localhost:')) {
		return `http://${domain}`;
	}
	return `https://${domain}`;
}

const hex = (bytes: Uint8Array): `0x${string}` => `0x${bytesToHex(bytes)}`;

/** A fresh key set: random keys, as the server cannot tell how an app derived them. */
export function newKeySet(): {signingPrivateKey: Uint8Array; keySet: PublicKeySet} {
	const signingPrivateKey = ed25519.utils.randomPrivateKey();
	const encryptionPrivateKey = x25519.utils.randomPrivateKey();
	return {
		signingPrivateKey,
		keySet: {
			signing: {publicKey: hex(ed25519.getPublicKey(signingPrivateKey))},
			encryption: {publicKey: hex(x25519.getPublicKey(encryptionPrivateKey))},
		},
	};
}

export async function createIdentity(domain: string, options?: {signedForDomain?: string}): Promise<Identity> {
	const wallet = privateKeyToAccount(generatePrivateKey());
	const {signingPrivateKey, keySet} = newKeySet();
	const ownershipSignature = await wallet.signMessage({
		message: publicationMessage(originOf(options?.signedForDomain ?? domain), keySet),
	});
	return {
		address: wallet.address,
		signingPrivateKey,
		keySet,
		ownershipSignature,
		domain,
		signMessage: (message) => wallet.signMessage({message}),
	};
}

export type RequestToSign = {serverOrigin: string; method: string; path: string; body: string; timestamp: number};

export async function signRequest(request: RequestToSign, signingPrivateKey: Uint8Array): Promise<string> {
	const envelope = [
		'delegated-identity ed25519 request v1',
		`origin: ${request.serverOrigin}`,
		`route: ${request.method} ${request.path}`,
		`timestamp: ${request.timestamp}`,
		`body: sha256:0x${bytesToHex(sha256(new TextEncoder().encode(request.body)))}`,
	].join('\n');
	const signature = ed25519.sign(new TextEncoder().encode(envelope), signingPrivateKey);
	return `${request.timestamp}:${bytesToHex(ed25519.getPublicKey(signingPrivateKey))}:${bytesToHex(signature)}`;
}

/**
 * A request signature as delegated-identity 0.1.0 made it, by a secp256k1 key
 * over an EIP-191 envelope (`<timestamp>:<compact hex>:<recovery bit>`): no
 * longer accepted. Returns the header and the key's public key.
 */
export async function signLegacyRequest(
	request: RequestToSign,
): Promise<{signature: string; publicKey: `0x${string}`}> {
	const key = privateKeyToAccount(generatePrivateKey());
	const envelope = [
		'delegated-identity request v1',
		`origin: ${request.serverOrigin}`,
		`route: ${request.method} ${request.path}`,
		`timestamp: ${request.timestamp}`,
		`body: 0x${bytesToHex(keccak_256(request.body))}`,
	].join('\n');
	const signed = hexToBytes((await key.sign({hash: hashMessage(envelope)})).slice(2));
	return {
		signature: `${request.timestamp}:${bytesToHex(signed.slice(0, 64))}:${signed[64] - 27}`,
		publicKey: key.publicKey,
	};
}

export type SubscriptionJSON = {
	endpoint: string;
	expirationTime: number | null;
	keys: {p256dh: string; auth: string};
};

let subscriptionCounter = 0;
export function newSubscription(options?: {expirationTime?: number | null}): SubscriptionJSON {
	subscriptionCounter++;
	return {
		endpoint: `https://push.invalid/device-${subscriptionCounter}-${Math.random().toString(36).slice(2)}`,
		expirationTime: options?.expirationTime ?? null,
		keys: {p256dh: `p256dh-${subscriptionCounter}`, auth: `auth-${subscriptionCounter}`},
	};
}

/** The body and headers of a POST /unregister, signed as a client signs it. */
export async function removal(
	identity: Identity,
	endpoint: string,
	options?: {signer?: Identity; address?: string},
): Promise<RequestInit> {
	const body = JSON.stringify({
		address: options?.address ?? identity.address,
		domain: identity.domain,
		endpoint,
		keySet: identity.keySet,
		ownershipSignature: identity.ownershipSignature,
	});
	const signature = await signRequest(
		{serverOrigin: SERVER_ORIGIN, method: 'POST', path: '/api/unregister', body, timestamp: Date.now()},
		(options?.signer ?? identity).signingPrivateKey,
	);
	return {method: 'POST', headers: {'content-type': 'application/json', SIGNATURE: signature}, body};
}

/** The body and headers of a POST /register, signed as a client signs it. */
export async function registration(
	identity: Identity,
	subscription: SubscriptionJSON,
	options?: {
		signer?: Identity;
		address?: string;
		/** the key set the body names, instead of the identity's */
		keySet?: PublicKeySet;
		/** the ownership signature the body carries, instead of the identity's */
		ownershipSignature?: `0x${string}`;
		tamper?: (body: string) => string;
		noSignature?: boolean;
		serverOrigin?: string;
		path?: string;
		timestamp?: number;
		/** more fields of the body, signed with it (e.g. `replaceOtherAccounts`) */
		extra?: Record<string, unknown>;
	},
): Promise<RequestInit> {
	const body = JSON.stringify({
		address: options?.address ?? identity.address,
		domain: identity.domain,
		subscription,
		keySet: options?.keySet ?? identity.keySet,
		ownershipSignature: options?.ownershipSignature ?? identity.ownershipSignature,
		...options?.extra,
	});
	const headers: Record<string, string> = {'content-type': 'application/json'};
	if (!options?.noSignature) {
		headers.SIGNATURE = await signRequest(
			{
				serverOrigin: options?.serverOrigin ?? SERVER_ORIGIN,
				method: 'POST',
				path: options?.path ?? '/api/register',
				body,
				timestamp: options?.timestamp ?? Date.now(),
			},
			(options?.signer ?? identity).signingPrivateKey,
		);
	}
	return {method: 'POST', headers, body: options?.tamper ? options.tamper(body) : body};
}
