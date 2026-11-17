#!/usr/bin/env node
import path from 'node:path';
import {parseArgs} from 'node:util';
import {serve} from '@hono/node-server';
import {loadEnv} from 'ldenv';
import type {Env} from 'push-notification-service-server';
import {createNodeServer} from './index.js';

loadEnv({defaultEnvFile: path.join(import.meta.dirname, '../.env.default')});

const {values} = parseArgs({options: {port: {type: 'string', short: 'p'}}});
const env = process.env as Env & {DB?: string; PORT?: string};
const port = parseInt(values.port ?? env.PORT ?? '34005');

const app = await createNodeServer({db: env.DB || 'file:push-notifications.db', env});
const server = serve({fetch: app.fetch, port}, (info) => {
	console.log(`push-notification-service-server on http://localhost:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => server.close(() => process.exit(0)));
}
