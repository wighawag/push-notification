import { writable } from 'svelte/store';

type JSONNotification = {
	title: string;
	options: {
		badge?: string;
		body: string;
		// data?: any; // TODO what is for
		dir?: NotificationDirection;
		icon?: string;
		lang?: string;
		requireInteraction?: boolean;
		silent?: boolean | null;
		tag?: string;
	};
};

export type PushNotification = { type: 'push-notification'; data: JSONNotification };
export type NotificationToAdd = PushNotification;

export type Notification = NotificationToAdd & { id: number };

export function createNotificationsService() {
	let lastId = 1;
	const store = writable<Notification[]>([]);

	function add(notification: NotificationToAdd) {
		store.update((notifications) => [...notifications, { ...notification, id: ++lastId }]);
	}

	function remove(id: number) {
		store.update((notifications) => notifications.filter((notification) => notification.id !== id));
	}
	return { subscribe: store.subscribe, add, remove };
}

export const notifications = createNotificationsService();
