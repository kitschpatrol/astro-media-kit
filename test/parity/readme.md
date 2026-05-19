# Parity tests

These tests verify that `astro-media-kit`'s `Image` and `Picture` components remain a behavioral superset of Astro's built-in `Image` / `Picture` when only Astro-standard props are passed. Each test file is ported from a specific revision of Astro's own test suite — see the pinned `Ported from:` URL at the top of each test file.

## Scope

- **In scope:** invariants Astro's own tests assert against `Image` / `Picture` — `_image` endpoint URL shape, `srcset` format, attribute propagation, format inference, `<picture>` / `<source>` structure.
- **Out of scope:** media-kit extensions (`caption*`, `zoom*`, `darkMode`, `background*`, `srcDark`, `fallbackFormat` object form). Those are covered by the unit tests under `test/*.test.ts`.

## How it works

Each test file owns a fixture under `fixtures/<name>/` — a minimal Astro project with `.astro` pages that import `{ Image, Picture } from 'astro-media-kit/components'`. The `buildFixture` helper runs `astro build` once per process and caches the result; tests then read generated `dist/**/*.html` and assert via cheerio.

The fixture resolves the workspace package via pnpm — `test/parity/fixtures/*` is registered in `pnpm-workspace.yaml`. If a fresh checkout doesn't resolve `astro-media-kit` inside a fixture, re-run `pnpm install` from the repo root.

## Updating when bumping Astro

1. Bump the `astro` peer/dev dep in the root `package.json`.
2. For each parity test file, open the upstream Astro file linked in the header at the pinned tag and diff it against the new Astro tag.
3. Port any added/changed Astro-standard assertions; remove any that no longer apply.
4. Update the `Upstream Astro pinned:` line in the test file header.

## Assertion style

Mirror upstream Astro's style — assert structural properties (`startsWith('/_image?')`, `match(/[?&]q=50/)`, `contains('penguin1')`), never exact full-URL strings. The `_image` endpoint serialization can change between minor versions.
