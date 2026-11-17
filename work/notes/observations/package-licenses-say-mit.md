---
title: 'The packages declare MIT while the repo is licensed AGPL-3.0'
slug: package-licenses-say-mit
date: 2026-11-17
---

`LICENSE` at the root is the GNU AGPL v3, but `packages/server/package.json` and `packages/subscription-client/package.json` declare `"license": "MIT"` (the platforms and the example declare none). The server now depends on missiv-identity, which is `AGPL-3.0-only`. Which license the published packages carry is the owner's decision; until then npm shows MIT.
