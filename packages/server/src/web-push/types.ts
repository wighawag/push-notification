export type Urgency = 'low' | 'normal' | 'high';

export type PushSubscription = {
	endpoint: string;
	/** DOMHighResTimeStamp */
	expirationTime: number | null;
	keys: {
		auth: string;
		p256dh: string;
	};
};

export type VapidKeys = {
	publicKey: string;
	privateKey: string;
};
