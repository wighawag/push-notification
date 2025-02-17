import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes } from '@noble/ciphers/utils';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { base64url } from '@scure/base';
import { compressToUint8Array, decompressFromUint8Array } from './compression';

export function encrypt(privateKey: string, data: string): string {
	const privateKeyAsUint8Array = hexToBytes(
		privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
	);
	const nonce24 = randomBytes(24); // 192-bit nonce
	const stream = xchacha20poly1305(privateKeyAsUint8Array, nonce24);
	const dataBytes = compressToUint8Array(data);
	const ciphertext = stream.encrypt(dataBytes);
	return `~${base64url.encode(nonce24)}~${base64url.encode(ciphertext)}`;
}

export function decrypt(privateKey: string, data: string): string {
	const privateKeyAsUint8Array = hexToBytes(
		privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
	);
	const secondDoubleColumnIndex = data.slice(1).indexOf('~');
	const nonceString = data.slice(1, secondDoubleColumnIndex + 1);
	const nonce24 = base64url.decode(nonceString);
	const stream_xc = xchacha20poly1305(privateKeyAsUint8Array, nonce24);

	const dataString = data.slice(secondDoubleColumnIndex + 2);
	const ciphertext = base64url.decode(dataString);
	const plaintext_xc = stream_xc.decrypt(ciphertext);
	return decompressFromUint8Array(plaintext_xc);
}
