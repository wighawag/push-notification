# push-notification-subscription-client

The browser side of push-notification-service-server: a store of whether the current account receives push notifications on this device, with `enable()` and `disable()`. The store is Svelte-compatible ([sveltore](https://github.com/wighawag/sveltore)), so a Svelte app reads it with `$` and its inputs can be any Svelte stores.

```ts
import {createPushNotifications} from 'push-notification-subscription-client';

const push = createPushNotifications({
	serverEndpoint: 'https://push.example/api',
	vapidPublicKey: PUBLIC_VAPID_KEY,
	domain: 'game.example', // the app, as the server's tokens name it
	account, // Readable<{address, delegatePrivateKey, ownershipSignature?} | undefined>
	serviceWorker, // Readable<ServiceWorkerRegistration | undefined>
	signOwnership: (address, message) => wallet.signMessage({message}), // when the account carries no ownershipSignature
});

$push.status; // 'unsupported' | 'no-account' | 'loading' | 'denied' | 'off' | 'unregistered' | 'on'
await push.enable(); // subscribes this browser if needed and registers it for the account
await push.disable(); // unregisters it for the account; other accounts on this browser keep theirs
```

`account.address` is the WALLET: notifications are addressed to it, from every device it enabled. `delegatePrivateKey` signs each request (missiv-identity's request envelope); `ownershipSignature` is the wallet's signature over missiv-identity's publication message for that key and the app's origin, asked once through `signOwnership` when the app does not already hold it.

Pushes are sent by a service holding the domain's token (`POST /api/push`), never by the page.
