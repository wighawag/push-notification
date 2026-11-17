---
title: 'POST /push requires a token scoped to the push domain'
slug: push-authenticated-per-domain
blockedBy: []
---

## What to build

GAP-1 of the 2026-08-21 findings (`docs/findings/trigger-service-integration.md`, now this record): `/push` was unauthenticated, so anyone could notify any address in any domain, and a trigger service, the machine client this route exists for, had no credential to present. A server-to-server credential per calling service, scoped to a domain, so a caller for one app cannot push to another's users, compared in constant time.

## Acceptance criteria

- [x] `/push` without a token, or with a token no domain has, answers 401 and sends nothing.
- [x] `/push` with another domain's token answers 403 and sends nothing.
- [x] Tokens are configured per domain by the operator, without storing a secret (env `PUSH_TOKENS`, `<domain>:<sha256 hex>`).
- [x] Covered by the API suite on every platform.

## Decisions

- The credential is `Authorization: Bearer <token>`, compared as its SHA-256 against every configured hash in constant time (no early exit), so the configuration holds no secret and a timing probe learns nothing. Alternatives rejected in jolly-roger's plan (step S1, S1-1): a signature per push (a service has no wallet); one global token (a caller for one app could push to another's users).
- 401 for no token or an unknown one, 403 for a known token of another domain: the caller learns its token is valid but misdirected, nothing about other domains.
- A malformed `PUSH_TOKENS` entry throws (every push answers 500) rather than being skipped, so a misconfiguration is seen. A domain may carry a port (the hash is split at the LAST colon) and may appear several times, to rotate a token.
- `GET /registered/:address/:domain` (the count route) takes the same domain token, since whether an account has devices is the caller's business, not the public's.
