// GAP-1: a push is made by a service holding a token for the push's domain.
// The operator configures each token by its SHA-256 (env PUSH_TOKENS), so the
// configuration holds no secret, and a presented token is compared with every
// configured hash in constant time.

export type DomainAuthorization = 'authorized' | 'unauthenticated' | 'forbidden';

type TokenEntry = {domain: string; hash: Uint8Array};

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** Parses PUSH_TOKENS. Throws on a malformed entry, so a misconfiguration is seen rather than refusing silently. */
export function parseTokens(config: string | undefined): TokenEntry[] {
	if (!config) {
		return [];
	}
	return config
		.split(/[\s,]+/)
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			// a domain may carry a port (localhost:5173), the hash never has a colon
			const separator = entry.lastIndexOf(':');
			const domain = entry.slice(0, separator);
			const hash = entry.slice(separator + 1).toLowerCase();
			if (separator <= 0 || !/^[0-9a-f]{64}$/.test(hash)) {
				throw new Error(`PUSH_TOKENS: expected <domain>:<sha256 hex>, got an entry for "${domain || entry}"`);
			}
			return {domain, hash: hexToBytes(hash)};
		});
}

function equalInConstantTime(a: Uint8Array, b: Uint8Array): boolean {
	let difference = a.length ^ b.length;
	for (let i = 0; i < a.length && i < b.length; i++) {
		difference |= a[i] ^ b[i];
	}
	return difference === 0;
}

/** The token of an `Authorization: Bearer <token>` header, if any. */
export function bearerToken(header: string | undefined): string | undefined {
	const match = header?.match(/^Bearer\s+(.+)$/i);
	return match ? match[1].trim() : undefined;
}

/**
 * Whether the token may act on the domain: `unauthenticated` without a token or
 * with one no domain has, `forbidden` with another domain's.
 */
export async function authorizeDomain(
	config: string | undefined,
	token: string | undefined,
	domain: string,
): Promise<DomainAuthorization> {
	const entries = parseTokens(config);
	if (!token) {
		return 'unauthenticated';
	}
	const presented = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
	let known = false;
	let forDomain = false;
	// every entry compared, whatever matched first
	for (const entry of entries) {
		const match = equalInConstantTime(presented, entry.hash);
		known = known || match;
		forDomain = forDomain || (match && entry.domain === domain);
	}
	return forDomain ? 'authorized' : known ? 'forbidden' : 'unauthenticated';
}
