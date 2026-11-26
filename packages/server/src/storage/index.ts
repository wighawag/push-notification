import {Subscription} from '../types.js';

/** What a push with an Idempotency-Key finds for one subscription. */
export type DeliveryClaim = 'claimed' | 'delivered' | 'in-flight';

export interface Storage {
	/**
	 * Records the subscription for (address, domain), or refreshes it if already there.
	 * With `replaceOtherAccounts`, the same transaction removes the endpoint's
	 * registrations for every other address of the domain, and answers those addresses.
	 */
	recordSubscription(
		address: string,
		domain: string,
		subscription: Subscription,
		options?: {replaceOtherAccounts?: boolean},
	): Promise<{replacedAccounts: string[]}>;
	getSubscriptions(address: string, domain: string): Promise<Subscription[]>;
	/** The addresses the subscription (its endpoint) is registered for in the domain, sorted. */
	getAccountsOf(domain: string, subscriptionID: string): Promise<string[]>;
	/** Removes the subscription (its endpoint) for this address and domain only. */
	removeSubscriptionOf(address: string, domain: string, subscriptionID: string): Promise<void>;
	/** Removes the subscription (its endpoint) wherever it is registered. */
	removeSubscription(subscriptionID: string): Promise<void>;
	getSubscription(address: string, domain: string, subscriptionID: string): Promise<Subscription | undefined>;
	/** How many subscriptions (address, domain) has that have not expired at `nowMS`. */
	countLiveSubscriptions(address: string, domain: string, nowMS: number): Promise<number>;

	/**
	 * Claims the delivery of the push `key` to the subscription: `claimed` when
	 * this call may send (no row yet, or a claim older than `staleBeforeMS`),
	 * `delivered` when it was already delivered, `in-flight` when another request
	 * holds a fresh claim.
	 */
	claimDelivery(
		address: string,
		domain: string,
		key: string,
		subscriptionID: string,
		nowMS: number,
		staleBeforeMS: number,
	): Promise<DeliveryClaim>;
	markDelivered(address: string, domain: string, key: string, subscriptionID: string): Promise<void>;
	/** Gives a claim back after a failed send, so a retry sends again. */
	releaseDelivery(address: string, domain: string, key: string, subscriptionID: string): Promise<void>;
	/** Forgets every delivery claimed before `beforeMS`. */
	pruneDeliveries(beforeMS: number): Promise<void>;

	setup(): Promise<void>;
	reset(): Promise<void>;
}
