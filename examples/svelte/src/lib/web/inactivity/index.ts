import { writable } from 'svelte/store';

export function createInactivityStore({
	inactivityThresholdInSeconds = 300,
	onlyTrackIfSubscribed = false
} = {}) {
	let intervalId: NodeJS.Timeout | null = null;
	let isForceTracking = !onlyTrackIfSubscribed;
	// const activityEvents = [
	//     'mousedown', 'mousemove', 'keydown',
	//     'scroll', 'touchstart', 'click'
	// ];
	const activityEvents = [
		'mousedown',
		'mousemove',
		'keydown',
		'scroll',
		'touchstart',
		'touchmove',
		'wheel'
	];

	const { subscribe, update } = writable(
		{
			isIdle: false,
			lastActiveTime: Date.now(),
			secondsSinceLastActivity: 0
		},
		onFirstSubscription
	);

	function resetTimer() {
		update((state) => ({
			...state,
			isIdle: false,
			lastActiveTime: Date.now(),
			secondsSinceLastActivity: 0
		}));
	}

	function startTracking() {
		if (intervalId) return; // Already tracking

		activityEvents.forEach((eventName) => {
			window.addEventListener(eventName, resetTimer, true);
		});

		intervalId = setInterval(() => {
			update((state) => {
				const currentTime = Date.now();
				const secondsSinceLastActivity = Math.floor((currentTime - state.lastActiveTime) / 1000);
				const isIdle = secondsSinceLastActivity > inactivityThresholdInSeconds;

				return {
					...state,
					secondsSinceLastActivity,
					isIdle
				};
			});
		}, 1000);
	}

	function stopTracking() {
		if (!intervalId) return; // Not tracking

		activityEvents.forEach((eventName) => {
			window.removeEventListener(eventName, resetTimer, true);
		});
		clearInterval(intervalId);
		intervalId = null;
	}

	function onFirstSubscription() {
		startTracking();
		return () => {
			if (!isForceTracking) {
				stopTracking();
			}
		};
	}

	function start() {
		isForceTracking = true;
		startTracking();
	}

	function stop() {
		isForceTracking = false;
		stopTracking();
	}

	if (!onlyTrackIfSubscribed) {
		startTracking();
	}

	return {
		subscribe,
		resetTimer,
		start,
		stop
	};
}
