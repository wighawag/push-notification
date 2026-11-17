export type Env = {
	DEV?: string;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	/**
	 * The services allowed to push, each scoped to one domain: a list of
	 * `<domain>:<sha256 of the token, hex>` separated by commas or whitespace.
	 * A domain may appear more than once (to rotate a token). Unset, every push
	 * is refused.
	 */
	PUSH_TOKENS?: string;
	/**
	 * The contact push services are given in the VAPID claim (`mailto:` or an
	 * https URL), so the operator of a push service can reach this server's.
	 * Defaults to mailto:notifications@etherplay.io.
	 */
	VAPID_SUBJECT?: string;
	/**
	 * This server's public origin, which request signatures name. Unset, the
	 * request URL's origin is used: set it behind a proxy that changes the host.
	 */
	PUBLIC_ORIGIN?: string;
};
