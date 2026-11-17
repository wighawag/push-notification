# push-notification-service-server-cf-worker

push-notification-service-server as a Cloudflare Worker on D1 (`wrangler.toml`, environment `production`).

## Configure

Set the secrets with `wrangler -e production secret put <NAME>`:

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: the Web Push keys, and `VAPID_SUBJECT` (optional) the contact push services are given;
- `PUSH_TOKENS`: `<domain>:<sha256 hex of the token>`, comma separated, one per calling service;
- `PUBLIC_ORIGIN` (optional): the origin request signatures name, when the worker is reached under another host than its request URL's.

## Deploy, and after every upgrade

```sh
pnpm init-db             # applies db.sql to the D1 database: every table is CREATE ... IF NOT EXISTS, so it is how a deployed database gains a new one (0.1.0 added Deliveries)
pnpm deploy:production
```

## Tests

The worker has no test of its own: it is a thin host (`src/worker.ts`) over the server package, whose API suite runs on the server package and on the nodejs platform, port-free. `pnpm build` type-checks it.

## Miniflare on Linux

Fix: https://github.com/cloudflare/workers-sdk/issues/3262#issuecomment-1552855958

```bash
sudo apt install libc++1
```
