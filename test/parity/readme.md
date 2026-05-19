# Parity tests

These tests verify that `astro-media-kit`'s `Image` and `Picture` components remain a behavioral superset of Astro's built-in `Image` / `Picture` when only Astro-standard props are passed. Two layers run against the same fixture build:

1. **Ported assertions** (`core-image.test.ts`) — invariants ported from Astro's own test suite at a pinned tag. Each test file's header records the `Ported from:` URL.
2. **Direct diff** (`core-image-diff.test.ts`) — each fixture page renders both our component and the equivalent `astro:assets` built-in with identical props (marked `id="local"` vs `id="astro"`). The diff helper asserts the emitted attributes match exactly, modulo a documented allowlist.

## Scope

- **In scope:** invariants Astro's own tests assert against `Image` / `Picture` — `_image` endpoint URL shape, `srcset` format, attribute propagation, format inference, `<picture>` / `<source>` structure — plus direct equality with Astro's built-in output on those shared props.
- **Out of scope:** media-kit extensions (`caption*`, `zoom*`, `darkMode`, `background*`, `srcDark`, `fallbackFormat` object form). Those are covered by the unit tests under `test/*.test.ts`. Fixture pages that exercise media-kit-only prop shapes (e.g. `picture-formats-rules-jpg.astro`, `picture-formats-rules-svg.astro`) have no `astro:assets` counterpart and are not part of the diff layer.

## Diff allowlist

The diff helpers (`helpers/compare-img.ts`) ignore attributes media-kit adds intentionally:

- `class="amk"` — public marker class added by `src/components/Image.astro` and `src/components/Picture.astro` for downstream CSS hooks.
- `data-image-component="true"` — DEV-only marker added by `src/components/Image.astro`. Should not appear in prod-built fixtures; allowlisted anyway as a guardrail.

If the diff trips on anything else, that's a real divergence. Either fix the component or, if the divergence is intentional, add to the allowlist with a comment pointing at the source.

## How it works

Each test file owns a fixture under `fixtures/<name>/` — a minimal Astro project with `.astro` pages that import `{ Image, Picture } from 'astro-media-kit/components'` and (for diff cases) `{ Image as AstroImage, Picture as AstroPicture } from 'astro:assets'`. The `buildFixture` helper runs `astro build` once per process and caches the result; tests then read generated `dist/**/*.html` and assert via cheerio.

The fixture resolves the workspace package via pnpm — `test/parity/fixtures/*` is registered in `pnpm-workspace.yaml`. If a fresh checkout doesn't resolve `astro-media-kit` inside a fixture, re-run `pnpm install` from the repo root.

## Updating when bumping Astro

1. Bump the `astro` peer/dev dep in the root `package.json`.
2. For each parity test file, open the upstream Astro file linked in the header at the pinned tag and diff it against the new Astro tag.
3. Port any added/changed Astro-standard assertions; remove any that no longer apply.
4. Update the `Upstream Astro pinned:` line in the test file header.

## Assertion style

Mirror upstream Astro's style — assert structural properties (`startsWith('/_image?')`, `match(/[?&]q=50/)`, `contains('penguin1')`), never exact full-URL strings. The `_image` endpoint serialization can change between minor versions.
