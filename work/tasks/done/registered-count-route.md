---
title: 'GET /registered/:address/:domain answers how many live subscriptions an account has'
slug: registered-count-route
blockedBy: []
---

## What to build

ENHANCEMENT-1 of the 2026-08-21 findings: a trigger service garbage-collects triggers whose subscriber has no device left, and could only learn it by pushing first (a `/push` delivering to nobody), after all the matching and digest work. An endpoint answering whether `(address, domain)` has any live subscription, with a count.

## Acceptance criteria

- [x] `GET /registered/:address/:domain` answers `{success, registered, count}`, counting only subscriptions not expired.
- [x] It requires the domain's token (401 without, 403 with another domain's).

## Decisions

- Token-gated, unlike the per-subscription route (which a browser calls about its own endpoint): how many devices an account has is the calling service's business only.
