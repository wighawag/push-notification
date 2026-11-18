import {Hono} from 'hono';
import {generateSpecs} from 'hono-openapi';
import {getAPI} from './api/index.js';
import type {ServerOptions} from './types.js';

// The document only needs the route definitions (paths, validators, descriptions), never
// the handlers, so these options are never called while generating it.
const noOptions: ServerOptions = {
	getDB() {
		throw new Error(`not available while generating the OpenAPI document`);
	},
	getEnv() {
		throw new Error(`not available while generating the OpenAPI document`);
	},
};

export type OpenAPIDocument = {openapi: string; paths: Record<string, unknown>; [key: string]: unknown};

/** The API (the routes under /api), described from the same zod schemas that validate it. */
export async function generateOpenAPIDocument(): Promise<OpenAPIDocument> {
	const app = new Hono().route('/api', getAPI(noOptions));
	return generateSpecs(app, {
		documentation: {
			openapi: '3.1.0',
			info: {title: 'push-notification-server', version: 'api', description: 'API'},
		},
	}) as Promise<OpenAPIDocument>;
}
