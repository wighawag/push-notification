// A client of the wire protocol, written from the protocol and NOT from the
// server's code, so the tests pin what a caller sends: the wallet's signature
// over missiv's publication message (the ownership proof) and the delegate
// key's signature over the raw request body (the SIGNATURE header).
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {getPublicKey, signAsync, utils as secpUtils} from '@noble/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {bytesToHex} from '@noble/hashes/utils';

export type Identity = {
	address: `0x${string}`;
	delegatePrivateKey: Uint8Array;
	publicKey: `0x${string}`;
	ownershipSignature: `0x${string}`;
	domain: string;
};

export function publicationMessage(origin: string, publicKey: `0x${string}`): string {
	return `Origin: ${origin}\n\nIMPORTANT: Only sign on trusted websites.\n\nThis authorizes the following Public Key to represent your account:\n\n${publicKey}\n\nOthers can use this key to write encrypted messages to you securely.`;
}

export function originOf(domain: string): string {
	if (domain.startsWith('https://')) {
		return domain;
	}
	if (domain === 'localhost' || domain.startsWith('localhost:')) {
		return `http://${domain}`;
	}
	return `https://${domain}`;
}

export async function createIdentity(domain: string, options?: {signedForDomain?: string}): Promise<Identity> {
	const wallet = privateKeyToAccount(generatePrivateKey());
	const delegatePrivateKey = secpUtils.randomPrivateKey();
	const publicKey = `0x${bytesToHex(getPublicKey(delegatePrivateKey))}` as const;
	const ownershipSignature = await wallet.signMessage({
		message: publicationMessage(originOf(options?.signedForDomain ?? domain), publicKey),
	});
	return {address: wallet.address, delegatePrivateKey, publicKey, ownershipSignature, domain};
}

export async function signBody(body: string, delegatePrivateKey: Uint8Array): Promise<string> {
	const signature = await signAsync(keccak_256(body), delegatePrivateKey);
	return `${signature.toCompactHex()}:${signature.recovery}`;
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

/** The body and headers of a POST /register, signed as a client signs it. */
export async function registration(
	identity: Identity,
	subscription: SubscriptionJSON,
	options?: {signer?: Identity; address?: string; tamper?: (body: string) => string; noSignature?: boolean},
): Promise<RequestInit> {
	const body = JSON.stringify({
		address: options?.address ?? identity.address,
		domain: identity.domain,
		subscription,
		ownershipSignature: identity.ownershipSignature,
	});
	const headers: Record<string, string> = {'content-type': 'application/json'};
	if (!options?.noSignature) {
		headers.SIGNATURE = await signBody(body, (options?.signer ?? identity).delegatePrivateKey);
	}
	return {method: 'POST', headers, body: options?.tamper ? options.tamper(body) : body};
}
