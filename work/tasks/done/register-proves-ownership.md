---
title: 'POST /register proves the address with the wallet-authorized delegate key'
slug: register-proves-ownership
blockedBy: []
---

## What to build

GAP-2 of the 2026-08-21 findings: `/register` recorded a subscription under any address, so anyone could register their own device under someone else's address and receive every notification addressed to them. Prove control of the address with the primitive a game client already holds (a delegate key the wallet authorized), as ONE implementation shared with the trigger service's own registration.

## Acceptance criteria

- [x] A registration whose proofs recover the address is recorded under that address (lowercased) and is visible at `GET /registered/:address/:domain/:subscriptionID`.
- [x] Refused: no `SIGNATURE` header or one more than a minute off (401); a malformed signature (400); a proof for another address, a proof made for another app origin, a request signed by a key the wallet did not authorize (a public proof replayed), a request signed for another server or route, a body changed after signing (403).
- [x] The check is delegated-identity's `verifyRequest` (github.com/wighawag/delegated-identity; first extracted from missiv as missiv-identity), the one package missiv, this server and the trigger service check with.
- [x] The example client registers this way.

## Decisions

- Two proofs: `ownershipSignature`, the wallet's EIP-191 signature over missiv's publication message naming the delegate key for the app's origin, and the delegate key's signature over delegated-identity's request envelope (purpose, this server's origin, method and path, timestamp, body hash) in the `SIGNATURE` header. The delegate key is recovered from the header, not sent in the body. The envelope and the origin were asked by missiv's review (S3-5, S3-6) and built into delegated-identity before its first publish, so the three services verify one shape. Rejected in the plan (S1-2): keying by the delegate address (a new device is a new key, so a notifier would not know whom to notify); a wallet signature per registration (a wallet prompt per device per app).
- The proof's message text is missiv's, byte-identical to `@etherplay/connect-core`'s, so one wallet signature serves missiv and push on the same origin. Its last sentence speaks of encrypted messages; changing it would invalidate every proof already signed, hosted accounts' included.
- `domain` stays the field's name (callers already send it) and may now be an origin; the server keys by the origin it names, so `game.example` and `https://game.example` are one app and an http LAN origin is another.
- No replay store: within the minute a replayed registration can only re-register the victim's own subscription under the victim's address, which it already is.
- Re-registering the same subscription refreshes it (an upsert) instead of failing on the primary key.
- The raw body is cached by a middleware before the validator parses it: Hono would otherwise hand the handler a re-serialised body, and the signature is over the bytes sent.
