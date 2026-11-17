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
};
