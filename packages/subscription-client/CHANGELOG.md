# @push-notification/client

## 0.1.0

### Minor Changes

- 31d637b: The packages move under the `@push-notification` scope: `@push-notification/server` (was push-notification-service-server), `@push-notification/cli` (was push-notification-service-server-nodejs; its command is `push-notification-server`), `@push-notification/cf-worker` and `@push-notification/client` (was push-notification-subscription-client).
- 4ff46bd: The client, from an empty stub: `createPushNotifications`, a Svelte-compatible store (sveltore) of the account's push status on this device (`unsupported`, `no-account`, `loading`, `denied`, `off`, `unregistered`, `on`) with `enable()` (subscribe if needed, then `/register` with both proofs), `disable()` (`/unregister` for the account) and `refresh()`. MIT.

### Patch Changes

- 7c0bbb6: The proofs come from delegated-identity (github.com/wighawag/delegated-identity), which missiv-identity became: the request envelope's purpose line is `delegated-identity request v1`.
