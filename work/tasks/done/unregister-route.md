---
title: 'POST /unregister removes a subscription for one account'
slug: unregister-route
blockedBy: []
---

## What to build

A logout or an account switch could not remove a subscription, so a browser kept receiving the notifications of every account it had ever registered for. A route, proven like `/register`, removing the subscription for that account and app.

## Acceptance criteria

- [x] `POST /unregister {address, domain, endpoint, ownershipSignature}` with the request envelope removes the subscription; pushes to the account no longer reach that device.
- [x] Another account registered on the same browser keeps its subscription.
- [x] Refused for another account's subscription (403) and with a `/register` signature (the envelope names the route).
- [x] Answers `{success, unregistered}`, `false` when nothing was there.

## Decisions

- Proven with both proofs rather than by the endpoint alone (which only the browser and this server know): one rule for every write, and the client holds the proofs anyway.
- Scoped to `(address, app origin, endpoint)`, never the endpoint everywhere: unregistering is an account leaving a device, not the device leaving push (that is the browser's own `unsubscribe`, which the client does not call, since other accounts may share the subscription).
