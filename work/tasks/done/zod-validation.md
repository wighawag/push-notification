---
title: 'The API validated by zod 4 schemas pinned with zod-schema-for, typia gone'
slug: zod-validation
blockedBy: []
---

## What to build

@push-notification/server 0.1.0 was compiled by typia's transformer and imported typia 7's runtime (`typia/lib/internal/_validateReport.js.mjs`) without declaring typia, so a fresh install resolved typia 12 (or none) and `import('@push-notification/cli')` threw; `npx push-notification-server` did not start. Validate the API as fuzd does (its ADR 0003): the TypeScript types are the source of truth, each request and response has a zod 4 schema pinned to its type with `zod-schema-for` (`schemaFor<T>()`, exact identity), a shared `validate` middleware on hono-openapi's validator answers 400, and the OpenAPI document comes from the same schemas. The wire contract does not change.

## Acceptance criteria

- [x] `pnpm check:packed` (in the verify) packs the built server and cli, installs the tarballs with npm in an empty directory, imports both and gets a 400 for an invalid body; red on 0.1.0 with the reported error.
- [x] Every body, path and response of `/api/register`, `/api/unregister`, `/api/push`, `/api/registered/:address/:domain[/:subscriptionID]` has a schema pinned with `schemaFor`.
- [x] The same statuses as 0.1.0 for 39 valid and invalid bodies (compared against `origin/main` @ 79c6683); every existing API case unchanged and green on the server package and the Node.js platform.
- [x] The OpenAPI document (`generateOpenAPIDocument()`, `pnpm openapi`) describes every route, held by a test.
- [x] No typia, ts-patch, unplugin-typia, typia validator or typia OpenAPI generator left; `git grep -i typia` empty outside the changelogs.
- [x] Patch changesets for the server, the cli and the cf-worker.

## Decisions

- An invalid body is answered 400 with the body of every other refusal, `{success: false, errors: [{message}]}` (one error per issue, `invalid json at <path>: <zod message>`), where typia's validator answered `{success: false, error: [{path, expected, value}]}`. This is the one wire difference: the status is the same, and the callers (missiv's push, the subscription client) read only the status or the text. Alternative: imitate typia's body, whose `expected` strings zod cannot reproduce faithfully.
- `POST /push` forwards `message` AS SENT (the parsed JSON, not the schema's output): typia passed unknown keys through, and zod's default strip would silently drop Declarative Web Push fields the type does not list yet. Elsewhere unknown keys are stripped: the stored subscription loses keys nothing reads.
- `ownershipSignature` is checked for its `0x` prefix only (`z.templateLiteral(['0x', z.string()])`), as typia checked it (`/^0x(.*)/`), and not lowercased: a malformed signature is still delegated-identity's 400 "a signature is malformed". fuzd's lowercase `String0x` normalisation is not taken over; addresses keep their existing per-route lowercasing.
- The headers (SIGNATURE, Authorization, Idempotency-Key) stay checked in the handlers, never by a schema: a schema would answer 400 where the contract answers 401 (missing proof or token) and would reorder the checks (the body is validated first, then the token, then the key). They are described in the OpenAPI document instead.
- Path parameters get a schema (`validate('param', ...)`) that cannot refuse (a segment is always a string): for the document and typed access, not for a new rule. An invalid `domain` still fails where it did.
- The response types (`RegistrationResult`, `RemovalResult`, `SubscriptionCheck`, `RegisteredCount`, `ErrorResult`) are new exported types, so each answer has a type its schema is pinned to; the handlers build their answers through them.
- The OpenAPI document is generated, not served: no route serves it today (`@hono/swagger-ui` is a dependency nothing uses, left as it was), and serving it would add routes. The generator is a script outside `src` (`generate-openapi.mjs`) so the runtime-agnostic server does not take on Node types. The old `pnpm openapi` did not run (it looked for a `PublicAPI` type the server never exported).
- The packed-install check reaches the npm registry, so it is a step of the verify (`pnpm check:packed`), never part of `pnpm test`; it opens no port. It does not look for typia by name: the clean-install import and request are what catch an undeclared runtime import.
- hono `^4.11.2` (hono-openapi 1.x's peer), zod `^4.4.3`, zod-schema-for `^0.1.1`, as fuzd.
