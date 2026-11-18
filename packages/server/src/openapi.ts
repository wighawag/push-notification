// The OpenAPI document of the API: the `@push-notification/server/openapi` export, kept
// out of the main entry so a platform's bundle never takes hono-openapi in.
import {Hono} from 'hono';
import {describeRoute, generateSpecs, resolver, validator} from 'hono-openapi';
import type {StandardSchemaV1} from '@standard-schema/spec';
import {apiRoutes, type Header} from './api/routes.js';
import {ErrorResultSchema} from './schemas/index.js';

export type OpenAPIDocument = {openapi: string; paths: Record<string, unknown>; [key: string]: unknown};

const statusDescriptions = {
	400: 'invalid request',
	401: 'a proof or token is missing, or the request signature is outside its time window',
	403: 'the proofs or the token are for another account or domain',
	409: 'another request with the same Idempotency-Key is still sending: retry later',
	502: 'a send to a push service failed: retry with the same Idempotency-Key',
} as const;

type RouteDescription = {
	method: 'get' | 'post';
	path: string;
	description: string;
	json?: StandardSchemaV1;
	param?: StandardSchemaV1;
	response: StandardSchemaV1;
	refusals?: readonly (400 | 401 | 403)[];
	alsoAnswer?: readonly (409 | 502)[];
	headers?: readonly Header[];
};

const json = (schema: StandardSchemaV1) => ({'application/json': {schema: resolver(schema)}});

function describe(route: RouteDescription) {
	const responses: Record<number, {description: string; content: ReturnType<typeof json>}> = {
		200: {description: 'success', content: json(route.response)},
	};
	for (const status of route.refusals ?? []) {
		responses[status] = {description: statusDescriptions[status], content: json(ErrorResultSchema)};
	}
	for (const status of route.alsoAnswer ?? []) {
		responses[status] = {description: statusDescriptions[status], content: json(route.response)};
	}
	return describeRoute({
		description: route.description,
		parameters: (route.headers ?? []).map((header) => ({
			in: 'header' as const,
			name: header.name,
			description: header.description,
			required: header.required,
			schema: {type: 'string' as const},
		})),
		responses: responses as Parameters<typeof describeRoute>[0]['responses'],
	});
}

/** The API (the routes under /api), described from the same zod schemas that validate it. */
export async function generateOpenAPIDocument(): Promise<OpenAPIDocument> {
	// the routes as getAPI declares them, with no handler: the document reads only the middlewares
	const api = new Hono();
	for (const route of Object.values(apiRoutes) as RouteDescription[]) {
		const middlewares = [describe(route)];
		if (route.json) {
			middlewares.push(validator('json', route.json));
		}
		if (route.param) {
			middlewares.push(validator('param', route.param));
		}
		api.on(route.method.toUpperCase(), [route.path], ...middlewares, (c) => c.body(null, 501));
	}
	return generateSpecs(new Hono().route('/api', api), {
		documentation: {
			openapi: '3.1.0',
			info: {title: 'push-notification-server', version: 'api', description: 'API'},
		},
	}) as Promise<OpenAPIDocument>;
}
