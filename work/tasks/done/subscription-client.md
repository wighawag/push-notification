---
title: '@push-notification/client: the browser side as a package'
slug: subscription-client
blockedBy: []
---

## What to build

The package was an empty stub, and every app copied the example's push module (jolly-roger's `core/service-worker/push-notifications` is such a copy). A client package an app imports: the account's push status on this device as a store, and the actions that change it, speaking `/register`, `/unregister` and `/registered` with missiv-identity's proofs.

## Acceptance criteria

- [x] `createPushNotifications` answers `unsupported`, `no-account`, `loading`, `denied`, `off`, `unregistered` or `on`, and follows an account switch.
- [x] `enable()` subscribes the browser if needed and registers it for the account; `disable()` unregisters it for the account only.
- [x] An `ownershipSignature` the account already carries is used; otherwise `signOwnership` asks the wallet, once per registration.
- [x] Tested against the real server in process (app.request, in-memory libSQL, a recording sender), no port: a push reaches the enabled device, a disabled account's does not.
- [x] The example app uses it.

## Decisions

- The store is sveltore's (the user's choice, 2026-11-17): Svelte's store contract without a Svelte dependency, so a Svelte app uses it with `$` and passes its own stores in, and the package stays framework-free.
- `disable()` does not call the browser's `unsubscribe()`: another account on the same browser may be registered with the same subscription.
- A state check started for an account or registration that has since changed answers nothing (a generation counter), and checks run off the derived store's own update (queued), since a synchronous set from inside it is lost.
- License MIT (the user's decision, 2026-11-17: template apps import it), with its own LICENSE in an AGPL repo.
