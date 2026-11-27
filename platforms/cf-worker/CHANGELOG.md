# @push-notification/cf-worker

## 0.3.0

### Minor Changes

- 32f2ca4: BREAKING: registrations are proven with delegated-identity 0.2.0's key set (an Ed25519 signing key and an X25519 encryption key) instead of a secp256k1 delegate key. There is no compatibility with the old proof.

  - `POST /register` and `POST /unregister` take `keySet: {signing: {publicKey}, encryption: {publicKey}}` (32-byte keys, 0x-prefixed hex) beside `address`, `domain` and `ownershipSignature`. `ownershipSignature` is the wallet's EIP-191 signature over delegated-identity's new publication message, which names both keys for the app's origin. The `SIGNATURE` header is the signing key's Ed25519 signature over the new request envelope, `<timestamp ms>:<signing key hex>:<signature hex>`. The server checks both with delegated-identity's stateless `verifyRequest`; no secp256k1 request signature is recovered any more.
  - The refusals are unchanged: 401 without a signature or outside its minute, 400 for a malformed body, header, key or signature (an old-format secp256k1 header included), 403 when the proofs do not prove `address` (another key set, address, origin, route or body, or an ownership proof over the old publication message).
  - `@push-notification/client`: the account is `{address, keySet, ownershipSignature?}`, the key set as `@etherplay/connect` hands it out (a delegated-identity `KeySet`; its signing private key signs, only the public keys are sent). `delegatePrivateKey` is gone, and `signOwnership` is asked to sign the publication message of the key set.
  - `/push` and the token routes are unaffected.

### Patch Changes

- Updated dependencies [32f2ca4]
  - @push-notification/server@0.3.0

## 0.2.0

### Minor Changes

- 3078f2a: One account per device, as an option. A browser's subscription can be registered for several accounts of one app (a registration is keyed by account, app and endpoint), so a device switched to another account kept receiving the previous one's notifications, its direct messages included, which it cannot read there. That stays the default (an app may want one device notified for several accounts); an app that wants one account per device now asks for it:

  - `POST /register` takes `replaceOtherAccounts: true` (signed with the body like every other field): in the same transaction as this registration is recorded, the endpoint's registrations for every OTHER account of the same app are removed. Other apps' registrations of the endpoint, and the other accounts' other devices, are untouched. The answer gains `replacedAccounts`, the accounts (lowercased, sorted) that lost this device, empty when none or without the option. A refused registration replaces nothing.
  - `GET /accounts/:domain/:subscriptionID` (the endpoint URL-encoded, unauthenticated like `GET /registered/:address/:domain/:subscriptionID`) answers `{success, accounts}`: the accounts the subscription is registered for in the app, so an app can say which account a device is notified for.
  - The storage's `recordSubscription` takes `{replaceOtherAccounts}` and answers `{replacedAccounts}`; `getAccountsOf(domain, subscriptionID)` is new.
  - `@push-notification/client`: `createPushNotifications({replaceOtherAccounts: true})` makes `enable()` register with the option, and `enable({replaceOtherAccounts})` overrides it for one call (an app offering "switch this device to this account"). The state gains `otherAccounts`, the other accounts this device is registered for in the app (from `GET /accounts`; `[]` when none, undefined while unknown or against an older server, where the client falls back to `GET /registered/...` for `on` and `unregistered`).

  Nothing changes for a caller that does not use the option: the routes, bodies and answers are as before, plus the new field and route.

### Patch Changes

- Updated dependencies [3078f2a]
  - @push-notification/server@0.2.0

## 0.1.2

### Patch Changes

- 45e8bcc: The API is validated by zod 4 schemas pinned to its TypeScript types with `zod-schema-for`, in place of typia. 0.1.0's build imported typia 7's runtime without declaring it, so a fresh install of `@push-notification/server` or `@push-notification/cli` failed to import (`Cannot find module .../typia/lib/internal/_validateReport.js.mjs`) and `npx push-notification-server` did not start; nothing in the published packages depends on typia now.

  - Routes, headers, statuses and answers are unchanged, and every body accepted or refused before is accepted or refused the same way. `POST /push` still forwards the message as sent, fields the type does not list included.
  - One answer changes shape: an invalid body is refused 400 with the body of every other refusal, `{success: false, errors: [{message}]}` (one error per invalid field, its path in the message), where it was `{success: false, error: [{path, expected, value}]}`.
  - The server exports the response types (`RegistrationResult`, `RemovalResult`, `SubscriptionCheck`, `RegisteredCount`, `ErrorResult`). A new entry, `@push-notification/server/openapi`, exports `generateOpenAPIDocument()`, the OpenAPI document of `/api` generated from the same schemas (`pnpm openapi` writes it); it is kept out of the main entry so a platform's bundle does not take hono-openapi in.
  - `@push-notification/cf-worker`'s `build` now bundles the worker (`wrangler deploy --dry-run`), so a bundling failure fails the build.

- Updated dependencies [45e8bcc]
  - @push-notification/server@0.1.2
