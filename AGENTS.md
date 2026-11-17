# Working in this repo (agent guidance)

Repo-specific etiquette for any agent working in `push-notification-server`. The domain vocabulary is in `CONTEXT.md`; the work protocol is `work/protocol/` (dorfl's `work/` contract).

## Acceptance gate

A change is green when this passes (the `verify` of `dorfl.json`), after `pnpm install`:

```sh
pnpm -r format:check && pnpm build && pnpm test
```

`format:check` is per package (`pnpm -r`), since the root has no prettier. To fix formatting, run `pnpm --filter <package> format:write` rather than hand-fixing a check's output. `pnpm build` generates the SQL modules and compiles every package (the server's `dist` is what the platforms import, so build before testing a platform). `pnpm test` runs the port-free suites: `packages/server`, `platforms/nodejs`, and `packages/subscription-client` (the client against the server in process).

## Tests

- The API's behaviour is ONE suite, `packages/server/test/api-suite.ts`, run by every platform through `app.request` on an in-memory libSQL database with a recording push sender. A new route or rule is a case there, so every platform is held to it. Its protocol helpers (`test/protocol.ts`) are written from the wire format, not from the server's code: keep it that way.
- No test opens a port or reaches the network. `platforms/cf-worker` has no test (a workerd pool would open one): `pnpm build` type-checks it.
- The example (`examples/svelte`) is checked with `pnpm --filter push-notification-example-svelte check`; its `test` script runs Playwright and is not in the gate.

## Changes that touch the wire

The routes are used by services outside this repo (the trigger service, jolly-roger's push layer, missiv). A change to a route's body, headers, status codes or answer is breaking: a changeset says so, and `CONTEXT.md` keeps the terms. The ownership proof and the request signature are missiv-identity's, in missiv's repo: change them THERE, never with a local copy.

## Running it

`pnpm --filter @push-notification/cli start` (after `pnpm build`) serves on `PORT` (34005) with `DB` a libSQL URL; `pnpm start` runs the whole dev stack in zellij. Stop what you start.

## Git transitions

When dispatched to build a work task, do no git: the runner or the human owns every commit, push and `work/` move.
