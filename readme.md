<!-- title -->

# astro-media-kit

<!-- /title -->

<!-- badges -->

[![NPM Package astro-media-kit](https://img.shields.io/npm/v/astro-media-kit.svg)](https://npmjs.com/package/astro-media-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kitschpatrol/astro-media-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/astro-media-kit/actions/workflows/ci.yml)

<!-- /badges -->

<!-- short-description -->

**Astro components for images and video.**

<!-- /short-description -->

> [!WARNING]
>
> **This project is under development. It should not be considered suitable for general use until a 1.0 release.**

## Overview

This is a small collection of Astro components to help you write minimalist, platonic markup in your content and templates without compromising robust output.

`<Image>` and `<Picture>` are designed as **clean super-sets** of Astro's built-in components — every prop Astro accepts is accepted here, and the component adds a handful of extras (dark-mode sources, captions, zoom, background compositing) on top. Both local and remote image sources are supported; remote sources skip the features that require access to the source file on disk (XMP credit extraction, background compositing, transparency-aware format selection).

It includes:

- **Image**\
  Superset of Astro's `<Image>` with captions, XMP credit extraction, PhotoSwipe zoom, and background compositing.
- **Picture**\
  Superset of Astro's `<Picture>` with configurable dark mode (OS preference, CSS selector, or disabled), transparency-aware fallback formats, and everything `<Image>` adds.
- **Video**\
  Unified player for YouTube, Vimeo, Bunny, Cloudflare Stream, Mux, local files, and generic oEmbed, plus integration with PhotoSwipe zoom.
- **Audio**\
  Player for SoundCloud, local files, and generic oEmbed.
- **Astro Integration**\
  Auto-import image assets in `.astro` files (no manual `import` statements), plus optional support for tldraw files via [`unplugin-tldraw`](https://github.com/kitschpatrol/unplugin-tldraw). Apple Photos via [`unplugin-aphex`](https://github.com/kitschpatrol/unplugin-aphex), EXIF stripping, original-file cleanup, and a dev-mode image watermark overlay to help debug responsive images.

The components work standalone via direct import, or you can use the Astro integration for streamlined auto-imports and Vite plugin configuration.

This library pairs well with [astro-mdx-kit](https://github.com/kitschpatrol/astro-mdx-kit).

## Getting started

### Prerequisites

An [Astro](https://astro.build/) 6+ project.

### Installation

```bash
pnpm add astro-media-kit
```

### Basic setup

The simplest way to use `astro-media-kit` is as an Astro integration. This enables auto-importing of image assets in your `.astro` files so you can write `src="../assets/photo.jpg"` as a string and have it resolved to an ESM import automatically:

```ts
// Astro.config.ts
import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  image: {
    // Recommended in most cases — sets a sensible default layout and lets
    // Astro emit the responsive CSS that makes `widths` / `sizes` work out of
    // the box. `<Image>` and `<Picture>` inherit these settings via `getImage()`.
    layout: 'constrained',
    responsiveStyles: true,
  },
  integrations: [
    mediaKit({
      // All options are optional — defaults are sensible
      // autoImport: true,       // Enabled by default
      // tldraw: false,          // .tldr file support
      // aphex: false,           // Apple Photos imports
      // removeOriginals: false, // Delete unused original images after build
      // stripExif: false,       // Strip EXIF/XMP metadata from build-output images
      // video: false,           // Env schema injection for video services
      // watermark: false,       // Dev-mode variant label overlay
    }),
  ],
})
```

> [!NOTE]
>
> In most cases you'll want `image.layout: 'constrained'` and `image.responsiveStyles: true` in your Astro config (as shown above).
>
> These are Astro's own image options, not part of `mediaKit()` — `<Image>` and `<Picture>` pick them up automatically via `getImage()`, so responsive `srcset` behaves correctly without per-component overrides.

### Direct component usage

You can also import components directly without the integration. In this case, pass imported `ImageMetadata` objects or remote URLs rather than local string paths:

```astro
---
import { Image, Picture, Video } from 'astro-media-kit/components'
import hero from '../assets/hero.jpg'
---

<Image src={hero} alt="Hero image" />
<Picture src={hero} alt="Hero image" />
<Image src="https://example.com/photo.jpg" alt="A remote image" />
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
```

## Components

### Image

A clean superset of Astro's `<Image>`: every prop Astro accepts is passed through to `getImage()`, and the component adds captions, XMP credit extraction, PhotoSwipe zoom, and CSS/pixel-level background compositing. Accepts `ImageMetadata`, a `{ dark, light }` pair, a local file path string, or a remote `http(s)` URL.

For `{ dark, light }` pairs, `<Image>` uses the light variant only and emits a dev warning — use `<Picture>` for full dark mode support.

```astro
---
import { Image } from 'astro-media-kit/components'
import photo from '../assets/photo.jpg'
---

<Image src={photo} alt="A photo" zoom />
<Image src={photo} alt="With background" background="#f0f0f0" backgroundDark="#1a1a1a" />
<Image src="https://example.com/photo.jpg" alt="Remote" />
```

Caption text is passed as a slot child:

```astro
<Image src={photo} alt="A sunset">A beautiful sunset over the mountains.</Image>
```

#### Image Props

Columns: **Origin** — `astro` marks props inherited from Astro's `LocalImageProps` (passed through unchanged to `getImage()`), `media-kit` marks additions in this library. **Remote** — whether the prop has any effect when `src` is a remote URL.

| Prop                      | Type                                                                     | Default               | Origin      | Remote   |
| ------------------------- | ------------------------------------------------------------------------ | --------------------- | ----------- | -------- |
| `src`                     | `ImageMetadata \| DarkLightImageMetadata \| ImageMetadataLike \| string` | —                     | `media-kit` | yes      |
| `alt`                     | `string`                                                                 | —                     | `astro`     | yes      |
| `width`                   | `number`                                                                 | —                     | `astro`     | yes      |
| `height`                  | `number`                                                                 | —                     | `astro`     | yes      |
| `quality`                 | `number \| 'low' \| 'mid' \| 'high' \| 'max'`                            | Astro's               | `astro`     | yes      |
| `format`                  | `ImageOutputFormat`                                                      | Astro's               | `astro`     | yes      |
| `densities`               | ``readonly (number \| `${number}x`)[]``                                  | —                     | `astro`     | yes      |
| `widths`                  | `readonly number[]`                                                      | —                     | `astro`     | yes      |
| `sizes`                   | `string`                                                                 | —                     | `astro`     | yes      |
| `fit`                     | `'cover' \| 'contain' \| 'fill' \| 'inside' \| 'outside'`                | Astro's               | `astro`     | yes      |
| `position`                | `string`                                                                 | Astro's               | `astro`     | yes      |
| `layout`                  | `'constrained' \| 'fixed' \| 'full-width' \| 'none'`                     | Astro's               | `astro`     | yes      |
| `loading`                 | `'lazy' \| 'eager'`                                                      | `'lazy'`              | `astro`     | yes      |
| `decoding`                | `'auto' \| 'sync' \| 'async'`                                            | `'async'`             | `astro`     | yes      |
| `inferSize`               | `boolean`                                                                | `true` (remote only)¹ | `astro`     | yes      |
| (all `<img>` attrs)       | `HTMLAttributes<'img'>`                                                  | —                     | `astro`     | yes      |
| `className`               | `string`                                                                 | —                     | `media-kit` | yes      |
| `background`              | `string` (CSS color)                                                     | —                     | `media-kit` | **no**   |
| `backgroundDark`          | `string` (CSS color)                                                     | —                     | `media-kit` | **no**   |
| `credit`                  | `boolean \| string`                                                      | `false`               | `media-kit` | partial² |
| `creditMediaType`         | `MediaType`                                                              | —                     | `media-kit` | yes      |
| `creditMediaTypeFallback` | `MediaType`                                                              | `'image'`             | `media-kit` | yes      |
| `creditOrganization`      | `string`                                                                 | —                     | `media-kit` | yes      |
| `zoom`                    | `boolean \| string`                                                      | `false`               | `media-kit` | yes      |
| `zoomLevel`               | `'fill' \| 'fit' \| 'native'`                                            | `'fit'`               | `media-kit` | yes      |
| `zoomScope`               | `string` (CSS selector)                                                  | —                     | `media-kit` | yes      |

¹ For remote sources, `inferSize: true` is applied automatically when neither explicit `width`/`height` nor an explicit `inferSize` is supplied. Local sources derive dimensions from `ImageMetadata`.

² Manual credit strings work for remote sources. XMP extraction requires local file bytes and is skipped for remote URLs.

Remote-source caveats: when `src` is an `http(s)` URL, Astro's `inferSize: true` is set automatically (unless explicitly overridden), and the following are skipped with dev-mode warnings: `background`, `backgroundDark`, transparency-aware fallback-format selection, and mixed local/remote `{ dark, light }` pairs.

### Picture

A clean superset of Astro's `<Picture>`: all of `<Image>`'s props, plus the `formats` / `fallbackFormat` / `pictureAttributes` extras Astro's `<Picture>` adds, plus built-in dark-mode source switching. Renders a `<picture>` with multiple `<source>` elements for format and dark-mode variants.

```astro
---
import { Picture } from 'astro-media-kit/components'
import heroLight from '../assets/hero-light.png'
import heroDark from '../assets/hero-dark.png'
---

<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} alt="No dark variant" srcDark={false} />
<Picture src="https://example.com/hero.png" alt="Remote" />
```

#### Picture Props

All props from [Image](#image) above, plus:

| Prop                | Type                                                      | Default                                 | Origin      | Remote   |
| ------------------- | --------------------------------------------------------- | --------------------------------------- | ----------- | -------- |
| `formats`           | `ImageOutputFormat[]`                                     | `['webp']`                              | `astro`     | yes      |
| `fallbackFormat`    | `ImageOutputFormat`                                       | `'png'` (or input if gif/svg/jpg/jpeg)³ | `astro`     | yes      |
| `pictureAttributes` | `HTMLAttributes<'picture'>`                               | `{}`                                    | `astro`     | yes      |
| `srcDark`           | `ImageMetadata \| ImageMetadataLike \| string \| boolean` | —                                       | `media-kit` | partial⁴ |
| `darkMode`          | `'media' \| 'none' \| string`                             | `'media'`                               | `media-kit` | yes      |

³ Transparency-aware fallback-format selection (keeping gif/svg/jpg/jpeg in-format) only applies to local sources; remote sources fall back to the raw `fallbackFormat` prop or Astro's default.

⁴ `srcDark` works with matching source types. Mixed local/remote dark pairs are ignored with a dev warning — pass either two local `ImageMetadata` objects or two remote URL strings.

When `src` is a `{ dark, light }` pair (e.g. from a tldraw import), the dark variant is used automatically unless `srcDark={false}`.

#### Dark mode strategies

The `darkMode` prop controls how Picture switches between light and dark image variants. It accepts three kinds of values:

**`'media'`** (default) — Uses `prefers-color-scheme` media queries on `<source>` elements. The browser picks the correct variant based on the OS color scheme preference. Background colors use the CSS `light-dark()` function. This is the most performant option: a single `<picture>` element, and the browser handles source selection natively.

```astro
<!-- Default behavior — follows OS dark mode preference -->
<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} srcDark={heroDark} alt="Hero" darkMode="media" />
```

**CSS selector string** — Any string other than `'media'` or `'none'` is treated as a CSS selector that identifies dark mode on the page. This is for frameworks that control dark mode via a class or attribute rather than the OS preference, like Starlight (`[data-theme="dark"]`) or Tailwind CSS (`.dark`).

Renders two `<picture>` elements (one light, one dark) and injects a `<style>` block that toggles visibility based on the selector. The dark variant's images load lazily when the selector activates. Selectors containing `{`, `}`, `<`, `>`, or `;` are rejected to keep the injected stylesheet well-formed.

```astro
<!-- Starlight -->
<Picture src={heroLight} srcDark={heroDark} alt="Hero" darkMode="[data-theme='dark']" />

<!-- Tailwind CSS -->
<Picture src={heroLight} srcDark={heroDark} alt="Hero" darkMode=".dark" />
```

**`'none'`** — Disables all dark mode behavior. No dark image sources are generated, and `backgroundDark` is ignored. Only the light variant is rendered.

```astro
<Picture src={heroLight} alt="Always light" darkMode="none" />
```

### Video

Unified video player supporting multiple services through a single `src` prop. The service is inferred from the URL format, or can be set explicitly.

```astro
---
import { Video } from 'astro-media-kit/components'
---

<!-- YouTube — URL or video ID -->
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
<Video src="dQw4w9WgXcQ" service="youtube" />

<!-- Vimeo -->
<Video src="https://vimeo.com/123456789" />

<!-- Bunny CDN (title search requires explicit service) -->
<Video src="My Video Title" service="bunny" />

<!-- Local file -->
<Video src="/videos/intro.mp4" />

<!-- Minimal controls for background-style video -->
<Video src="dQw4w9WgXcQ" service="youtube" controls="none" autoPlay loop />
```

#### Video Props

| Prop                      | Type                                                                              | Default                     |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| `src`                     | `string`                                                                          | —                           |
| `service`                 | `'bunny' \| 'cloudflare' \| 'local' \| 'mux' \| 'oembed' \| 'vimeo' \| 'youtube'` | inferred from `src`         |
| `controls`                | `'full' \| 'minimal' \| 'lightbox' \| 'native' \| 'none'`                         | `'full'`                    |
| `autoPlay`                | `boolean`                                                                         | `false`                     |
| `muted`                   | `boolean`                                                                         | `true`                      |
| `loop`                    | `boolean`                                                                         | `false`                     |
| `preload`                 | `'auto' \| 'metadata' \| 'none'`                                                  | `'metadata'`                |
| `poster`                  | `string`                                                                          | service-provided            |
| `label`                   | `string`                                                                          | video title, else `'Video'` |
| `capQualityToSize`        | `boolean`                                                                         | `true`                      |
| `initialBandwidth`        | `number`                                                                          | —                           |
| `credit`                  | `boolean \| string`                                                               | `false`                     |
| `creditMediaType`         | `MediaType`                                                                       | —                           |
| `creditMediaTypeFallback` | `MediaType`                                                                       | `'video'`                   |
| `creditOrganization`      | `string`                                                                          | —                           |
| `zoom`                    | `boolean \| string`                                                               | `false`                     |
| `zoomLevel`               | `'fill' \| 'fit' \| 'native'`                                                     | `'fit'`                     |
| `zoomScope`               | `string` (CSS selector)                                                           | —                           |

`service` is required for Bunny title search and for bare IDs not wrapped in a recognizable URL. `capQualityToSize` and `initialBandwidth` only apply to HLS services (Bunny, Cloudflare, Mux). `<Video>` does not extract XMP metadata — `credit`, `creditMediaType`, and `creditOrganization` must be supplied as props.

`controls` selects the player's control bar layout: `'full'` shows the standard set of controls (play, mute, volume, time range, time display, fullscreen, captions when present); `'minimal'` shows only a fullscreen button (suited to background or hero video); `'lightbox'` shows the same buttons as `'full'` minus the fullscreen button (used inside the PhotoSwipe lightbox where fullscreen is provided by the lightbox itself); `'native'` skips media-chrome entirely and uses the underlying element's native controls — the service's iframe chrome for YouTube/Vimeo, the browser's built-in controls for local files and HLS (`zoom` is ignored in this mode); `'none'` renders the player without any controls and marks it inert.

URL formats recognized automatically:

| Service | Formats                                                                  |
| ------- | ------------------------------------------------------------------------ |
| YouTube | `youtube.com/watch`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, `/v/` |
| Vimeo   | `vimeo.com/`, `player.vimeo.com/video/`                                  |
| Local   | Direct file URLs (detected by extension)                                 |
| oEmbed  | Any other URL (falls back to oEmbed discovery)                           |

Bunny, Cloudflare, and Mux use HLS streaming via `media-chrome` and `hls-video-element`. YouTube and Vimeo use their respective web component elements (`youtube-video-element`, `vimeo-video-element`).

### Audio

Audio player supporting SoundCloud, local files, and oEmbed.

```astro
---
import { Audio } from 'astro-media-kit/components'
---

<Audio src="https://soundcloud.com/artist/track" />
<Audio src="/audio/podcast.mp3" />
```

#### Audio Props

| Prop                      | Type                                  | Default      |
| ------------------------- | ------------------------------------- | ------------ |
| `src`                     | `string`                              | —            |
| `service`                 | `'local' \| 'oembed' \| 'soundcloud'` | inferred     |
| `autoPlay`                | `boolean`                             | `false`      |
| `muted`                   | `boolean`                             | `false`      |
| `loop`                    | `boolean`                             | `false`      |
| `preload`                 | `'auto' \| 'metadata' \| 'none'`      | `'metadata'` |
| `label`                   | `string`                              | `'Audio'`    |
| `credit`                  | `boolean \| string`                   | `false`      |
| `creditMediaType`         | `MediaType`                           | —            |
| `creditMediaTypeFallback` | `MediaType`                           | `'audio'`    |
| `creditOrganization`      | `string`                              | —            |

### Supporting components

**Caption** wraps content in `<figure>`/`<figcaption>` and handles XMP credit extraction from image metadata via `exiftool-vendored`. Used internally by Image, Picture, Video, and Audio — you generally don't need to use it directly.

**Zoomer** provides PhotoSwipe-based lightbox/zoom functionality. Also used internally — enable it via the `zoom` prop on any of the main components.

### Scoped galleries

By default, all components sharing the same `zoom` gallery name form a single gallery, regardless of where they appear in the DOM. The `zoomScope` prop limits this by setting a CSS selector boundary — items under separate ancestors matching the selector become separate galleries, even if they share the same gallery name.

This is useful for reusable components (e.g. cards, sections) where you want each instance to have its own gallery without manually assigning unique names:

```astro
---
import { Picture } from 'astro-media-kit/components'
---

<!-- Each <article> gets its own gallery automatically -->
<article>
  <Picture src={a} alt="A" zoom="gallery" zoomScope="article" />
  <Picture src={b} alt="B" zoom="gallery" zoomScope="article" />
</article>

<article>
  <Picture src={c} alt="C" zoom="gallery" zoomScope="article" />
  <Picture src={d} alt="D" zoom="gallery" zoomScope="article" />
</article>
```

When `zoom={true}` (no gallery name) is combined with `zoomScope`, items under the same matching ancestor are grouped together instead of opening as standalone lightboxes:

```astro
<!-- These two form a gallery because they share the same .hero ancestor -->
<section class="hero">
  <Picture src={a} alt="A" zoom zoomScope=".hero" />
  <Picture src={b} alt="B" zoom zoomScope=".hero" />
</section>
```

If the selector matches no ancestor, the element falls back to standalone behavior and a warning is logged. If `zoom` is `false`, `zoomScope` is ignored.

### Credit metadata

`<Image>` and `<Picture>` automatically extract credit information from embedded XMP metadata via [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) when `credit` is enabled. The following XMP tags are read:

| XMP tag   | Maps to prop           | Description                                        |
| --------- | ---------------------- | -------------------------------------------------- |
| `Creator` | `credit` (string form) | Attribution name (photographer, illustrator, etc.) |
| `Credit`  | `creditOrganization`   | Publication or organization alongside the creator  |
| `Label`   | `creditMediaType`      | Semantic media type (see values below)             |

The `Label` tag maps to the `MediaType` union: `'animation'`, `'audio'`, `'diagram'`, `'illustration'`, `'image'`, `'photo'`, `'render'`, `'screenshot'`, or `'video'`.

The `credit` prop collapses the "show the credit line" toggle and the creator-name override into a single value:

- `credit={false}` (default) — no credit line
- `credit={true}` — render the credit line using XMP-extracted or explicit values
- `credit="Jane Doe"` — render the credit line with `"Jane Doe"` as the creator name (overrides XMP `Creator`)

When present, these are rendered as a credit line in the `<figcaption>` — for example, "Photo: Jane Doe / Acme Corp". Explicit props override XMP values.

If the `Label` tag is missing or extraction is not applicable, `creditMediaTypeFallback` is used (defaults to `'image'` for Image/Picture, `'video'` for Video, `'audio'` for Audio).

XMP extraction only runs on local image sources. `<Video>` and `<Audio>` don't read XMP — they accept `credit`, `creditOrganization`, and `creditMediaType` as manual props only. Remote `<Image>` / `<Picture>` sources also skip XMP extraction (manual values still work).

## Video services

Services that require API credentials use Astro's `astro:env/server` for secret access. Set the corresponding environment variables, and optionally use the integration's `video` option to have Astro validate them at build time.

| Service    | Environment variables                                         |
| ---------- | ------------------------------------------------------------- |
| Bunny      | `BUNNY_API_ACCESS_KEY`, `BUNNY_HOSTNAME`, `BUNNY_LIBRARY_ID`  |
| Cloudflare | `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` |
| Mux        | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`                            |

YouTube, Vimeo, local, and oEmbed do not require credentials.

To inject env schema validation:

```ts
mediaKit({
  video: ['bunny', 'mux'], // Or 'bunny', or true for all
})
```

## Integration

The `mediaKit()` integration registers Vite plugins in `astro:config:setup`. All options are optional.

### Auto-import

Enabled by default. Parses `.astro` files at build time and replaces string `src` attribute values on configured components with ESM import expressions, so Astro's image pipeline can process them.

```ts
// Default behavior — Image and Picture src props are auto-imported
mediaKit()

// Custom configuration
mediaKit({
  autoImport: {
    components: {
      Image: 'src',
      MyImage: 'src',
      Picture: ['src', tldrawDarkImport],
    },
  },
})
```

Without auto-import, you must import images manually:

```astro
---
import { Image } from 'astro-media-kit/components'
import photo from '../assets/photo.jpg'
---

<Image src={photo} alt="Photo" />
```

With auto-import enabled:

```astro
---
import { Image } from 'astro-media-kit/components'
---

<Image src="../assets/photo.jpg" alt="Photo" />
```

### Tldraw

Enable `.tldr` file support via [`unplugin-tldraw`](https://github.com/kitschpatrol/unplugin-tldraw), which wraps [`tldraw-cli`](https://github.com/kitschpatrol/tldraw-cli). Tldraw files are converted to SVG/PNG at build time and fed into Astro's image pipeline.

```ts
import mediaKit, { tldrawDarkImport } from 'astro-media-kit'

mediaKit({
  autoImport: {
    components: {
      Image: 'src',
      // Generate both light and dark variants for .tldr files
      Picture: ['src', tldrawDarkImport],
    },
  },
  tldraw: true,
})
```

The `tldrawDarkImport` helper generates a `srcDark` prop with `?dark=true&tldr` for `.tldr` files, which Picture picks up automatically for dark mode support.

### Aphex

Enable Apple Photos `~aphex/` import support via [`unplugin-aphex`](https://github.com/kitschpatrol/unplugin-aphex), which wraps [`aphex`](https://github.com/kitschpatrol/aphex). Photos exported from macOS Photos.app can be referenced by album and title:

```ts
mediaKit({
  aphex: true,
})
```

```astro
<Image src="~aphex/Vacation/Beach Sunset" alt="Beach sunset" />
```

### Remove originals

Astro's image pipeline leaves the full-size source files in the assets directory even when every reference on the site uses a transformed variant. Enable `removeOriginals` to delete them after the build completes:

```ts
mediaKit({
  removeOriginals: true,
})
```

Originals match the shape `{base}.{HASH8}.{ext}` — the 8-character hash Astro appends before the extension (e.g. `photo.Ab1Cd2Ef.jpg`). Transformed variants use an `_` separator after the hash (`photo.Ab1Cd2Ef_W800.webp`) and are left alone. An original is only removed when at least one transformed sibling exists, so unused `public/` images are preserved. Inspired by [this Astro issue](https://github.com/withastro/astro/issues/4961).

### Strip EXIF

Source images often carry EXIF/XMP metadata — GPS coordinates, camera serial numbers, creator fields — that shouldn't end up on the public site. Enable `stripExif` to remove all metadata tags from every image in the build output after the build completes:

```ts
mediaKit({
  stripExif: true,
})
```

This walks the build output directory recursively and strips metadata from `jpg`, `jpeg`, `png`, `webp`, `tif`, `tiff`, `avif`, `heic`, and `gif` files — covering both Astro-processed assets and pass-through copies from `public/`. Source images under `src/` and `public/` on disk are left untouched. Stripping is performed by [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js).

### Watermark (dev)

Stamps every responsive image variant with its pixel dimensions and encoded byte size as a tiled text overlay, so you can visually confirm which srcset candidate the browser actually loaded. Intended for dev use — a warning is logged if enabled outside `astro dev`.

```ts
mediaKit({
  watermark: true,
  // Or fine-tune
  // watermark: { angle: -30, minDimension: 96, opacity: 0.6 },
})
```

| Option         | Type      | Default | Description                                                                 |
| -------------- | --------- | ------- | --------------------------------------------------------------------------- |
| `enabled`      | `boolean` | `true`  | Object-form-only toggle. Set to `false` to disable without removing tuning. |
| `angle`        | `number`  | `-30`   | Counter-clockwise tilt in degrees                                           |
| `minDimension` | `number`  | `96`    | Skip variants smaller than this on either axis                              |
| `opacity`      | `number`  | `0.8`   | Label fill/stroke opacity (0–1)                                             |

The stamped byte count is the pre-watermark size — the variant's weight without the overlay. Registers a custom local image service that wraps Astro's built-in sharp service; when disabled (the default), the image pipeline is left entirely untouched.

### Video env schema

See the [Video services](#video-services) section above.

## Utilities

Exported from `astro-media-kit`:

- **`resolveImageSource(src, srcDark?)`** — Resolve a string path or `ImageMetadata` (optionally plus a dark counterpart) to a usable `ImageMetadata` or `DarkLightImageMetadata` object. Enforces format/width/height parity between light and dark.
- **`probeImageMetadata(filePath)`** — Read a local image file and return its `ImageMetadata` (dimensions, format) using Astro's `imageMetadata` utility. Local files only.
- **`isImageMetadataObject(src)`** — Type guard that checks whether a value is an `ImageMetadata` object (including Astro's SVG-component wrapper form).
- **`transformAstroSource(source, options)`** — Auto-import transform used by the integration. Exported for custom tooling.
- **`tldrawDarkImport`** — An `AutoImportEntry` that generates a `srcDark` import for `.tldr` files.

## Types

Exported from `astro-media-kit`:

- **`DarkLightImageMetadata`** — `{ dark: ImageMetadata; light: ImageMetadata }`
- **`ImageMetadataLike`** — `ImageMetadata` with `format` relaxed to `string` for plugin compatibility.
- **`MediaType`** — `'animation' | 'audio' | 'diagram' | 'illustration' | 'image' | 'photo' | 'render' | 'screenshot' | 'video'`
- **`Service`** — `'bunny' | 'cloudflare' | 'local' | 'mux' | 'oembed' | 'vimeo' | 'youtube'`
- **`ServiceConfig`** — Maps each video service name to its configuration type.
- **`VideoInfo`** — Normalized video metadata (dimensions, duration, URLs, captions).
- **`MediaKitConfig`** — Options accepted by the `mediaKit()` integration function.
- **`AphexConfig`**, **`TldrawConfig`**, **`TldrawImageOptions`**, **`WatermarkConfig`** — Config shapes for the corresponding integration features.
- **`AutoImportConfig`**, **`AutoImportEntry`**, **`AutoImportPluginConfig`** — Types for the auto-import feature's component mapping.

Component prop types are exported from `astro-media-kit/components`: **`AudioProps`**, **`CaptionProps`**, **`ImageProps`**, **`PictureProps`**, **`VideoProps`**.

## Development notes

The [Astro Prettier plugin](https://github.com/withastro/prettier-plugin-astro) has issues parsing nested script tags in Astro templates, see [#452](https://github.com/withastro/prettier-plugin-astro/issues/452) and [#454](https://github.com/withastro/prettier-plugin-astro/issues/454).

This means that the `Zoomer.astro` and `VideoPlayer.astro` crash Prettier and cannot be automatically formatted.

I have released [a fork of the Astro Prettier plugin](https://github.com/kitschpatrol/prettier-plugin-astro/tree/fix-nested-script-tags) incorporating fixes for these issues.

This project is also interesting: [Alos-no/Astro-Smart-Media](https://github.com/Alos-no/Astro-Smart-Media)

## Maintainers

[kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

Video playback is built on [media-chrome](https://github.com/muxinc/media-chrome), [hls-video-element](https://github.com/muxinc/media-elements/tree/main/packages/hls-video-element), [youtube-video-element](https://github.com/muxinc/media-elements/tree/main/packages/youtube-video-element), and [vimeo-video-element](https://github.com/muxinc/media-elements/tree/main/packages/vimeo-video-element). Image zoom uses [PhotoSwipe](https://photoswipe.com/). XMP credit extraction relies on [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) and its underlying [exiftool](https://exiftool.org/) project.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/astro-media-kit/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs (especially AI-generated ones) are unlikely to be merged.

This repository uses [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config) (via its `ksc` CLI) for linting and formatting, plus [MDAT](https://github.com/kitschpatrol/mdat) for readme placeholder expansion.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © [Eric Mika](https://ericmika.com)

<!-- /license -->
