---
'push-notification-service-server': minor
'push-notification-service-server-cf-worker': minor
---

`POST /unregister {address, domain, endpoint, ownershipSignature}`, signed as `/register` is: removes that account's subscription for the endpoint (the same browser registered for another account keeps its), answering `{success, unregistered}`.
