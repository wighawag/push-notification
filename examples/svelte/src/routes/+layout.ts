import { serviceWorker } from '$lib/web/service-worker';

serviceWorker.register();

export const prerender = true;
export const trailingSlash = 'always';
