---
title: "The root's deploy:cf script filters a package that does not exist"
slug: deploy-cf-script-names-no-package
date: 2026-11-17
---

`pnpm deploy:cf` runs `pnpm run --filter push-notification-cf-worker deploy`, but the cf-worker package is named `push-notification-service-server-cf-worker` and has no `deploy` script (it has `deploy:production`). So the root script does nothing. Its `init-db` also executes only `db.sql` from the installed server package, which is how a deployed D1 gains the `Deliveries` table S1 added (run it once after upgrading).
