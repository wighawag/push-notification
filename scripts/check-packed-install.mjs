#!/usr/bin/env node
// The packaging check: the BUILT @push-notification/server and @push-notification/cli,
// packed as npm publishes them, installed with npm in an empty directory (only what
// they declare, nothing hoisted from this workspace), must import and answer a
// request. It catches a runtime import a package does not declare: 0.1.0 imported
// its validators' runtime (generated at compile time) without declaring it, so a
// fresh install resolved it at another major version and `import('@push-notification/cli')` threw.
//
// Run after `pnpm build`. It installs from the npm registry, so it reaches the
// network: it is a step of the verify, never part of `pnpm test`. It opens no port.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packages = ['packages/server', 'platforms/nodejs'];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'push-notification-packed-'));
function run(command, args, cwd) {
	return execFileSync(command, args, {cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit']});
}

try {
	const tarballs = packages.map((folder) => {
		const output = run('pnpm', ['pack', '--pack-destination', work], path.join(root, folder));
		const tarball = output
			.trim()
			.split('\n')
			.map((line) => line.trim())
			.reverse()
			.find((line) => line.endsWith('.tgz'));
		if (!tarball) {
			throw new Error(`pnpm pack in ${folder} named no tarball:\n${output}`);
		}
		return path.isAbsolute(tarball) ? tarball : path.join(work, path.basename(tarball));
	});

	const app = path.join(work, 'app');
	fs.mkdirSync(app);
	fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({name: 'packed-check', private: true}));
	run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...tarballs], app);

	const probe = `
		const server = await import('@push-notification/server');
		const cli = await import('@push-notification/cli');
		if (typeof server.createServer !== 'function') throw new Error('@push-notification/server exports no createServer');
		const app = await cli.createNodeServer({
			db: ':memory:',
			env: {VAPID_PUBLIC_KEY: 'unused', VAPID_PRIVATE_KEY: 'unused'},
		});
		// an invalid body: the validator itself must run in the packed build
		const response = await app.request('/api/push', {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({address: 1}),
		});
		if (response.status !== 400) throw new Error('an invalid /api/push body answered ' + response.status + ': ' + (await response.text()));
		console.log('packed @push-notification/server and @push-notification/cli import and validate');
	`;
	process.stdout.write(run('node', ['--input-type=module', '-e', probe], app));
} finally {
	fs.rmSync(work, {recursive: true, force: true});
}
