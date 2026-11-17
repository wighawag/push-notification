---
'push-notification-service-server': patch
'push-notification-service-server-nodejs': patch
'push-notification-service-server-cf-worker': patch
---

The server packages declare AGPL-3.0-only, as the repo is licensed (they said MIT). New env `VAPID_SUBJECT`, the contact given to push services (default `mailto:notifications@etherplay.io`, which was hard-coded).
