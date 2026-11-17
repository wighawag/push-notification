---
'@push-notification/server': minor
'@push-notification/cf-worker': minor
---

Breaking: the routes a trigger service needs, made safe for it.

- `POST /push` requires `Authorization: Bearer <token>`, a token configured for the push's domain (env `PUSH_TOKENS`, a list of `<domain>:<sha256 hex of the token>`): 401 without a known token, 403 with another domain's.
- `POST /register` requires two proofs (delegated-identity): the delegate key's signature over the raw body in the `SIGNATURE` header, and `ownershipSignature`, the wallet's signature over missiv's publication message naming that key for the domain's origin. The subscription is keyed by the wallet address they recover; 401 without the header, 400 on a malformed signature, 403 when the proofs do not recover `address`. Registering the same subscription again refreshes it.
- `POST /push` takes an `Idempotency-Key` header: a retry with the same key reaches only the subscriptions not yet delivered (remembered 7 days). It answers 200 when every live subscription has the push, 502 when a send failed, 409 while another request with the key is sending, with `{success, delivered, alreadyDelivered, inFlight, failed, removed}`.
- `GET /registered/:address/:domain`, for a holder of the domain's token: `{success, registered, count}` of live subscriptions.
- Expired subscriptions are now removed (their expiry, in milliseconds, was compared with seconds), `succes` is spelled `success`, and the unauthenticated `?_initDB=true` is gone: a platform calls `setupDatabase` (exported) instead.
- `ServerOptions.getPushSender` replaces Web Push (tests use a recording sender).
