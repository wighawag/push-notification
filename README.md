<h1 align="center">
  push-notification
</h1>

A Web Push relay keyed by account: an app registers a browser's subscription for an Ethereum account on a domain, and a service holding that domain's token notifies the account on every device it registered. The vocabulary is in [`CONTEXT.md`](CONTEXT.md).

## The API

Mounted under `/api`.

| Route | Who calls it | What it needs |
|---|---|---|
| `POST /register` `{address, domain, subscription, ownershipSignature}` | the app, in the browser | the `SIGNATURE` header (the delegate key's signature over the request envelope: this server's origin, the route, a timestamp, the body) and `ownershipSignature` (the wallet's over missiv's publication message for the delegate key), both from [missiv-identity](https://github.com/wighawag/missiv/tree/main/packages/identity) |
| `POST /unregister` `{address, domain, endpoint, ownershipSignature}` | the app, at logout or an account switch | signed as `/register`; removes that account's subscription only |
| `GET /registered/:address/:domain/:subscriptionID` | the app, about its own subscription | nothing |
| `POST /push` `{address, domain, message, topic?, urgency?}` | a service | `Authorization: Bearer <the domain's token>`; an `Idempotency-Key` when it retries |
| `GET /registered/:address/:domain` | a service | the domain's token; answers `{registered, count}` |

`/push` answers 200 when every live subscription has the push, 502 when a send failed and 409 while another request with the same key is sending, counting `delivered`, `alreadyDelivered`, `inFlight`, `failed` and `removed`. A retry with the same `Idempotency-Key` reaches only the subscriptions not yet delivered.

The operator configures the domain tokens by their SHA-256, `PUSH_TOKENS="<domain>:<sha256 hex>,..."`:

```sh
printf %s "$TOKEN" | sha256sum | cut -d' ' -f1
```

## Platforms

- `platforms/nodejs`: a Node.js process on libSQL (`DB` a libSQL URL, `PORT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_TOKENS`; see its `.env.default`), and `createNodeServer` for the app in process.
- `platforms/cf-worker`: a Cloudflare Worker on D1.

## Getting Started

```bash
pnpm install
pnpm build
pnpm test        # the API suite on the server package and on the nodejs platform, no port
pnpm start       # the dev stack in zellij
```
