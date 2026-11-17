---
'@push-notification/client': minor
---

The client, from an empty stub: `createPushNotifications`, a Svelte-compatible store (sveltore) of the account's push status on this device (`unsupported`, `no-account`, `loading`, `denied`, `off`, `unregistered`, `on`) with `enable()` (subscribe if needed, then `/register` with both proofs), `disable()` (`/unregister` for the account) and `refresh()`. MIT.
