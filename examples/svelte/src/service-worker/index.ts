/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="../../.svelte-kit/ambient.d.ts" />

import { build, version, prerendered, files } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// ------------------- CONFIG ---------------------------
const DEV = true;
const OFFLINE_CACHE = 'all';
// ------------------------------------------------------

let ASSETS: string[] = [];
if (OFFLINE_CACHE === 'all') {
	ASSETS = build.concat(prerendered).concat(files.filter((v) => v.indexOf('pwa/') === -1));
} // TODO support more offline option

let _logEnabled = true; // TODO false
function log(...args: any[]) {
	if (_logEnabled) {
		console.debug(`[Service Worker #${version}] ${args[0]}`, ...args.slice(2));
	}
}

// Create a unique cache name for this deployment
const CACHE_NAME = `cache-${version}`;

const regexesOnlineFirst: string[] = [];
if (DEV) {
	regexesOnlineFirst.push('localhost');
}

const regexesOnlineOnly: string[] = [];

const regexesCacheFirst = [
	sw.location.origin,
	// 'https://rsms.me/inter/', // TODO remove, used if using font from there
	'cdn',
	'.*\\.png$',
	'.*\\.svg$'
];

const regexesCacheOnly: string[] = [];

// If the url doesn't match any of those regexes, it will do online first

log(`Origin: ${sw.location.origin}`);

sw.addEventListener('install', (event) => {
	log('Install');
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				log(`Creating cache: ${CACHE_NAME}`);
				return cache.addAll(ASSETS);
			})
			.then(() => {
				// sw.skipWaiting();
				log(`cache fully fetched!`);
			})
	);
});

sw.addEventListener('activate', (event) => {
	log('Activate');
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((thisCacheName) => {
					if (thisCacheName !== CACHE_NAME) {
						log(`Deleting: ${thisCacheName}`);
						return caches.delete(thisCacheName);
					}
				})
			).then(() => sw.clients.claim());
		})
	);
});

async function fetchAndUpdateCache(request: Request, cache?: Response) {
	try {
		const response = await fetch(request);
		try {
			const cache_1 = await caches.open(CACHE_NAME);
			if (request.method === 'GET' && request.url.startsWith('http')) {
				// only on http protocol to prevent chrome-extension request to error out
				cache_1.put(request, response.clone());
			}
			return response;
		} catch (err) {
			log(`error: ${err}`);
			return response;
		}
	} catch (err_1) {
		if (cache) {
			return cache;
		} else {
			throw err_1;
		}
	}
}

const cacheFirst = {
	method: (request: Request, cache?: Response) => {
		log(`Cache first: ${request.url}`);
		const fromNetwork = fetchAndUpdateCache(request, cache);
		return cache || fromNetwork;
	},
	regexes: regexesCacheFirst
};

const cacheOnly = {
	method: (request: Request, cache?: Response) => {
		log(`Cache only: ${request.url}`);
		return cache || fetchAndUpdateCache(request, cache);
	},
	regexes: regexesCacheOnly
};

const onlineFirst = {
	method: (request: Request, cache?: Response) => {
		log(`Online first: ${request.url}`);
		return fetchAndUpdateCache(request, cache);
	},
	regexes: regexesOnlineFirst
};

const onlineOnly = {
	method: (request: Request) => {
		log(`Online only: ${request.url}`);
		return fetch(request);
	},
	regexes: regexesOnlineOnly
};

async function getResponse(event: FetchEvent): Promise<Response> {
	const request = event.request;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const registration = sw.registration;
	if (
		event.request.mode === 'navigate' &&
		event.request.method === 'GET' &&
		registration.waiting &&
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(await sw.clients.matchAll()).length < 2
	) {
		log('only one client, skipWaiting as we navigate the page');
		registration.waiting.postMessage('skipWaiting');
		const response = new Response('', { headers: { Refresh: '0' } });
		return response;
	}

	// TODO remove query param from matching, query param are used as config (why not use hashes then ?) const normalizedUrl = normalizeUrl(event.request.url);
	const response = await caches.match(request).then((cache) => {
		// The order matters !
		const patterns = [onlineFirst, onlineOnly, cacheFirst, cacheOnly];

		for (const pattern of patterns) {
			for (const regex of pattern.regexes) {
				if (RegExp(regex).test(request.url)) {
					return pattern.method(request, cache);
				}
			}
		}

		return onlineFirst.method(request, cache);
	});
	return response;
}

sw.addEventListener('fetch', (event: FetchEvent) => {
	event.respondWith(getResponse(event));
});

// ------------------------------------------------------------------------------------------------
// MESSAGES FROM APP
// ------------------------------------------------------------------------------------------------

sw.addEventListener('message', async function (event) {
	if (event.data && event.data.type === 'debug') {
		// enable or disable logging
		// just need to send a object as message like {type: "debug", enabled: true, level: 5}
		_logEnabled = event.data.enabled && event.data.level >= 5;
		if (_logEnabled) {
			log(`log enabled ${event.data.level}`);
		}
	} else if (event.data && event.data.type === 'ping') {
		// to test replies from service worker and get its versio
		// see log function
		log('pong');
	} else if (event.data === 'skipWaiting') {
		// force the pending service worker to be activated
		log(`skipWaiting received`);
		event.waitUntil(sw.skipWaiting());
	}
});

// ------------------------------------------------------------------------------------------------
// PUSH NOTIFICATIONS
// ------------------------------------------------------------------------------------------------

async function getClientsStatus(): Promise<{
	atLeastOneVisible: boolean;
	atLeastOneFocused: boolean;
	atLeastOneVisibleAndFocused: boolean;
}> {
	const windowClients = await sw.clients.matchAll({
		type: 'window',
		includeUncontrolled: true
	});

	let atLeastOneVisible = false;
	let atLeastOneFocused = false;
	let atLeastOneVisibleAndFocused = false;
	for (var i = 0; i < windowClients.length; i++) {
		const visible = windowClients[i].visibilityState === 'visible';
		const hasFocus = windowClients[i].focused;
		if (visible) {
			atLeastOneVisible = true;
		}
		if (hasFocus) {
			atLeastOneFocused = true;
		}
		if (hasFocus && visible) {
			atLeastOneVisibleAndFocused = true;
		}
	}

	return {
		atLeastOneFocused,
		atLeastOneVisible,
		atLeastOneVisibleAndFocused
	};
}

async function handlePush(data?: string) {
	const appActive = await getClientsStatus();

	// TODO define a json format
	const title = 'Example';
	const options = {
		body: data,
		icon: '/favicon.png',
		badge: '/favicon.png'
	};
	if (appActive.atLeastOneVisibleAndFocused) {
		// TODO show notification in app
	} else {
		await sw.registration.showNotification(title, options);
	}
}
sw.addEventListener('push', function (event: PushEvent) {
	const data = event.data?.text();
	event.waitUntil(handlePush(data));
});

async function handleNotificationClick() {
	const windowClients = await sw.clients.matchAll({
		type: 'window',
		includeUncontrolled: true
	});

	// TODO add notification specifics to deep link

	for (const client of windowClients) {
		log(`${'focus' in client ? 'focus-available: ' : ''}: ${client.url}`);
		// TODO url checks: client.url === '/' &&  ?
		if ('focus' in client) {
			return client.focus();
		}
	}
	if (sw.clients.openWindow) return sw.clients.openWindow('/');
}

sw.addEventListener('notificationclick', function (event: NotificationEvent) {
	event.notification.close();
	event.waitUntil(handleNotificationClick());
});
