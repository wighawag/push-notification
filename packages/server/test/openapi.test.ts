import {describe, expect, it} from 'vitest';
import {generateOpenAPIDocument} from '../src/openapi.js';
import {getAPI} from '../src/api/index.js';
import {apiRoutes} from '../src/api/routes.js';

type Operation = {
	parameters?: {in: string; name: string}[];
	requestBody?: {content: {'application/json': {schema: {properties?: Record<string, unknown>}}}};
	responses: Record<string, {content?: {'application/json': {schema: {properties?: Record<string, unknown>}}}}>;
};

describe('the OpenAPI document, generated from the schemas that validate the API', async () => {
	const document = await generateOpenAPIDocument();
	const operation = (path: string, method: string) =>
		(document.paths[path] as Record<string, Operation> | undefined)?.[method] as Operation;
	const parameters = (op: Operation, where: string) =>
		(op.parameters ?? []).filter((p) => p.in === where).map((p) => p.name);
	const responseKeys = (op: Operation, status: number) =>
		Object.keys(op.responses[status]?.content?.['application/json'].schema.properties ?? {});

	it('the route table is the API: every route getAPI serves, and only those', () => {
		const served = getAPI({getDB: () => undefined as never, getEnv: () => undefined as never})
			.routes.filter((r) => r.method !== 'ALL')
			.map((r) => `${r.method} ${r.path}`);
		const described = Object.values(apiRoutes).map((r) => `${r.method.toUpperCase()} ${r.path}`);
		expect([...new Set(served)].sort()).toEqual(described.sort());
	});

	it('describes every route', () => {
		expect(Object.keys(document.paths).sort()).toEqual([
			'/api/accounts/{domain}/{subscriptionID}',
			'/api/push',
			'/api/register',
			'/api/registered/{address}/{domain}',
			'/api/registered/{address}/{domain}/{subscriptionID}',
			'/api/unregister',
		]);
	});

	it('describes the bodies, headers and answers of the signed writes', () => {
		for (const path of ['/api/register', '/api/unregister']) {
			const op = operation(path, 'post');
			expect(Object.keys(op.requestBody!.content['application/json'].schema.properties!)).toContain(
				'ownershipSignature',
			);
			expect(parameters(op, 'header')).toEqual(['SIGNATURE']);
			expect(Object.keys(op.responses).sort()).toEqual(['200', '400', '401', '403']);
			expect(responseKeys(op, 403)).toEqual(['success', 'errors']);
		}
		expect(responseKeys(operation('/api/register', 'post'), 200)).toEqual([
			'success',
			'registered',
			'replacedAccounts',
		]);
		expect(
			Object.keys(operation('/api/register', 'post').requestBody!.content['application/json'].schema.properties!),
		).toContain('replaceOtherAccounts');
		expect(responseKeys(operation('/api/unregister', 'post'), 200)).toEqual(['success', 'unregistered']);
	});

	it('describes /push: its token, its Idempotency-Key, and the retryable answers', () => {
		const op = operation('/api/push', 'post');
		expect(Object.keys(op.requestBody!.content['application/json'].schema.properties!)).toEqual([
			'address',
			'domain',
			'message',
			'topic',
			'urgency',
		]);
		expect(parameters(op, 'header')).toEqual(['Authorization', 'Idempotency-Key']);
		expect(Object.keys(op.responses).sort()).toEqual(['200', '400', '401', '403', '409', '502']);
		for (const status of [200, 409, 502]) {
			expect(responseKeys(op, status)).toContain('alreadyDelivered');
		}
	});

	it('describes the paths of the reads', () => {
		const check = operation('/api/registered/{address}/{domain}/{subscriptionID}', 'get');
		expect(parameters(check, 'path')).toEqual(['address', 'domain', 'subscriptionID']);
		expect(responseKeys(check, 200)).toEqual(['success', 'registered']);
		const count = operation('/api/registered/{address}/{domain}', 'get');
		expect(parameters(count, 'path')).toEqual(['address', 'domain']);
		expect(parameters(count, 'header')).toEqual(['Authorization']);
		expect(responseKeys(count, 200)).toEqual(['success', 'registered', 'count']);
		const accounts = operation('/api/accounts/{domain}/{subscriptionID}', 'get');
		expect(parameters(accounts, 'path')).toEqual(['domain', 'subscriptionID']);
		expect(responseKeys(accounts, 200)).toEqual(['success', 'accounts']);
	});
});
