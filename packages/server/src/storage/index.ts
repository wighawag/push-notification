import {Subscription} from '../types.js';

export interface Storage {
	recordSubscription(address: string, domain: string, subscription: Subscription): Promise<void>;
	getSubscriptions(address: string, domain: string): Promise<Subscription[]>;
	removeSubscription(address: string, domain: string, subscriptionID: string): Promise<void>;

	setup(): Promise<void>;
	reset(): Promise<void>;
}
