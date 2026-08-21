# Findings: gaps blocking use by an automated trigger service

Recorded 2026-08-21, from a design session on `jolly-roger-eth/ethereum-indexer`. That project is adding trigger consumers (independent services that watch indexed chain events and fire actions, per its `docs/adr/0005` and `0007`). Their **notification action is a call to this service**: `POST /push {address, domain, message}`.

The identity model here is a good fit and should not change: keying on `(address, domain)` rather than on a push endpoint gives multi-device fan-out, free revocation (`410`/`404` delete the subscription) and free rotation, and it means the calling service stores no push data at all. What follows are the three gaps that block a machine caller with at-least-once delivery semantics.

---

## GAP-1 (HIGH) `/push` is unauthenticated

`packages/server/src/api/index.ts` carries `// TODO authentication via tokens` on the `/push` route. As it stands, **anyone can send a notification to any address in any domain**. This is the single blocker for a server-to-server caller: the trigger service is exactly the machine client that token is for.

**Fix.** A server-to-server credential per calling service, ideally scoped to a `domain` so a caller for one app cannot push to another's users. Constant-time comparison on the check.

## GAP-2 (HIGH) `/register` does not prove address ownership

`// TODO authentication of address` on the `/register` route. Anyone can register their own subscription under someone else's address and receive every notification addressed to that player. The chain data itself is public, but notification payloads are personalised (they say what happened to *you*, and may say where and when), so this is a real leak rather than a theoretical one.

**Fix.** Prove control of the address at registration, via a signature. The indexer-side design expects a **registered/delegated signer** acting on behalf of the owner, which matches how a game client already authenticates, so the same primitive covers both.

**Note for the caller side:** trigger registration on the consumer needs the *same* proof, or an attacker registers "notify address X on every event" and uses the trigger service to spam a third party's devices. That check should be **one shared implementation** used by both services, not two similar ones.

## GAP-3 (MEDIUM, but blocking for at-least-once callers) `/push` is neither idempotent nor atomic across devices

`/push` loops over every subscription for `(address, domain)` and pushes to each. On partial failure it returns `success: false` with counts, having **already delivered** to the subscriptions that succeeded.

A caller with a durable outbox (which is what "guaranteed delivery" requires) will retry that call, and every device that already received the notification **gets it a second time**. The `topic` header does not cover this: it collapses messages still undelivered at the push service, not ones already delivered to a device. There is also a related `// TODO Retry` for 5xx responses, which is fine to leave to the caller, but only once retrying is safe.

**Fix.** Accept an idempotency key on `/push` and dedupe per `(address, domain, key, endpoint)`, so a retry re-attempts only the subscriptions that have not yet been delivered. That makes "reliable delivery" and "no duplicate notifications" simultaneously satisfiable, which today they are not.

This matters beyond notifications: the same trigger service will drive value-bearing actions (a badge award, an NFT mint behind a service API), where at-least-once against a non-idempotent target is a double-mint. An idempotency key on every action target is a standing requirement of that design, and this service is the first target.

---

## Not a gap, worth recording

- `410 Gone` / `404` deleting the subscription, plus the `expirationTime` check, means **subscription lifecycle is already handled**. The trigger service needs to do nothing about revocation or expiry, which is why keying on address rather than endpoint is the right call.
- Declarative Web Push (`web_push: 8030`) means the payload is data, so a trigger action can build it without any client-side code, which suits a code-defined action fired from a user-registered trigger.
