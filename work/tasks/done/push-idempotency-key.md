---
title: 'POST /push takes an Idempotency-Key, so a retry delivers nothing twice'
slug: push-idempotency-key
blockedBy: []
---

## What to build

GAP-3 of the 2026-08-21 findings: `/push` looped over an account's subscriptions and, on a partial failure, answered failure having already delivered to the others, so a caller with a durable outbox (at-least-once) re-notified every device that had it. An idempotency key on `/push`, deduplicated per `(address, domain, key, subscription)`, so a retry re-attempts only the subscriptions not yet delivered.

## Acceptance criteria

- [x] A retried push with the same key delivers nothing twice (tested with a recording sender).
- [x] After a partial failure the answer is retryable (502) and the retry reaches only the failed subscription.
- [x] Another key delivers again; a key is scoped to its address; without a key every call delivers.
- [x] A concurrent request with the same key does not send while the first holds the claim (409).

## Decisions

- The key is the `Idempotency-Key` header (the IETF httpapi draft's), not a body field, so a generic action adapter (the trigger service's) sends every target's key the same way.
- Claim before sending, release on failure: a delivery row is inserted (`delivered = 0`, `claimedAt`) before the send, set delivered after it, deleted after a failed send. A concurrent request finds the claim and answers 409 without sending; a claim older than 60 s (a crashed request) is retaken. So a duplicate needs a crash between the push service accepting and the row being marked, and a loss needs nothing worse than a stale claim's minute.
- Status codes carry the retry signal: 200 when every live subscription has the push, 502 when a send failed (failures win over in-flight), 409 while another request with the key sends. The body counts `delivered`, `alreadyDelivered`, `inFlight`, `failed`, `removed`. The old `successfullPush` / `failedPush` / `deletedSubscriptions` fields are gone (breaking, in the changeset).
- A key is remembered 7 days, pruned on every keyed push; at most 256 characters. A key is optional: an operator's one-off push needs none, and every retrying caller is expected to send one.
- 410 and 404 from the push service still remove the subscription; expired subscriptions are now actually removed (their expiry, in milliseconds, had been compared with seconds, so none ever expired).
