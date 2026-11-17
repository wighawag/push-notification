# CONTEXT: push-notification-server domain language

The domain glossary for `push-notification-server`. Agents and skills use THIS vocabulary when naming modules, tests, and discussing the system. Architectural rationale lives in `docs/adr/` (decisions); product framing lives in `work/specs/`; how agents work here is in `AGENTS.md`.

## What push-notification-server is

A Web Push relay keyed by ACCOUNT rather than by device: an app registers a browser's push subscription for an Ethereum account on a domain, and a service holding that domain's token sends a notification to the account, reaching every device the account registered. The calling service stores no push data at all. It ships as a pnpm/TypeScript monorepo: the server (`packages/server`, a Hono app over remote-sql), platforms that host it (`platforms/nodejs` on libSQL, `platforms/cf-worker` on D1), and an example client (`examples/svelte`).

## Core domain terms

- **account**: an Ethereum address (lowercased), the wallet a notification is addressed to. Subscriptions are keyed by `(account, domain)`.
- **domain**: the app a subscription belongs to, as a bare host (`game.example`, meaning `https://game.example`; `localhost:5173`, meaning `http://`) or an origin (`http://192.168.1.10:5173`). Everything (subscriptions, tokens, deliveries) is keyed by the ORIGIN it names, which is also what an ownership proof names.
- **subscription**: a browser's Web Push subscription (`endpoint`, `keys`, `expirationTime` in milliseconds); its endpoint is its id. One account has one per device per domain.
- **delegate key**: a secp256k1 key the app holds for the account, so registering needs no wallet prompt per request. The same key missiv uses.
- **ownership proof**: the wallet's EIP-191 signature over missiv's publication message, authorizing a delegate key for a domain's origin (`ownershipSignature`).
- **request signature**: the delegate key's signature over the request envelope (this server's origin, the method and path, a timestamp, the body's hash), in the `SIGNATURE` header as `<timestamp>:<signature>`; refused a minute either side of the server's clock. The server's origin is `PUBLIC_ORIGIN`, else the request URL's. With the ownership proof it proves a registration speaks for the account; both are checked by missiv-identity (`verifyRequest`), published from missiv's repo and shared with missiv and the trigger service.
- **domain token**: a bearer token the operator issues to a calling service for ONE domain, configured by its SHA-256 in `PUSH_TOKENS` (`<domain>:<hash>`). `/push` and the count route require it.
- **idempotency key**: the `Idempotency-Key` header of a push, naming it (a trigger service uses `<chainId>:<blockHash>:<logIndex>:<recipient>`). A delivery is recorded per `(account, domain, key, subscription)`, so a retry reaches only the subscriptions not yet delivered.
- **delivery**: one push accepted by the push service for one subscription. A delivery is claimed before sending and released on failure; a claim older than a minute is retaken.
- **push sender**: the seam that sends one payload to one subscription: Web Push signed with the VAPID keys in production, a recording sender in tests.
- **platform**: a runtime host wiring the server to a database (nodejs: libSQL; cf-worker: D1).

## Behaviour a caller can rely on

- A push service answering 410 or 404 for a subscription removes it, and an expired subscription is removed without sending, so a caller never manages revocation or expiry.
- The payload is a Declarative Web Push message (`web_push: 8030`), so a service builds it as data, with no client code.

## Conventions

Standing per-change rules agents must follow in this repo.

- **Every change to a published package needs a changeset** (`pnpm changeset`, committed with the change).
- **Tests open no port**: the API suite runs through `app.request` on an in-memory libSQL database, and every platform runs the same suite.
