# @push-notification/client

The browser side of @push-notification/server: a store of whether the current account receives push notifications on this device, with `enable()` and `disable()`. The store is Svelte-compatible ([sveltore](https://github.com/wighawag/sveltore)), so a Svelte app reads it with `$` and its inputs can be any Svelte stores.

```ts
import {createPushNotifications} from '@push-notification/client';

const push = createPushNotifications({
	serverEndpoint: 'https://push.example/api',
	vapidPublicKey: PUBLIC_VAPID_KEY,
	domain: 'game.example', // the app, as the server's tokens name it
	account, // Readable<{address, keySet, ownershipSignature?} | undefined>
	serviceWorker, // Readable<ServiceWorkerRegistration | undefined>
	signOwnership: (address, message) => wallet.signMessage({message}), // when the account carries no ownershipSignature
	replaceOtherAccounts: true, // optional: one account per device (default: several)
});

$push.status; // 'unsupported' | 'no-account' | 'loading' | 'denied' | 'off' | 'unregistered' | 'on'
$push.otherAccounts; // the OTHER accounts this browser is registered for in the app ([] when none, undefined while unknown)
await push.enable(); // subscribes this browser if needed and registers it for the account
await push.enable({replaceOtherAccounts: true}); // the same, and the browser leaves the app's other accounts
await push.disable(); // unregisters it for the account; other accounts on this browser keep theirs
```

`account.address` is the WALLET: notifications are addressed to it, from every device it enabled. `account.keySet` is the account's key set in the app, as `@etherplay/connect` hands it out (a delegated-identity `KeySet`, `{signing: {publicKey, privateKey}, encryption: {publicKey}}` at least): the Ed25519 signing key signs each request (delegated-identity's request envelope), and only the two public keys are sent. `ownershipSignature` is the wallet's signature over delegated-identity's publication message naming both keys for the app's origin, asked once through `signOwnership` when the app does not already hold it.

By default a browser can be registered for several accounts of the app, each notified, so switching account and enabling again adds the new one. `replaceOtherAccounts` (on the store, or per `enable()` call) makes the browser the current account's alone: its registrations for the app's other accounts are removed in the same transaction. `otherAccounts` lets the app say that this browser is notified for another account and offer to switch it.

Pushes are sent by a service holding the domain's token (`POST /api/push`), never by the page.
