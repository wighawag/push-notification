---
'@push-notification/cf-worker': patch
---

The worker is type-checked by `build`; its workerd test, which could not load, is gone; its README says how to configure the secrets and that `init-db` after an upgrade adds new tables (the `Deliveries` table of 0.1.0). The root `deploy:cf` runs its `deploy:production`.
