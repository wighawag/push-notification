---
'@push-notification/server': minor
'@push-notification/cli': minor
'@push-notification/cf-worker': minor
'@push-notification/client': minor
---

BREAKING: registrations are proven with delegated-identity 0.2.0's key set (an Ed25519 signing key and an X25519 encryption key) instead of a secp256k1 delegate key. There is no compatibility with the old proof.

- `POST /register` and `POST /unregister` take `keySet: {signing: {publicKey}, encryption: {publicKey}}` (32-byte keys, 0x-prefixed hex) beside `address`, `domain` and `ownershipSignature`. `ownershipSignature` is the wallet's EIP-191 signature over delegated-identity's new publication message, which names both keys for the app's origin. The `SIGNATURE` header is the signing key's Ed25519 signature over the new request envelope, `<timestamp ms>:<signing key hex>:<signature hex>`. The server checks both with delegated-identity's stateless `verifyRequest`; no secp256k1 request signature is recovered any more.
- The refusals are unchanged: 401 without a signature or outside its minute, 400 for a malformed body, header, key or signature (an old-format secp256k1 header included), 403 when the proofs do not prove `address` (another key set, address, origin, route or body, or an ownership proof over the old publication message).
- `@push-notification/client`: the account is `{address, keySet, ownershipSignature?}`, the key set as `@etherplay/connect` hands it out (a delegated-identity `KeySet`; its signing private key signs, only the public keys are sent). `delegatePrivateKey` is gone, and `signOwnership` is asked to sign the publication message of the key set.
- `/push` and the token routes are unaffected.
