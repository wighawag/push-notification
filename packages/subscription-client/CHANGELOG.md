# @push-notification/client

## 0.2.0

### Minor Changes

- 3078f2a: One account per device, as an option. A browser's subscription can be registered for several accounts of one app (a registration is keyed by account, app and endpoint), so a device switched to another account kept receiving the previous one's notifications, its direct messages included, which it cannot read there. That stays the default (an app may want one device notified for several accounts); an app that wants one account per device now asks for it:

  - `POST /register` takes `replaceOtherAccounts: true` (signed with the body like every other field): in the same transaction as this registration is recorded, the endpoint's registrations for every OTHER account of the same app are removed. Other apps' registrations of the endpoint, and the other accounts' other devices, are untouched. The answer gains `replacedAccounts`, the accounts (lowercased, sorted) that lost this device, empty when none or without the option. A refused registration replaces nothing.
  - `GET /accounts/:domain/:subscriptionID` (the endpoint URL-encoded, unauthenticated like `GET /registered/:address/:domain/:subscriptionID`) answers `{success, accounts}`: the accounts the subscription is registered for in the app, so an app can say which account a device is notified for.
  - The storage's `recordSubscription` takes `{replaceOtherAccounts}` and answers `{replacedAccounts}`; `getAccountsOf(domain, subscriptionID)` is new.
  - `@push-notification/client`: `createPushNotifications({replaceOtherAccounts: true})` makes `enable()` register with the option, and `enable({replaceOtherAccounts})` overrides it for one call (an app offering "switch this device to this account"). The state gains `otherAccounts`, the other accounts this device is registered for in the app (from `GET /accounts`; `[]` when none, undefined while unknown or against an older server, where the client falls back to `GET /registered/...` for `on` and `unregistered`).

  Nothing changes for a caller that does not use the option: the routes, bodies and answers are as before, plus the new field and route.

## 0.1.0

### Minor Changes

- 31d637b: The packages move under the `@push-notification` scope: `@push-notification/server` (was push-notification-service-server), `@push-notification/cli` (was push-notification-service-server-nodejs; its command is `push-notification-server`), `@push-notification/cf-worker` and `@push-notification/client` (was push-notification-subscription-client).
- 4ff46bd: The client, from an empty stub: `createPushNotifications`, a Svelte-compatible store (sveltore) of the account's push status on this device (`unsupported`, `no-account`, `loading`, `denied`, `off`, `unregistered`, `on`) with `enable()` (subscribe if needed, then `/register` with both proofs), `disable()` (`/unregister` for the account) and `refresh()`. MIT.

### Patch Changes

- 7c0bbb6: The proofs come from delegated-identity (github.com/wighawag/delegated-identity), which missiv-identity became: the request envelope's purpose line is `delegated-identity request v1`.
