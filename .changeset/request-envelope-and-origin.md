---
'push-notification-service-server': minor
'push-notification-service-server-cf-worker': minor
---

`POST /register`'s `SIGNATURE` is missiv-identity's request envelope (`<timestamp>:<compact hex>:<recovery bit>`, over this server's origin, `POST /api/register`, the timestamp and the body), refused (401) a minute either side; a request signed for another server or route is refused (403). `domain` may be an origin (`http://192.168.1.10:5173`), and subscriptions, tokens and deliveries are keyed by the origin a domain names. New env `PUBLIC_ORIGIN`, the origin request signatures name (default: the request URL's).
