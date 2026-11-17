# @push-notification/cli

## 0.1.0

### Minor Changes

- 6f65fd0: A Node.js platform on libSQL: `@push-notification/cli` (a CLI serving on `PORT`, its database `DB` a libSQL URL, its tables created at start) and `createNodeServer` for an app in process. @push-notification/server's `build` now compiles its TypeScript, which its package exports always named.
- 31d637b: The packages move under the `@push-notification` scope: `@push-notification/server` (was push-notification-service-server), `@push-notification/cli` (was push-notification-service-server-nodejs; its command is `push-notification-server`), `@push-notification/cf-worker` and `@push-notification/client` (was push-notification-subscription-client).

### Patch Changes

- 2e5e51d: The server packages declare AGPL-3.0-only, as the repo is licensed (they said MIT). New env `VAPID_SUBJECT`, the contact given to push services (default `mailto:notifications@etherplay.io`, which was hard-coded).
- Updated dependencies [991de87]
- Updated dependencies [7c0bbb6]
- Updated dependencies [2e5e51d]
- Updated dependencies [6f65fd0]
- Updated dependencies [1f84d06]
- Updated dependencies [31d637b]
- Updated dependencies [34eaa98]
  - @push-notification/server@0.1.0
