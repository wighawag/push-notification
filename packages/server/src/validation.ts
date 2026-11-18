import type {ValidationTargets} from 'hono';
import {sValidator} from '@hono/standard-validator';
import type {StandardSchemaV1} from '@standard-schema/spec';
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
 *
 * On `@hono/standard-validator` (the validator hono-openapi wraps), not on hono-openapi:
 * the runtime stays free of the OpenAPI generator, which `./openapi.ts` alone imports.
 */
export function validate<Schema extends StandardSchemaV1, Target extends keyof ValidationTargets>(
	target: Target,
	schema: Schema,
) {
	return sValidator(target, schema, (result, c) => {
		if (!result.success) {
			const error: ErrorResult = {
				success: false,
				errors: result.error.map((issue) => ({message: `invalid ${target}${issuePath(issue)}: ${issue.message}`})),
			};
			return c.json(error, 400);
		}
	});
}
