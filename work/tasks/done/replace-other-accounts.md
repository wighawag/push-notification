---
title: 'POST /register can make a device one account''s alone (replaceOtherAccounts), and GET /accounts names a device''s accounts'
slug: replace-other-accounts
blockedBy: []
---

## What to build

Found in jolly-roger's manual QA (F21, 2026-11-26): one Chrome profile, two accounts of one app, notifications enabled for each. A registration is keyed by `(account, app, endpoint)`, so the device then received both accounts' pushes, including direct messages for the account not shown, which it cannot read there. The human decided against making that a rule ("there is a use case" for one device notified for several accounts) and for an OPTION on register: when set, the server removes this endpoint's registrations for the app's other accounts; default unchanged.

## Acceptance criteria

- [x] `POST /register` with `replaceOtherAccounts: true` removes the endpoint's registrations for every other account of the same app, in the same transaction as the registration is recorded, and answers them in `replacedAccounts` (lowercased, sorted); without it, several accounts per device stay possible (`replacedAccounts: []`).
- [x] Other apps' registrations of the endpoint and the other accounts' other devices are untouched; a refused registration replaces nothing; the option is signed with the body (added after signing: 403).
- [x] `GET /accounts/:domain/:subscriptionID` answers the accounts an endpoint is registered for in the app.
- [x] `@push-notification/client`: `replaceOtherAccounts` on the store and per `enable()` call; `otherAccounts` in the state, with a fallback for a server without the route.
- [x] Cases in the API suite (every platform), the OpenAPI test, the client test; a changeset.

## Decisions

- Named `replaceOtherAccounts` rather than `exclusive`: it says what it does to whom (the OTHER accounts lose this device), where `exclusive` reads as easily as "this account's other devices are dropped".
- One batch (libSQL's and D1's batch is a transaction), so no other request sees the device registered for two accounts, or for none.
- `GET /accounts` is unauthenticated like `GET /registered/...`: the endpoint is the secret, known to the browser and this server only, and whoever holds it could already test any address there.
