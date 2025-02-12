import { serviceWorker } from '$lib/state';
import { onDocumentLoaded } from '$lib/web/utils';

export const prerender = true;
export const trailingSlash = 'always';

onDocumentLoaded(serviceWorker.register);
