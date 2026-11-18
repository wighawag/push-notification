---
'@push-notification/server': patch
'@push-notification/cli': patch
'@push-notification/cf-worker': patch
---

The API is validated by zod 4 schemas pinned to its TypeScript types with `zod-schema-for`, in place of typia. 0.1.0's build imported typia 7's runtime without declaring it, so a fresh install of `@push-notification/server` or `@push-notification/cli` failed to import (`Cannot find module .../typia/lib/internal/_validateReport.js.mjs`) and `npx push-notification-server` did not start; nothing in the published packages depends on typia now.

- Routes, headers, statuses and answers are unchanged, and every body accepted or refused before is accepted or refused the same way. `POST /push` still forwards the message as sent, fields the type does not list included.
- One answer changes shape: an invalid body is refused 400 with the body of every other refusal, `{success: false, errors: [{message}]}` (one error per invalid field, its path in the message), where it was `{success: false, error: [{path, expected, value}]}`.
- The server exports the response types (`RegistrationResult`, `RemovalResult`, `SubscriptionCheck`, `RegisteredCount`, `ErrorResult`) and `generateOpenAPIDocument()`, the OpenAPI document of `/api` generated from the same schemas (`pnpm openapi` writes it).
