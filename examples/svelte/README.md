# push-notification-example-svelte

A SvelteKit page that subscribes a browser to push notifications from @push-notification/server, for a fake wallet account (`src/lib/fake-owner-account`) and the delegate key derived from it (`src/lib/private-account`).

## How it registers

`src/lib/state.ts` wires @push-notification/client (`createPushNotifications`): it subscribes the service worker with the server's VAPID public key, then calls `POST /api/register` with two proofs, both from missiv-identity (and `POST /api/unregister` to disable):

- `ownershipSignature`: the wallet's signature over the publication message naming the delegate key for this domain's origin (`originPublicKeyPublicationMessage(fromDomainToOrigin(domain), delegatePublicKey(privateKey))`), one wallet prompt per registration;
- the `SIGNATURE` header: the delegate key's signature over the request envelope, which names the server's origin, `POST /api/register`, a timestamp and the body (`signRequest`); the server refuses it after a minute.

The subscription is then keyed by the WALLET address, so a service notifying that account reaches every device it registered.

## Sending a push

The page cannot push: `POST /api/push` takes a service's token for the domain. To try it locally, run the nodejs server with a token for `push-notifications-example.etherplay.io` and send one with curl:

```sh
TOKEN=a-local-token
PUSH_TOKENS="push-notifications-example.etherplay.io:$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)" \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... pnpm --filter @push-notification/cli start

curl -X POST http://localhost:34005/api/push \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: try-1' \
  -d '{"address":"<the wallet address>","domain":"push-notifications-example.etherplay.io","message":{"web_push":8030,"notification":{"title":"hello","navigate":"/"}}}'
```

`PUBLIC_VAPID_SERVER_PUBLIC_KEY` in `.env` must be the server's `VAPID_PUBLIC_KEY`.

## Developing

```sh
pnpm dev
```
