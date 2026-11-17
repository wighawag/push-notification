# push-notification-service-server

## 0.1.0

### Minor Changes

- 991de87: Breaking: the routes a trigger service needs, made safe for it.

  - `POST /push` requires `Authorization: Bearer <token>`, a token configured for the push's domain (env `PUSH_TOKENS`, a list of `<domain>:<sha256 hex of the token>`): 401 without a known token, 403 with another domain's.
  - `POST /register` requires two proofs (delegated-identity): the delegate key's signature over the raw body in the `SIGNATURE` header, and `ownershipSignature`, the wallet's signature over missiv's publication message naming that key for the domain's origin. The subscription is keyed by the wallet address they recover; 401 without the header, 400 on a malformed signature, 403 when the proofs do not recover `address`. Registering the same subscription again refreshes it.
  - `POST /push` takes an `Idempotency-Key` header: a retry with the same key reaches only the subscriptions not yet delivered (remembered 7 days). It answers 200 when every live subscription has the push, 502 when a send failed, 409 while another request with the key is sending, with `{success, delivered, alreadyDelivered, inFlight, failed, removed}`.
  - `GET /registered/:address/:domain`, for a holder of the domain's token: `{success, registered, count}` of live subscriptions.
  - Expired subscriptions are now removed (their expiry, in milliseconds, was compared with seconds), `succes` is spelled `success`, and the unauthenticated `?_initDB=true` is gone: a platform calls `setupDatabase` (exported) instead.
  - `ServerOptions.getPushSender` replaces Web Push (tests use a recording sender).

- 1f84d06: `POST /register`'s `SIGNATURE` is delegated-identity's request envelope (`<timestamp>:<compact hex>:<recovery bit>`, over this server's origin, `POST /api/register`, the timestamp and the body), refused (401) a minute either side; a request signed for another server or route is refused (403). `domain` may be an origin (`http://192.168.1.10:5173`), and subscriptions, tokens and deliveries are keyed by the origin a domain names. New env `PUBLIC_ORIGIN`, the origin request signatures name (default: the request URL's).
- 31d637b: The packages move under the `@push-notification` scope: `@push-notification/server` (was push-notification-service-server), `@push-notification/cli` (was push-notification-service-server-nodejs; its command is `push-notification-server`), `@push-notification/cf-worker` and `@push-notification/client` (was push-notification-subscription-client).
- 34eaa98: `POST /unregister {address, domain, endpoint, ownershipSignature}`, signed as `/register` is: removes that account's subscription for the endpoint (the same browser registered for another account keeps its), answering `{success, unregistered}`.

### Patch Changes

- 7c0bbb6: The proofs come from delegated-identity (github.com/wighawag/delegated-identity), which missiv-identity became: the request envelope's purpose line is `delegated-identity request v1`.
- 2e5e51d: The server packages declare AGPL-3.0-only, as the repo is licensed (they said MIT). New env `VAPID_SUBJECT`, the contact given to push services (default `mailto:notifications@etherplay.io`, which was hard-coded).
- 6f65fd0: A Node.js platform on libSQL: `@push-notification/cli` (a CLI serving on `PORT`, its database `DB` a libSQL URL, its tables created at start) and `createNodeServer` for an app in process. @push-notification/server's `build` now compiles its TypeScript, which its package exports always named.

## 0.0.3

### Patch Changes

- change name

## 0.0.2

### Patch Changes

- first release

## 0.0.1

### Patch Changes

- first version
