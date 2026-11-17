---
'@push-notification/server': patch
'@push-notification/cli': patch
'@push-notification/cf-worker': patch
---

The server packages declare AGPL-3.0-only, as the repo is licensed (they said MIT). New env `VAPID_SUBJECT`, the contact given to push services (default `mailto:notifications@etherplay.io`, which was hard-coded).
