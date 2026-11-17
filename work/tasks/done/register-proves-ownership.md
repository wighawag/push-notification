---
title: 'POST /register proves the address with the wallet-authorized delegate key'
slug: register-proves-ownership
blockedBy: []
---

## What to build

GAP-2 of the 2026-08-21 findings: `/register` recorded a subscription under any address, so anyone could register their own device under someone else's address and receive every notification addressed to them. Prove control of the address with the primitive a game client already holds (a delegate key the wallet authorized), as ONE implementation shared with the trigger service's own registration.

## Acceptance criteria

- [x] A registration whose proofs recover the address is recorded under that address (lowercased) and is visible at `GET /registered/:address/:domain/:subscriptionID`.
- [x] Refused: no `SIGNATURE` header (401); a malformed signature (400); a proof for another address, a proof made for another domain, a request signed by a key the wallet did not authorize (a public proof replayed), a body changed after signing (403).
- [x] The check is missiv-identity's `verifyRequest`, the package missiv publishes for missiv, this server and the trigger service.
- [x] The example client registers this way.

## Decisions

- Two proofs, as missiv's `/register` already had them: `ownershipSignature`, the wallet's EIP-191 signature over missiv's publication message naming the delegate key for the domain's origin, and the delegate key's signature over the raw body in the `SIGNATURE` header. The delegate key is recovered from the header, not sent in the body. Rejected in the plan (S1-2): keying by the delegate address (a new device is a new key, so a notifier would not know whom to notify); a wallet signature per registration (a wallet prompt per device per app).
- The proof's message text is missiv's, unchanged byte for byte, so one wallet signature serves missiv and push on the same domain. Its last sentence speaks of encrypted messages; changing it would invalidate every proof already signed.
- No timestamp or nonce in the signed body: replaying a captured registration can only re-register the victim's own subscription under the victim's address, which it already is.
- Re-registering the same subscription refreshes it (an upsert) instead of failing on the primary key.
- The raw body is cached by a middleware before the validator parses it: Hono would otherwise hand the handler a re-serialised body, and the signature is over the bytes sent.
