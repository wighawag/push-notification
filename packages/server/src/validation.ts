import type {ValidationTargets} from 'hono';
import {describeRoute, resolver, validator} from 'hono-openapi';
import type {StandardSchemaV1} from '@standard-schema/spec';
import {ErrorResultSchema} from './schemas/index.js';
import type {ErrorResult} from './api/types.js';

function issuePath(issue: StandardSchemaV1.Issue): string {
	if (!issue.path || issue.path.length === 0) {
		return '';
	}
	return ` at ${issue.path.map((p) => String(typeof p === 'object' ? p.key : p)).join('.')}`;
}

/**
 * Validate one request target with a schema from `./schemas`. On failure the request is
 * answered 400 with the body of every refusal (`ErrorResult`), one error per issue.
 */
export function validate<Schema extends StandardSchemaV1, Target extends keyof ValidationTargets>(
	target: Target,
	schema: Schema,
) {
	return validator(target, schema, (result, c) => {
		if (!result.success) {
			const error: ErrorResult = {
				success: false,
				errors: result.error.map((issue) => ({message: `invalid ${target}${issuePath(issue)}: ${issue.message}`})),
			};
			return c.json(error, 400);
		}
	});
}

const refusals = {
	400: 'invalid request',
	401: 'a proof or token is missing, or the request signature is outside its time window',
	403: 'the proofs or the token are for another account or domain',
	409: 'another request with the same Idempotency-Key is still sending: retry later',
	502: 'a send to a push service failed: retry with the same Idempotency-Key',
} as const;

type Header = {name: string; description: string; required: boolean};

/**
 * OpenAPI description of a route: its 200 body, the refusals it answers (with `ErrorResult`,
 * or `body` for statuses answering the route's own body, as /push's 409 and 502 do) and the
 * headers it reads. Request bodies and path parameters are described by `validate`.
 */
export function describe(options: {
	description: string;
	response: StandardSchemaV1;
	refusals?: (400 | 401 | 403)[];
	/** statuses answering `response` too */
	alsoAnswer?: (409 | 502)[];
	headers?: Header[];
}) {
	const responses: Record<number, {description: string; content: {'application/json': {schema: unknown}}}> = {
		200: {description: 'success', content: {'application/json': {schema: resolver(options.response)}}},
	};
	for (const status of options.refusals ?? []) {
		responses[status] = {
			description: refusals[status],
			content: {'application/json': {schema: resolver(ErrorResultSchema)}},
		};
	}
	for (const status of options.alsoAnswer ?? []) {
		responses[status] = {
			description: refusals[status],
			content: {'application/json': {schema: resolver(options.response)}},
		};
	}
	return describeRoute({
		description: options.description,
		parameters: (options.headers ?? []).map((header) => ({
			in: 'header' as const,
			name: header.name,
			description: header.description,
			required: header.required,
			schema: {type: 'string' as const},
		})),
		responses: responses as Parameters<typeof describeRoute>[0]['responses'],
	});
}
