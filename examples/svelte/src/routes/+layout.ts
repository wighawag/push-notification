import { serviceWorker } from '$lib/state';

export const prerender = true;
export const trailingSlash = 'always';

if (typeof document !== 'undefined') {
	document.addEventListener('load', function () {
		serviceWorker.register();
	});
}
