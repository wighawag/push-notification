---
title: 'platforms/cf-worker: its workerd test fails to load, and it is not in the gate'
slug: cf-worker-workerd-test-red
date: 2026-11-17
---

`pnpm --filter push-notification-service-server-cf-worker test` (vitest with `@cloudflare/vitest-pool-workers`) fails before running its one test, on `origin/main` 1e0d908 as after the S1 changes: `TypeError: Cannot use require() to import an ES Module` from `@hono/typia-validator/dist/cjs/index.js`, which the workers pool resolves through its `require` condition. The test itself is a "hello world" on `/`. It also starts workerd, which opens local sockets, so it could not join the port-free gate as it is.

The cf-worker platform is therefore type-checked by nothing and tested by nothing; the API's behaviour is held by the suite on the server package and the nodejs platform. A fix would either run the shared API suite under the workers pool (D1 in miniflare) or drop the workerd test for a type-check.
