declare module 'webpush-webcrypto' {
	export type JSONSerializedKeys = {
		publicKey: string;
		privateKey: string;
	};

	export class ApplicationServerKeys {
		constructor(publicKey: CryptoKey, pirvateKey: CryptoKey);
		static generate(): Promise<ApplicationServerKeys>;
		static toJSON(): Promise<JSONSerializedKeys>;
		static fromJSON(json: JSONSerializedKeys): Promise<ApplicationServerKeys>;
	}

	export type SerializedClientKeys = {
		p256dh: string;
		auth: string;
	};

	export type PushTarget = {
		endpoint: string;
		keys: SerializedClientKeys;
	};

	export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

	export type PushOptions = {
		payload: string;
		applicationServerKeys: any;
		target: PushTarget;
		adminContact: string;
		ttl: number;
		topic?: string;
		urgency?: Urgency;
	};

	export function generatePushHTTPRequest(options: PushOptions): Promise<{
		headers: Record<string, string>;
		body: ArrayBuffer;
		endpoint: string;
	}>;
}
