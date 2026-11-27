---
title: Registrations proven with delegated-identity's Ed25519 keys and the new publication
slug: ed25519-delegated-identity
blockedBy: []
covers: []
---

## What to build

Move push-notification-server to `delegated-identity` 0.2.0 (its spec `ed25519-keys-in-the-publication`, in that repo's `work/specs/tasked/`): the wallet's publication now names an Ed25519 signing key and an X25519 encryption key instead of the secp256k1 origin key, and requests are signed with the Ed25519 key, the signature header naming its key.

Prerequisite: `delegated-identity` 0.2.0 released (check with `npm view delegated-identity@0.2.0 version`; if it prints nothing, stop and route the task to needs-attention).

- Server: `/register` and `/unregister` carry the key set (both tagged public keys) beside `address`, `domain` and `ownershipSignature`; `proveAccount` uses the new stateless `verifyRequest` with the claimed `address` and the app origin passed explicitly. The refusal statuses stay (401 missing or out of window, 400 malformed, 403 not recovering `address`).
- `@push-notification/client` (`packages/subscription-client`): takes the account's key set (its Ed25519 private key to sign, both public keys to send) and the ownership signature, as `@etherplay/connect` 0.19.0 hands them out; it no longer derives a secp256k1 delegate public key.
- README's API table, the protocol test helpers and the examples updated. No compatibility with the old proof: there is no production app (the human, 2026-11-27).

## Acceptance criteria

- [ ] A registration proven with the new key set and publication is accepted; one with another key set, address, origin, route, body, or an old-format signature is refused with today's statuses
- [ ] The subscription client registers and unregisters with a connect-shaped account (key set + ownership signature)
- [ ] No code path recovers a secp256k1 request signature any more
- [ ] Tests cover the new behaviour (mirror the repo's existing test style)

## Blocked by

- None in this repo; `delegated-identity` 0.2.0 (above).

## Prompt

Adopt `delegated-identity`'s new wire (why: missiv's `docs/adr/0004-messaging-keys-one-ciphertext-server-checked-signatures.md`). The proof is checked in the server's API (`proveAccount`) and produced in the subscription client (`ownershipSignatureOf`, `signRequest`). `/push` (bearer tokens) is unaffected. Apps that wire the client, such as jolly-roger's `with/push-notifications`, change after this release (etherplay-connect's `plans/ed25519-keys-in-the-publication.md`, "Order of work").

FIRST, check this task against current reality (it is a launch snapshot and may have drifted): does it still match the code and the specs and plans it names? If a prerequisite landed differently than assumed, route the task to needs-attention with the discrepancy instead of building on a stale premise.

RECORD non-obvious in-scope decisions you make while building (an ADR if it meets the ADR gate in `work/protocol/ADR-FORMAT.md`, otherwise a JSDoc at the choice site or a `## Decisions` block for the done record).

Command cost: bound exploratory shell commands (`timeout 30`, cap output with `head`), never run an unbounded regex over minified, bundled or generated files, and never `grep -r` through `node_modules`, `dist` or `.git`.

Done means: the acceptance criteria hold and `dorfl.json`'s `verify` passes (`pnpm -r format:check && pnpm build && pnpm test && pnpm check:packed`).

---

### Claiming this task

```sh
dorfl claim ed25519-delegated-identity --arbiter <remote>
git fetch <remote> && git switch -c work/ed25519-delegated-identity <remote>/main
# on completion, in the work branch's PR/merge:
git mv work/tasks/ready/ed25519-delegated-identity.md work/tasks/done/ed25519-delegated-identity.md
```

## Decisions

- **The client's account shape is `{address, keySet, ownershipSignature?}`**, with `keySet` typed as `{signing: KeyPair; encryption: {publicKey: Key}}`. Any `delegated-identity` `KeySet` fits it, and an app does not have to hand over the encryption private key. `@etherplay/connect` 0.19.0 is not released and its plan ([etherplay-connect `plans/ed25519-keys-in-the-publication.md`]) leaves the field name open (it suggests `keys`). I named the field `keySet` after the library's type and the body field. If connect lands on another name, apps map one field (`{address, keySet: account.keys, ownershipSignature}`). The alternative was to wait for connect's name. This touches jolly-roger's `with/push-notifications` wiring.
- **The body field is `keySet` and holds untagged 0x hex keys**, as `delegated-identity`'s README shows. The `ed25519:`/`x25519:` algorithm tags exist only inside the publication message, and the library adds them there. The alternative was to send tagged strings, which the library does not accept as a `PublicKeySet`. This touches every caller of `/register` and `/unregister` (missiv, the trigger service, jolly-roger).
- **The app is still named by `domain` in the body**, not by the `appOrigin` field the library's README example uses. The origin passed to `verifyRequest` is `fromDomainToOrigin(domain)`, the same origin storage and tokens are keyed by. Renaming it would have been an unrelated wire change.
- **Key fields are checked for their `0x` prefix only** (`PublicKeySetSchema`), matching how `ownershipSignature` is handled. A key that is not 32 bytes of hex reaches `verifyRequest` and is refused as malformed (400, "a signature is malformed").
- **The `CONTEXT.md` glossary entry "delegate key" is replaced by "key set"** (with "signing key" and "encryption key" defined inside it), to match `delegated-identity` 0.2.0's vocabulary. The old term no longer describes anything in this repo.
