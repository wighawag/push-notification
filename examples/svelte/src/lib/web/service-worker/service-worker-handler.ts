import type { Logger } from 'named-logs';
import { logs } from 'named-logs';
import { serviceWorker } from './index.js';
import { base } from '$app/paths';
import { dev } from '$app/environment';

const logger = logs('service-worker') as Logger & {
	level: number;
	enabled: boolean;
};
function updateLoggingForWorker(worker: ServiceWorker | null) {
	if (worker) {
		if (logger.enabled) {
			logger.debug(`enabling logging for service worker, level: ${logger.level}`);
		} else {
			logger.debug(`disabling logging for service worker, level: ${logger.level}`);
		}
		worker.postMessage({
			type: 'debug',
			level: logger.level,
			enabled: logger.enabled
		});
	}
}

const IDLE_DELAY_MS = 3 * 60 * 1000;
const CHECK_DELAY_MS = 30 * 60 * 1000;

function handleAutomaticUpdate(registration: ServiceWorkerRegistration) {
	let lastFocusTime = performance.now();
	function wakeup(evt?: Event) {
		// logger.debug('waking up...', evt);
		const timePassed = performance.now();
		if (timePassed - lastFocusTime > IDLE_DELAY_MS) {
			logger.debug('checking service worker...');
			registration.update();
		}
		// we reset the time each time we wake up
		// the idea here is that we do not want to bother users while they are actively using the app
		lastFocusTime = timePassed;
	}
	['focus', 'pointerdown'].forEach((evt) => window.addEventListener(evt, wakeup));

	// but we still do not an update every so often
	// TODO improve upon this
	setInterval(() => registration.update(), CHECK_DELAY_MS);
}

// taken from: https://stackoverflow.com/a/50535316
function listenForWaitingServiceWorker(
	registration: ServiceWorkerRegistration,
	callback: (reg: ServiceWorkerRegistration) => void
) {
	function awaitStateChange() {
		if (registration.installing) {
			registration.installing.addEventListener('statechange', function () {
				if (this.state === 'installed') callback(registration);
			});
		}
	}
	if (!registration) {
		return;
	}
	if (registration.waiting) {
		return callback(registration);
	}
	if (registration.installing) {
		awaitStateChange();
	} else {
		registration.addEventListener('updatefound', awaitStateChange);
	}
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
	// ------------------------------------------------------------------------------------------------
	// FORCE RELOAD ON CONTROLLER CHANGE
	// ------------------------------------------------------------------------------------------------
	let refreshing = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (refreshing) {
			return;
		}
		refreshing = true;
		window.location.reload();
	});
	// ------------------------------------------------------------------------------------------------

	const swLocation = `${base}/service-worker.js`;
	//{scope: `${base}/`}
	navigator.serviceWorker
		.register(swLocation, {
			type: dev ? 'module' : 'classic'
		})
		.then((registration) => {
			try {
				handleAutomaticUpdate(registration);
			} catch (e) {}
			serviceWorker.set({ registration, updateAvailable: false }); // TODO keep updateAvailable if any ?
			updateLoggingForWorker(registration.installing);
			updateLoggingForWorker(registration.waiting);
			updateLoggingForWorker(registration.active);
			listenForWaitingServiceWorker(registration, () => {
				serviceWorker.set({ registration, updateAvailable: true });
			});
		})
		.catch((e) => {
			logger.error('Failed to register service worker', e);
		});
}
