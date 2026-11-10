<!-- title -->

# astro-media-kit

<!-- /title -->

<!-- badges -->

[![NPM Package astro-media-kit](https://img.shields.io/npm/v/astro-media-kit.svg)](https://www.npmjs.com/package/astro-media-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit)
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

`<Image>` and `<Picture>` are designed as **clean super-sets** of Astro's built-in components: Astro's props remain supported, including numeric string dimensions, import promises, inline styles, and public or remote image URLs. The kit adds dark-mode sources, captions, zoom, background styling, and per-input-format rules. XMP credit extraction requires a local source.

It includes:

- **Image**\
  Superset of Astro's `<Image>` with captions, XMP credit extraction, lightbox zoom, background styling, and a per-input-format `format` override.
- **Picture**\
  Superset of Astro's `<Picture>` with configurable dark mode (OS preference, CSS selector, or disabled), per-input-format `formats` and `fallbackFormat` overrides, and everything `<Image>` adds.
- **Video**\
  Unified player for YouTube, Vimeo, Bunny, Cloudflare Stream, Mux, local files, and generic oEmbed, plus lightbox zoom.
- **Audio**\
  Player for SoundCloud, local files, and generic oEmbed.
- **MediaTheme**\
  Optional shared icon overrides for video, local audio, carousels, and the lightbox.
- **Carousel**\
  Embedded carousel with buttons, swiping, optional dots and captions, and lightbox galleries when its media children have `zoom` enabled.
- **ZoomLink**\
  Text link that opens an image or a video in the lightbox, and goes to the file itself without JavaScript.
- **Astro Integration**\
  Auto-import image assets in `.astro` files (no manual `import` statements), plus optional support for tldraw files via [`unplugin-tldraw`](https://github.com/kitschpatrol/unplugin-tldraw). Apple Photos via [`unplugin-aphex`](https://github.com/kitschpatrol/unplugin-aphex), EXIF stripping, original-file cleanup, and a dev-mode image watermark overlay to help debug responsive images.

The components work standalone via direct import, or you can use the Astro integration for streamlined auto-imports and automatic Vite plugin configuration.

This library pairs well with [astro-mdx-kit](https://github.com/kitschpatrol/astro-mdx-kit).

## Getting started

<!-- dependencies({ heading: 'Prerequisites' }) -->

### Prerequisites

- [Node.js](https://nodejs.org/) 24.16.0 or newer (specifically `^24.16.0 || >=26.3.0`)
- [astro](https://www.npmjs.com/package/astro) `^7.4.7` _(peer dependency)_

<!-- /dependencies -->

### Installation

```bash
pnpm add astro-media-kit
```

### Basic setup

The simplest way to use `astro-media-kit` is as an Astro integration. This enables auto-importing of image assets in your `.astro` files so you can write `src="../assets/photo.jpg"` as a string and have it resolved to an ESM import automatically:

```ts
// File: astro.config.ts
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
      // removeOriginals: false, // Delete originals Astro leaves after build
      // stripExif: false,       // Strip EXIF/XMP metadata from build-output images
      // video: false,           // Secret env schema for video services
      // watermark: false,       // Dev-mode variant label overlay
    }),
  ],
})
```

> [!NOTE]
>
> In most cases you'll want `image.layout: 'constrained'` and `image.responsiveStyles: true` in your Astro config (as shown above).
>
> These are Astro's own image options, not part of `mediaKit()` — `<Image>` and `<Picture>` pick them up automatically via their internal calls to `getImage()`, so a responsive `srcset` behaves correctly without per-component overrides.

### Direct component usage

You can also import components directly without the integration. Pass imported `ImageMetadata` objects, import promises, or public/remote URLs with sizing information:

```astro
---
import { Image, Picture, Video } from 'astro-media-kit/components'
import hero from '../assets/hero.jpg'
---

<Image src={hero} alt="Hero image" />
<Picture src={hero} alt="Hero image" />
<Image src="https://example.com/photo.jpg" width={1200} height={800} alt="A remote image" />
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
```

## Components

### Image

A clean superset of Astro's `<Image>`: Astro's image props pass through to `getImage()`, and the component adds captions, XMP credit extraction, lightbox zoom, and background styling.

Accepts Astro's imported `ImageMetadata`, import promises, public image URLs such as `/images/photo.jpg`, and remote `http(s)` URLs. Also accepts `ImageMetadataLike` and a `{ dark, light }` pair. Any other string is a path on disk, which only the integration's auto-import transform turns into an import; otherwise import the image yourself.

The `{ dark, light }` pair is permitted for symmetry with the `<Picture>` component, but note that `<Image>` uses the light variant _only_ and emits a dev warning if `dark` is defined. Use `<Picture>` instead for full dark mode support.

```astro
---
import { Image } from 'astro-media-kit/components'
import photo from '../assets/photo.jpg'
---

<Image src={photo} alt="A photo" zoom />
<Image src={photo} alt="With background" background="#f0f0f0" backgroundDark="#1a1a1a" />
<Image src="https://example.com/photo.jpg" width={1200} height={800} alt="Remote" />
```

Caption text is passed as a slot child:

```astro
<Image src={photo} alt="A sunset">
  A beautiful sunset over the mountains.
</Image>
```

#### Image Props

Columns: **Origin** — `astro` marks props inherited from Astro's `LocalImageProps`, with differences noted; `media-kit` marks additions in this library. **Remote** — whether the prop has any effect when `src` is a remote URL. Image transformation props depend on the configured image service and remote-image authorization.

| Prop                      | Type                                                                                                            | Default                              | Origin             | Remote   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------ | -------- |
| `src`                     | `ImageMetadata \| Promise<{ default: ImageMetadata }> \| DarkLightImageMetadata \| ImageMetadataLike \| string` | —                                    | `astro` (widened)  | yes      |
| `alt`                     | `string`                                                                                                        | —                                    | `astro`            | yes      |
| `width`                   | number or numeric string                                                                                        | —                                    | `astro`            | yes      |
| `height`                  | number or numeric string                                                                                        | —                                    | `astro`            | yes      |
| `quality`                 | `ImageQuality` (number, presets, or service-specific strings)                                                   | —                                    | `astro`            | yes      |
| `format`                  | `ImageOutputFormat \| FormatRules`                                                                              | local: `'webp'` (`svg → svg`)        | `astro` (widened)  | yes      |
| `densities`               | ``(number \| `${number}x`)[]``                                                                                  | —                                    | `astro`            | yes      |
| `widths`                  | `number[]`                                                                                                      | —                                    | `astro`            | yes      |
| `sizes`                   | `string`                                                                                                        | —                                    | `astro`            | yes      |
| `fit`                     | `ImageFit` (`'cover'`, `'contain'`, `'fill'`, `'none'`, `'scale-down'`, or service-specific strings)            | `'cover'`                            | `astro`            | yes      |
| `position`                | `string`                                                                                                        | `'center'`                           | `astro`            | yes      |
| `layout`                  | `'constrained' \| 'fixed' \| 'full-width' \| 'none'`                                                            | `'none'`                             | `astro`            | yes      |
| `loading`                 | `'lazy' \| 'eager'`                                                                                             | `'lazy'`                             | `astro`            | yes      |
| `decoding`                | `'auto' \| 'sync' \| 'async'`                                                                                   | `'async'`                            | `astro`            | yes      |
| `priority`                | `boolean`                                                                                                       | `false`                              | `astro`            | yes      |
| `inferSize`               | `boolean`                                                                                                       | `false`                              | `astro`            | yes      |
| (other `<img>` attrs)     | `HTMLAttributes<'img'>`                                                                                         | —                                    | `astro`            | yes      |
| `className`               | `string`                                                                                                        | —                                    | `media-kit`        | yes      |
| `background`              | `string` (CSS color)                                                                                            | —                                    | `astro` (extended) | yes      |
| `backgroundDark`          | `string` (CSS color)                                                                                            | —                                    | `media-kit`        | yes      |
| `credit`                  | `boolean \| string`                                                                                             | `false`                              | `media-kit`        | partial¹ |
| `creditMediaType`         | `MediaType`                                                                                                     | —                                    | `media-kit`        | yes      |
| `creditMediaTypeFallback` | `MediaType`                                                                                                     | `'image'`                            | `media-kit`        | yes      |
| `creditOrganization`      | `string`                                                                                                        | —                                    | `media-kit`        | yes      |
| `zoom`                    | `boolean \| string`                                                                                             | `false`                              | `media-kit`        | yes      |
| `zoomIndicator`           | `boolean`                                                                                                       | `false` (a supplied slot enables it) | `media-kit`        | yes      |
| `zoomLevel`               | `'fill' \| 'fit' \| 'native'`                                                                                   | `'fit'`                              | `media-kit`        | yes      |
| `zoomPlaceholder`         | `'auto' \| 'none'`                                                                                              | `'auto'`                             | `media-kit`        | yes      |
| `zoomScope`               | `string` (CSS selector)                                                                                         | —                                    | `media-kit`        | yes      |

¹ Manual credit strings work for remote sources. XMP extraction requires local file bytes and is skipped for remote URLs.

URL sources use the `unknown` entry when resolving Image's `format` rules. Without a forced format or an `unknown` override, Astro's image service chooses the remote default.

`layout` falls back to `image.layout` from `astro.config` first; the listed `'none'` is the un-configured baseline. `fit` and `position` defaults only apply when a responsive `layout` is active — under `layout='none'` they're left unset unless `image.objectFit` / `image.objectPosition` are configured globally. `quality` is resolved by the configured image service. `priority` defaults `loading` to `'eager'`, `decoding` to `'sync'`, and `fetchpriority` to `'high'` unless you explicitly set those attributes. Use either `widths` or `densities`; responsive layouts use width descriptors and discard `densities`.

Remote-source caveats: when `src` is an `http(s)` URL, you must pass either `width` + `height` or `inferSize` — `getImage()` throws otherwise. A dev-mode warning fires up front if neither sizing strategy is supplied. With Astro's default image service, authorize remote images through `image.domains` or `image.remotePatterns` to optimize them; `inferSize` also requires authorization. Unauthorized sources with explicit dimensions are passed through. Public image URLs also need explicit dimensions. The kit preserves inline styles, adding its background declarations when requested. `class` takes precedence over the MDX-compatible `className` alias.

`background` retains Astro's pixel compositing and also adds a CSS background. When `backgroundDark` is supplied, transparent output formats retain their transparency so CSS can switch the background; JPEG output uses pixel compositing. Image's single JPEG output cannot switch its baked-in background with dark mode; use Picture when you need separate composited variants.

### Picture

Renders a `<picture>` through Astro's image pipeline, with `<source>` elements for format and dark-mode variants. Shares Image's sizing, caption, zoom, and background props; use `formats` and `fallbackFormat` instead of Image's `format` prop.

```astro
---
import { Picture } from 'astro-media-kit/components'
import heroLight from '../assets/hero-light.png'
import heroDark from '../assets/hero-dark.png'
---

<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} alt="No dark variant" srcDark={false} />
<Picture src="https://example.com/hero.png" width={1200} height={800} alt="Remote" />
```

#### Picture Props

Shared props from [Image](#image) above, with these Picture-specific props:

| Prop                | Type                                                      | Default          | Origin            | Remote   |
| ------------------- | --------------------------------------------------------- | ---------------- | ----------------- | -------- |
| `formats`           | `ImageOutputFormat[] \| FormatsRules`                     | `['webp']`       | `astro` (widened) | yes      |
| `fallbackFormat`    | `ImageOutputFormat \| FormatRules`                        | per-input format | `astro` (widened) | yes      |
| `pictureAttributes` | `HTMLAttributes<'picture'>`                               | `{}`             | `astro`           | yes      |
| `srcDark`           | `ImageMetadata \| ImageMetadataLike \| string \| boolean` | —                | `media-kit`       | partial² |
| `darkMode`          | `'media' \| 'none' \| string`                             | `'media'`        | `media-kit`       | yes      |

² Use local metadata for both variants, or URL strings for both `src` and `srcDark`. With a URL `src`, a local `srcDark` is ignored with a dev warning. A URL `srcDark` with a local `src` is unsupported. A `{ dark, light }` pair contains local metadata, not URL strings. Relative `srcDark` strings need their own auto-import entry or an explicit import; the default integration only imports `src`.

`fallbackFormat` defaults to the input format for GIF, SVG, JPG, and JPEG, and PNG otherwise. URL sources use the `unknown` entry when resolving Picture's `formats` and `fallbackFormat` rules, regardless of their URL extension.

When `src` is a `{ dark, light }` pair, the dark variant is used automatically unless `srcDark={false}` or `darkMode="none"`.

#### Dark mode strategies

The `darkMode` prop controls how Picture switches between light and dark image variants. It accepts three kinds of values:

**`'media'`** (default) — Uses `prefers-color-scheme` media queries on `<source>` elements. The browser picks the variant based on the browser/OS color scheme preference. Background colors use the CSS `light-dark()` function. Uses a single `<picture>` element, with native browser source selection.

```astro
<!-- Default behavior — follows OS dark mode preference -->
<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} srcDark={heroDark} alt="Hero" darkMode="media" />
```

**CSS selector string** — Any string other than `'media'` or `'none'` is treated as a CSS selector that identifies dark mode on the page. This is for frameworks that control dark mode via a class or attribute rather than the OS preference, like Starlight (`[data-theme="dark"]`) or Tailwind CSS (`.dark`).

When a dark variant exists, renders two `<picture>` elements (one light, one dark) inside a `<div>` receiving `pictureAttributes`, and injects a `<style>` block that toggles visibility based on the selector. Loading follows the `loading` / `priority` props and the browser's lazy-loading behavior; selector mode alone does not guarantee that the hidden image stays unloaded. Without a dark variant, renders one `<picture>`. Selectors containing `{`, `}`, `<`, `>`, or `;` are rejected to keep the injected stylesheet well-formed. Zoomed pictures continue following changes to their original theme container; returning restores normal CSS visibility.

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

### Image zoom indicators

`Image` and `Picture` can display a decorative corner indicator when zoom is enabled. Add `zoomIndicator` to show the built-in indicator, which matches the video player's expand button: the same artwork, size, and colors, flush with the bottom-right corner of the image. Supply a `zoom-indicator` slot for custom artwork:

```astro
<Image src={photo} alt="Mountain lake" zoom zoomIndicator />

<Picture src={photo} alt="Mountain lake" zoom>
  <svg slot="zoom-indicator" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M12 4v16M4 12h16" />
  </svg>
  This remains the image caption.
</Picture>
```

A supplied slot enables the indicator automatically. `zoomIndicator={false}` suppresses it even when a slot is supplied; `zoom={false}` also suppresses it. Without either the prop or slot, no indicator appears. The indicator is decorative and does not add another focus stop: the image's existing zoom link remains the click and keyboard target. The active lightbox item's indicator fades out on the page. Moving to another item fades the previous thumbnail's indicator back in and the newly active thumbnail's indicator out; other thumbnails retain their indicators. Closing the lightbox restores the active thumbnail's indicator. These fades follow the lightbox's opening/closing fade durations independently of hover styling, and respect reduced motion. Indicators stay out of the lightbox itself.

To replace the built-in artwork across a page, add `<YourExpandIcon slot="icon-expand" />` to `MediaTheme`, which also replaces the video player's expand button. Individual `zoom-indicator` slots take precedence over that shared icon. As with other `MediaTheme` icons, the shared replacement requires JavaScript; per-image slots and the built-in artwork render on the server.

Set these variables in global CSS or on an ancestor of the image:

| Property                                          | Default                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `--amk-zoom-indicator-size`                       | Video control size (`--amk-control-size`, `44px`)                                           |
| `--amk-zoom-indicator-icon-size`                  | Video icon size (`--amk-icon-size`, `24px`)                                                 |
| `--amk-zoom-indicator-color`                      | Video control color (`--amk-control-color`, `#fff`)                                         |
| `--amk-zoom-indicator-active-color`               | Resting indicator color                                                                     |
| `--amk-zoom-indicator-background`                 | Video control background (`--amk-control-background`)                                       |
| `--amk-zoom-indicator-active-background`          | `--amk-zoom-indicator-background` when set, else the video hover background                 |
| `--amk-zoom-indicator-inset`                      | `auto 0 0 auto` (flush bottom right)                                                        |
| `--amk-zoom-indicator-opacity`                    | Shared gallery resting icon opacity                                                         |
| `--amk-zoom-indicator-active-opacity`             | Shared gallery active icon opacity                                                          |
| `--amk-zoom-indicator-transition-duration`        | Video control transition duration (`--amk-control-transition-duration`, `0.5s`)             |
| `--amk-zoom-indicator-active-transition-duration` | Video control active transition duration (`--amk-control-active-transition-duration`, `0s`) |

The inset accepts CSS shorthand in top/right/bottom/left order: for a top-left indicator with some breathing room, use `0.75rem auto auto 0.75rem`. Custom SVGs should use `currentColor` to follow the color setting. Background properties accept CSS colors. Color, background, and opacity follow hover and keyboard focus, use the resting/active transition durations with the player's `--amk-easing`, and disable cosmetic transitions with reduced motion.

For a black indicator on a white background that reverses immediately on hover or keyboard focus and fades back afterward:

```css
:root {
  --amk-zoom-indicator-color: #000;
  --amk-zoom-indicator-background: #fff;
  --amk-zoom-indicator-active-color: #fff;
  --amk-zoom-indicator-active-background: #000;
  --amk-zoom-indicator-opacity: 1;
  --amk-zoom-indicator-active-opacity: 1;
  --amk-zoom-indicator-transition-duration: 250ms;
  --amk-zoom-indicator-active-transition-duration: 0ms;
}
```

Indicator opacity affects both the artwork and its background. Set both opacity values to `1` for an opaque tile, including when shared gallery icons rest at a lower opacity. Omitted active colors retain the resting colors you set; otherwise the indicator takes the video controls' resting and hover backgrounds.

### Recommended defaults

`<Image>` and `<Picture>` follow Astro's local-image format and layout defaults. For projects that share a common image setup across many call sites, a thin wrapper is a natural place to bake in conventions — responsive breakpoints, zoom scope, and a few props worth defaulting:

- **`inferSize` for authorized remote sources.** `getImage()` throws on a remote `src` without either `inferSize` or `width` + `height` (a dev-mode warning fires up front when neither strategy is supplied). `inferSize={true}` is a no-op on local `ImageMetadata` sources — Astro strips the flag before processing and only probes for remote URLs. Remote sources must be authorized through `image.domains` or `image.remotePatterns`.
- **`fallbackFormat` favoring WebP on `<Picture>`.** Astro's per-input defaults fall back to PNG for `avif`, `tiff`, `webp`, and unknown sources. If your target browsers support WebP, you can choose it as the fallback for those inputs; compare output size and quality for your images before choosing a default.
- **`formats` preserving SVGs.** Astro's default `['webp']` applies to every input, so an SVG `src` hits the image service for raster conversion and throws unless `image.dangerouslyProcessSVG` is enabled in `astro.config`. Pass `formats={{ svg: ['svg'] }}` (per call site or as a wrapper default) to emit a single vector `<source>` for SVG inputs while every other input keeps the `['webp']` default. Empty entries like `{ svg: [] }` skip preferred `<source>` generation and let the `<img>` fallback carry the SVG directly. A dark fallback `<source>` is still emitted when needed to preserve theme switching.
- **Responsive SVG sizing.** When an Image or any Picture source can render native SVG, generated `sizes` keeps Astro's responsive breakpoints without adding `auto`. This avoids a [Safari 27 SVG distortion bug](https://bugs.webkit.org/show_bug.cgi?id=324661). Raster-only output still uses automatic sizing, including SVGs converted to raster formats. An explicit `sizes` prop is always preserved.

Destructured defaults still let each call site override:

#### Image component recommendations

```astro
---
// src/components/Image.astro
import type { ImageProps } from 'astro-media-kit/components'
import { Image as MediaKitImage } from 'astro-media-kit/components'

type Props = ImageProps

const { inferSize = true, ...imageProps } = Astro.props
---

<MediaKitImage {inferSize} {...imageProps} />
```

#### Picture component recommendations

```astro
---
// src/components/Picture.astro
import type { PictureProps } from 'astro-media-kit/components'
import { Picture as MediaKitPicture } from 'astro-media-kit/components'

type Props = PictureProps

const {
  fallbackFormat = {
    avif: 'webp',
    tiff: 'webp',
    unknown: 'webp',
    webp: 'webp',
  },
  formats = { svg: ['svg'] },
  inferSize = true,
  ...pictureProps
} = Astro.props
---

<MediaKitPicture {fallbackFormat} {formats} {inferSize} {...pictureProps} />
```

Then import from your project (e.g. `~/components/Image.astro`) instead of `astro-media-kit/components`.

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

<!-- Local file (served from public/) -->
<Video src="/videos/intro.mp4" />

<!-- No playback controls for background-style video -->
<Video src="dQw4w9WgXcQ" service="youtube" controls="none" autoPlay loop />
```

#### Video Props

| Prop                 | Type                                                                              | Default                     |
| -------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| `src`                | `string`                                                                          | —                           |
| `service`            | `'bunny' \| 'cloudflare' \| 'local' \| 'mux' \| 'oembed' \| 'vimeo' \| 'youtube'` | inferred from `src`         |
| `controls`           | `'full' \| 'minimal' \| 'lightbox' \| 'native' \| 'none'`                         | `'full'`                    |
| `autoPlay`           | `boolean`                                                                         | `false`                     |
| `muted`              | `boolean`                                                                         | `true`                      |
| `loop`               | `boolean`                                                                         | `false`                     |
| `preload`            | `'auto' \| 'metadata' \| 'none'`                                                  | `'metadata'`                |
| `poster`             | `string`                                                                          | service thumbnail           |
| `label`              | `string`                                                                          | video title, else `'Video'` |
| `capQualityToSize`   | `boolean`                                                                         | `true`                      |
| `initialBandwidth`   | `number`                                                                          | —                           |
| `credit`             | `boolean \| string`                                                               | `false`                     |
| `creditMediaType`    | `MediaType`                                                                       | `'video'`                   |
| `creditOrganization` | `string`                                                                          | —                           |
| `zoom`               | `boolean \| string`                                                               | `false`                     |
| `zoomLevel`          | `'fill' \| 'fit' \| 'native'`                                                     | `'fit'`                     |
| `zoomPlaceholder`    | `'auto' \| 'none'`                                                                | `'auto'`                    |
| `zoomScope`          | `string` (CSS selector)                                                           | —                           |

`service` is required for Bunny title search. Bare Bunny UUIDs, Cloudflare 32-character hex IDs, Mux alphanumeric IDs of 40 to 64 characters, YouTube 11-character IDs, and numeric Vimeo IDs are inferred automatically. Bunny, Cloudflare, and Mux take these identifiers rather than arbitrary provider URLs. Use `service` to override inference when necessary; with it set, a value that is not a URL goes to that service as it is.

`capQualityToSize` and `initialBandwidth` apply to the hls.js engine for HLS playback (Bunny, Cloudflare, Mux, and direct `.m3u8` URLs); native HLS playback ignores them. `initialBandwidth` is in bits per second. `poster` replaces the thumbnail a service returns; local files have no thumbnail of their own. `<Video>` does not extract XMP metadata — use `credit`, `creditMediaType`, and `creditOrganization` for manual credits.

Generic oEmbed sources retain the provider's player and do not use the kit's playback controls, autoplay/mute/loop/preload settings, HLS settings, or lightbox zoom; their `poster` shows only in the fallback link without JavaScript, and only when the provider reports the embed's dimensions. Set `service="oembed"` to use discovery for a recognized provider such as YouTube or Vimeo; the full source URL is preserved. The page must advertise a JSON oEmbed discovery endpoint that returns embed HTML, which is trusted as the provider returns it. Treat `src` as author-controlled: the kit fetches whatever URL it names during rendering and injects the HTML that comes back, so never build it from request data on a server-rendered page. Video metadata and oEmbed requests run during rendering; provider and network failures are logged, shown inline in development, and omitted from the production page. Missing credentials and unrecognizable sources throw instead, so a build without its secrets fails rather than silently omitting its videos.

`controls` selects the player's control bar layout: `'full'` shows play, mute with a volume popup, a time slider and display, captions when present, and either native fullscreen or a lightbox expand button when `zoom` is enabled. `'minimal'` shows a large play button and, with `zoom`, an expand button; it gains the full playback bar without native fullscreen in the lightbox. `'lightbox'` shows the playback bar without fullscreen or expand buttons. `'native'` skips the Video.js UI and uses the underlying element's controls: the service's iframe controls for YouTube/Vimeo, or browser controls for local files and HLS; it has no lightbox opener. `'none'` hides playback controls, retaining an expand button with `zoom` and dismissible playback errors. On the page, full and minimal players toggle playback when their video surface is clicked or tapped; only the expand button opens the lightbox. In the lightbox, the video surface supports dragging, playback uses the toolbar when available, and a collapse button replaces the expand button, returning the player to the page. Minimal players never offer native fullscreen. In minimal and none modes, the on-page expand button appears only on hover or keyboard focus, even while paused.

URL formats recognized automatically:

| Service | Formats                                                                   |
| ------- | ------------------------------------------------------------------------- |
| YouTube | `youtube.com/watch`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, `/v/`  |
| Vimeo   | `vimeo.com/`, `player.vimeo.com/video/`; an unlisted video keeps its hash |
| Local   | Direct file URLs (detected by extension)                                  |
| oEmbed  | Any other URL (falls back to oEmbed discovery)                            |

Local and direct media sources are probed for dimensions at render time: a local file is read from disk, and a remote direct URL is range-requested, so a server that ignores `Range` sends the whole file once per build. Site-root paths such as `/videos/intro.mp4` are tried under the default `public/` directory first. When probing succeeds, the player reserves the corresponding aspect ratio; if probing fails, the media determines its size after loading. Custom `publicDir` locations are not resolved automatically by this probe. YouTube and Vimeo use oEmbed dimensions to establish an aspect ratio, rather than the source video's pixel resolution.

Playback is built on [Video.js 10](https://videojs.org). Bunny, Cloudflare, and Mux stream HLS through `@videojs/hlsjs-video`, YouTube and Vimeo play through `@videojs/youtube-video` and `@videojs/vimeo-video`, direct `.m3u8` URLs use the HLS adapter, and other local files use the native `<video>` element. The control bar is composed from Video.js UI components, with a poster, a buffering indicator, tooltips, touch-to-reveal controls that fade away when the player is idle unless the pointer is over the bar, and the usual keyboard shortcuts when the player is focused (Space or K to play, M to mute, the left and right arrows or J and L to seek, the up and down arrows to change volume, C for captions, and F for native fullscreen with full controls and no lightbox zoom). Paused videos keep their playback controls visible. During playback, controls hide after 1.5 seconds of inactivity, while hovering the bar, an open popup, or keyboard focus keeps them usable. On-page controls fade without sliding; a playing video reveals them only while the pointer is over the player or its controls. Controls adapt to narrow containers, and playback failures display a dismissible message with a direct video link. Video players and lightboxes support Astro client-side navigation. Opening or closing the lightbox preserves external caption tracks and the selected caption language. Set `--media-accent-color` on a wrapping element to tint the slider fills.

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

| Prop                 | Type                                  | Default                        |
| -------------------- | ------------------------------------- | ------------------------------ |
| `src`                | `string`                              | —                              |
| `service`            | `'local' \| 'oembed' \| 'soundcloud'` | inferred                       |
| `autoPlay`           | `boolean`                             | `false`                        |
| `muted`              | `boolean`                             | `false`                        |
| `loop`               | `boolean`                             | `false`                        |
| `preload`            | `'auto' \| 'metadata' \| 'none'`      | `'metadata'`                   |
| `label`              | `string`                              | provider title, else `'Audio'` |
| `credit`             | `boolean \| string`                   | `false`                        |
| `creditMediaType`    | `MediaType`                           | `'audio'`                      |
| `creditOrganization` | `string`                              | —                              |

Local audio uses the kit's editable Video.js audio controls, including play/pause, ten-second seeking, time, playback speed, and volume. When the player is focused, Space or K plays, M mutes, the left and right arrows or J and L seek, the up and down arrows change the volume, 0 through 9, Home, and End jump to a position, and `<` and `>` change the speed. Its skin stylesheet is requested only when a local audio player renders. Its icons share the [MediaTheme](#mediatheme) overrides used by video. SoundCloud and oEmbed players retain their providers' controls.

`autoPlay`, `muted`, `loop`, and `preload` configure local audio; SoundCloud receives only `autoPlay`, while generic oEmbed uses the provider's embed settings. Numeric SoundCloud track IDs are inferred automatically. Generic oEmbed requires a page advertising a JSON discovery endpoint that returns embed HTML. As with Video, oEmbed failures are logged and shown inline only in development.

### Carousel

Each top-level child element becomes a slide. Scripts, styles, stylesheet links, and inert templates stay outside the slide track. Navigation buttons, swiping, dragging, and keyboard navigation with the arrow keys, Home, and End are available when there is more than one slide. Dots and on-page captions are optional.

```astro
---
import { Carousel, Image } from 'astro-media-kit/components'
import first from '../assets/first.jpg'
import second from '../assets/second.jpg'
---

<Carousel label="Trip photos" captions dots>
  <Image src={first} alt="The beach" zoom="trip">
    The first stop.
  </Image>
  <Image src={second} alt="The mountains" zoom="trip">
    The next stop.
  </Image>
</Carousel>
```

| Prop                 | Type      | Default                      |
| -------------------- | --------- | ---------------------------- |
| `captions`           | `boolean` | `false`                      |
| `dots`               | `boolean` | `false`                      |
| `label`              | `string`  | `'Carousel'`                 |
| `class`, `className` | `string`  | — (`class` takes precedence) |

The Carousel does not enable zoom or assign a gallery automatically. Give its image/video children the same `zoom` name to open them together in the lightbox; while the lightbox is open, the carousel follows the item on show. Audio and generic oEmbed embeds do not have lightbox zoom. Hidden on-page captions remain available to the lightbox. Without JavaScript, the track remains horizontally scrollable with CSS scroll snapping. Set `--amk-carousel-duration` (default `0.4s`, `0s` with reduced motion) on the carousel or an ancestor to time its glide.

### MediaTheme

Place one optional `<MediaTheme>` in your page layout to replace decorative icons across the kit's video controls, local audio controls, carousels, image zoom indicators, and lightbox. Supply inline SVGs or Astro components that render a single SVG through named `icon-*` slots. Every omitted icon keeps its built-in artwork; without `MediaTheme`, all components work as usual.

```astro
---
import { MediaTheme } from 'astro-media-kit/components'
import PlayIcon from '../icons/PlayIcon.astro'
import PauseIcon from '../icons/PauseIcon.astro'
import CloseIcon from '../icons/CloseIcon.astro'
---

<MediaTheme>
  <PlayIcon slot="icon-play" />
  <PauseIcon slot="icon-pause" />
  <CloseIcon slot="icon-close" />
</MediaTheme>

<slot />
```

| Slots                                                    | Used by                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon-play`, `icon-pause`, `icon-restart`                | Video and local audio, including the large minimal-video play button                                                                                                                  |
| `icon-volume-off`, `icon-volume-low`, `icon-volume-high` | Video and local audio                                                                                                                                                                 |
| `icon-spinner`                                           | Video and local audio buffering indicators                                                                                                                                            |
| `icon-captions-off`, `icon-captions-on`                  | Video caption controls                                                                                                                                                                |
| `icon-fullscreen-enter`, `icon-fullscreen-exit`          | Video native-fullscreen controls                                                                                                                                                      |
| `icon-expand`                                            | Video's on-page lightbox opener and the opted-in Image and Picture corner indicators; defaults to a mirror of the fullscreen-enter artwork, pointing to the top-right and bottom-left |
| `icon-collapse`                                          | Video's lightbox button that returns the player to the page; defaults to a mirror of the fullscreen-exit artwork                                                                      |
| `icon-seek`                                              | Local audio's forward and backward seek buttons; the backward button mirrors the icon                                                                                                 |
| `icon-check`                                             | Local audio's selected playback-speed indicator                                                                                                                                       |
| `icon-close`, `icon-previous`, `icon-next`               | Lightbox and carousel controls; previous/next mirror in right-to-left layouts                                                                                                         |
| `icon-zoom-in`, `icon-zoom-out`                          | Lightbox secondary zoom states                                                                                                                                                        |

Use `currentColor` in your SVGs to follow the control color. The kit sizes each icon without overriding its fill, stroke, or viewBox. Icons are decorative: the kit retains accessible button labels, focus handling, keyboard behavior, and state switching. Icons must be static SVG markup; client-hydrated components and interactive content are not supported in these slots. Unknown slots and slots that do not render a single SVG throw during rendering, which happens at build time for static pages.

Overrides apply to the current document and refresh on Astro client-side navigation. `MediaTheme` emits inert template content, so it adds no layout box and can also sit inside a Carousel without becoming a slide. Visiting a page without `MediaTheme` restores the defaults. These overrides leave unrelated Video.js icon families alone, and image-only pages do not load Video.js. The `MediaIconName` type is exported from `astro-media-kit/components`.

For video control styling, set `--amk-control-size`, `--amk-control-color`, `--amk-control-background`, `--amk-control-hover-background`, `--amk-icon-size`, `--amk-font-size`, `--amk-slider-track-height`, `--amk-slider-track`, `--amk-slider-buffer`, `--amk-slider-fill`, and `--amk-duration` (the control bar's own fade) on `:root`, on any element around the player, or on `.amk-video` itself. Local audio retains Video.js's `--media-accent-color`, `--media-accent-text-color`, `--media-font-family`, and `--media-scale-unit` theme hooks; set them on `.amk-audio`. Dot styling is available through `.amk-carousel-dot` and its `::before` pseudo-element.

Video button highlights appear immediately on hover and fade back over `0.5s`, both on the page and in the lightbox. Set `--amk-control-transition-duration` for hover-out and `--amk-control-active-transition-duration` for hover-in (default `0s`) on `.amk-video`. These use `--amk-easing`, which defaults to `cubic-bezier(0.2, 0.8, 0.1, 1)`, and disable motion when reduced motion is requested. They do not change playback idle timing or gallery crossfades.

The volume popup fades and slides toward or away from its mute button over `0.2s`, using the same easing. Set `--amk-volume-popover-transition-duration` on `.amk-video` to adjust its opening and closing duration. Reduced motion disables this animation too.

#### Shared gallery controls

Carousel and lightbox buttons share `--amk-gallery-*` defaults. Set them on `:root` in global CSS to style both together. An individual carousel can inherit settings from its surrounding element; the lightbox is appended to `<body>`, so its shared settings need to be global or set on `.amk-lightbox`.

| Property                                                      | Default                     |
| ------------------------------------------------------------- | --------------------------- |
| `--amk-gallery-control-size`                                  | `2.75rem`                   |
| `--amk-gallery-control-width`, `--amk-gallery-control-height` | Shared control size         |
| `--amk-gallery-control-color`                                 | `#f4f4f4`                   |
| `--amk-gallery-control-background`                            | `rgb(0 0 0 / 60%)`          |
| `--amk-gallery-control-hover-background`                      | `rgb(0 0 0 / 80%)`          |
| `--amk-gallery-control-radius`                                | `50%`                       |
| `--amk-gallery-control-inset`                                 | `0.75rem`                   |
| `--amk-gallery-control-block-position`                        | `50%` (navigation arrows)   |
| `--amk-gallery-icon-size`                                     | `1.25rem`                   |
| `--amk-gallery-icon-opacity`                                  | `1`                         |
| `--amk-gallery-icon-active-opacity`                           | `1`                         |
| `--amk-gallery-control-transition-duration`                   | `0.5s`                      |
| `--amk-gallery-control-active-transition-duration`            | Resting transition duration |

Component-specific properties take precedence: replace `gallery` with `carousel` or `lightbox` to override an individual component's controls. Existing component `control-size` settings still work and override shared dimensions. Component-specific width or height overrides the component's size for that axis. Each component reads these variables on its root, so set them on `:root`, on an ancestor of a carousel, or on `.amk-lightbox` or `.amk-carousel`, not on individual buttons.

Component-specific properties are optional overrides rather than populated defaults. If your own CSS reads one directly, include the shared fallback, such as `var(--amk-lightbox-control-size, var(--amk-gallery-control-size))`.

Use `--amk-lightbox-close-width`, `--amk-lightbox-close-height`, and `--amk-lightbox-close-inset` for a close target with different dimensions or placement; corresponding `--amk-lightbox-zoom-*` settings customize the secondary zoom button. Close/zoom insets use CSS top/right/bottom/left shorthand. Navigation insets follow the inline direction; `--amk-gallery-control-block-position` moves both arrows vertically from their default centered position. The lightbox's default placement respects device safe areas. Explicit close/zoom inset shorthands replace that default placement.

For rectangular arrow targets, a smaller close target, icons resting at 40%, immediate hover/focus brightness, and a gradual fade-out:

```css
:root {
  --amk-gallery-control-width: 52px;
  --amk-gallery-control-height: 88px;
  --amk-gallery-control-inset: 12px;
  --amk-gallery-control-radius: 0;
  --amk-gallery-control-background: transparent;
  --amk-gallery-control-hover-background: transparent;
  --amk-gallery-icon-opacity: 0.4;
  --amk-gallery-icon-active-opacity: 1;
  --amk-gallery-control-transition-duration: 250ms;
  --amk-gallery-control-active-transition-duration: 0ms;

  --amk-lightbox-close-width: 44px;
  --amk-lightbox-close-height: 36px;
  --amk-lightbox-close-inset: 12px auto auto 12px;
}
```

Active styling applies to hover-capable pointers and keyboard focus. Controls fade back to their resting appearance over 0.5 seconds by default. Lightbox icon and background fades use `--amk-lightbox-easing`, matching its other transitions. Disabled arrows keep their disabled appearance. Icon opacity is separate from the lightbox's opening, closing, and drag fades; captions retain their own lifecycle opacity. Reduced motion disables these cosmetic transitions. Image indicators inherit the shared icon opacity unless their indicator-specific properties override it; their size, colors, and transitions follow the video control properties instead. Existing SVG replacement slots continue to work with these controls.

### ZoomLink

A text link that opens an image or a video in the lightbox, for media the page doesn't show on its own. The media elements are rendered into an inert `<template>` inside the link, so they do not load until client interaction; the supporting scripts and styles still load with the page, and server-side image processing or video metadata requests still run during rendering. Without JavaScript, the link goes to the image or the video's fallback URL.

```astro
---
import { ZoomLink } from 'astro-media-kit/components'
import photo from '../assets/photo.jpg'
---

<p>
  See <ZoomLink src={photo}>the photo</ZoomLink>, or watch
  <ZoomLink src="https://vimeo.com/123456789">the talk</ZoomLink>.
</p>
```

`src` accepts imported image metadata, import promises, a `{ dark, light }` pair (rendered through `<Picture>`), or a string. Strings with recognized image extensions use Image; other URLs, recognized service IDs, and media-file paths use Video. With the integration, a relative image path is auto-imported as it is on Image. ZoomLink has no sizing, `inferSize`, or image-format props, so public/remote image strings lack the dimensions needed to render; use imported local images instead. An image's `alt` defaults to the link's text. `zoom` is on by default, and takes a gallery name to open the link's media alongside other items; `zoomLevel` and `zoomScope` work as on the other components. It also accepts `class` and `className`, with `class` taking precedence. Generic oEmbed videos and videos that fail to load render as plain links, since they have no zoomable player.

### Supporting components

**Caption** wraps media in `<figure>`/`<figcaption>` when there is caption text or a visible credit, with a credit line built from `creator`, `organization`, and `type` when `showCredit` is on. Its named `media-component` slot holds the media; the default slot holds the caption text. Image, Picture, Video, and Audio render it from their `credit*` props, so you generally don't need to use it directly.

**Zoomer** wraps content the lightbox can lift. Enable it through `zoom` on Image, Picture, or Video, with `zoomLevel`, `zoomScope`, and `zoomPlaceholder` alongside. Standalone, it accepts `enabled`, `level`, `scope`, `placeholder`, an optional `href` for native fallback navigation, `nativeWidth` for the `native` zoom level, and `interactive` for content that runs its own controls, such as a player: an interactive wrapper is not itself a button, and opens from an element inside it carrying `data-zoom-open`; once lifted, an element inside it carrying `data-zoom-close` closes the lightbox. Its child is the content to enlarge: any element works, laid out at the larger size rather than scaled as a bitmap. Set standalone `indicator` to enable the decorative marker and optionally replace its artwork through the named `indicator` slot. Unlike Image and Picture, the standalone slot does not enable the indicator by itself.

### Lightbox

The lightbox moves the real element into a full-screen `<dialog>`, animates it up from where it sat, and moves it back when the viewer closes. The displayed media is the original element: a `<picture>` keeps its `srcset`, and a video retains its playback state subject to the browser limitations below. Decorative previews and captions are copied separately. Images and videos crossfade with their on-page previews while opening and closing. The player's control bar rises from the bottom of the viewer as the player lifts and sinks away as it lands; moving directly between videos crossfades their strips in place without vertical motion. The lightbox's close button returns the video to the page. Items that share a `zoom` gallery name open together as a carousel you can swipe, drag, or step through with the buttons and the keyboard. Only the item on show is heard: as a gallery opens, media playing in its other items fades out, comes back as the carousel reaches them, at the level each had when the gallery opened or was given in the viewer since, and every item returns to its level when the viewer closes.

During a video-to-video crossfade, the overlay's control strips share one background to keep its translucency steady. Controls with matching artwork, styling, and positions stay at their normal opacity; only controls that differ fade between the two players. This keeps unchanged white buttons from dimming during the overlap. Afterward, the active bar resumes its ordinary rendering and idle behavior. The temporary background follows the active player's styling and control height and respects reduced motion.

On the page, only the active overlay item's image indicator or video controls fade out. Moving through the gallery fades the previous thumbnail's controls back in as the newly active thumbnail's controls fade out; other thumbnails keep their controls. Closing restores the active thumbnail's controls after its media returns. Lifted, inactive video thumbnails retain inert snapshots of their page controls, while the original controls operate the video in the overlay. These page fades use the lightbox's opening and closing fade durations and respect reduced motion.

The server renders each item's gallery and fallback attributes. With zoom enabled, Image and Picture emit a real link to the largest generated candidate in their fallback format, which works without JavaScript and keeps browser behavior for modified clicks, along with that candidate's width for the `native` zoom level. Video emits the dimensions its metadata adapter provides. Wrappers around plain content are buttons, with `role`, `tabindex`, and `aria-haspopup` in the HTML; wrappers around a player are marked interactive, so the player's own controls keep their clicks. The stylesheet is bundled with the page's CSS, and the script loads on pages with a zoom-enabled component. Document listeners cover items added by Astro's client router; a `ResizeObserver` tracks the viewer's dimensions.

While the original is lifted, its wrapper holds its place in the page and a decorative preview stands in: a copy of an image that follows the candidate the lifted original loads, so the two crossfade and land on the same pixels; a player's poster, or its live frames on a canvas, for video; a copy of ordinary HTML. `zoomPlaceholder="none"` reserves the space without a preview. Hovering an item for a moment, or focusing it, warms the candidate the viewer will need, without changing the visible thumbnail.

When zooming needs an uncached image candidate, the viewer enlarges the loaded image immediately and keeps those pixels visible until the selected source has decoded. The real image or picture continues to choose its responsive source; a temporary bitmap covers the loading interval, including later zoom and resize upgrades. Failed requests keep the last good image visible, as does closing and reopening before loading finishes. This also works with `zoomPlaceholder="none"`, which only controls the preview left on the page.

Closing preserves the document's scroll position. An on-page Carousel follows the viewer from item to item, so it is on the selected slide when the viewer closes, without scrolling its ancestors. If the thumbnail remains offscreen, the closing animation travels toward its existing position without scrolling it into view; other scroll containers keep their positions. An image whose computed `object-position` is not a pair of percentages, or that has no size on the page, returns without the animation.

A ZoomLink's media isn't in the page: it is instantiated from the link's template as the link is used, hovered as well as clicked, grows out of the link once it can show, shrinks back into it as the viewer closes, and is discarded then. It joins a gallery like any other item.

In the viewer:

- Drag the content up or down to dismiss it; a short drag springs back. Swipe, scroll horizontally, or drag with the mouse to move between items; a drag let go while still moving carries on to the next item, as paging does on iOS.
- Use the previous and next buttons, the arrow keys, Home, and End. Close with Escape, the close button, or a click outside the content; Space also closes when focus is outside the content, caption, and controls. While zoomed in, a click anywhere zooms back out instead of closing. A focused player keeps its own keys, except Escape and gallery navigation arrows. Sliders keep their arrow keys, and an open player popup receives Escape before the viewer closes.
- With `zoomLevel="fill"` or `"native"`, click the content to zoom in on that point, or use the Zoom button. Pan by scrolling, dragging, or with the arrow keys, and click again to zoom back out. `"fit"` (the default) closes on click.
- A figure's caption is copied beside the content when there is room, and below it otherwise. The caption on the page stays where it is.
- Transitions can be turned around partway, and a click on another item while the viewer opens or closes opens that item instead.

The viewer's control labels and slide announcements, and the carousel's button and slide labels, are in English only.

The viewer's parts are plain classes you can style: `.amk-lightbox` (the dialog, with `data-state` of `open` or `closing`), `.amk-lightbox-track`, `.amk-lightbox-slide`, `.amk-lightbox-stage`, `.amk-lightbox-frame`, `.amk-lightbox-layer`, `.amk-lightbox-caption`, and `.amk-lightbox-button` with `.amk-lightbox-close`, `.amk-lightbox-zoom`, `.amk-lightbox-previous`, and `.amk-lightbox-next`. Normal page-facing rules sit in the `amk-lightbox` cascade layer so your unlayered styles can override them; essential lifting and overlay layout rules use `!important`. Set these custom properties on `:root` or `.amk-lightbox`:

| Property                             | Default                           |
| ------------------------------------ | --------------------------------- |
| `--amk-lightbox-backdrop`            | `rgb(0 0 0 / 28.7%)`              |
| `--amk-lightbox-duration`            | `0.4s` (`0s` with reduced motion) |
| `--amk-lightbox-open-fade-duration`  | `0.3s` (`0s` with reduced motion) |
| `--amk-lightbox-close-fade-duration` | `0.3s` (`0s` with reduced motion) |
| `--amk-lightbox-carousel-duration`   | `0.4s` (`0s` with reduced motion) |
| `--amk-lightbox-easing`              | `cubic-bezier(0.2, 0.8, 0.1, 1)`  |
| `--amk-lightbox-gutter`              | `clamp(0.75rem, 5vmin, 4rem)`     |
| `--amk-lightbox-caption-width`       | `min(20rem, 30vw)`                |
| `--amk-zoom-in-cursor`               | `zoom-in`                         |
| `--amk-zoom-out-cursor`              | `zoom-out`                        |

`--amk-lightbox-duration` times opening, closing, secondary zoom, and the backdrop and control fades; the two fade durations time the image crossfade with its preview as it lifts and lands, and the active thumbnail's control fades (set them on `:root` to customize both); `--amk-lightbox-carousel-duration` times the carousel spring. Button and icon styling comes from the [shared gallery controls](#shared-gallery-controls) properties. Transparent images show the page through their clear areas in the viewer too; give the image a `background` for a matte, which travels with it.

The cursor shows what a click does. `--amk-zoom-in-cursor` covers items on the page, content in the viewer that a click zooms into, and content on its way back that a click brings back. `--amk-zoom-out-cursor` covers the rest of the viewer, where a click closes it or zooms back out. Captions, controls, and players keep their own cursors, and ZoomLink text links keep the link pointer. Set both on `:root` to change the page and the viewer together. The page item's cursor rule is unlayered, so a site-wide `a { cursor: pointer }` doesn't replace it on items that render as links.

Set these properties in global CSS (or `<style is:global>` in an Astro layout). The viewer is appended to `<body>`, so properties set only on an individual image or its page wrapper do not inherit into the overlay. Existing part classes remain available for borders, focus styles, positioning, and individual button overrides. Use [MediaTheme](#mediatheme) to replace icon artwork.

The lightbox requires native `<dialog>` and [invoker-command support](https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement/command). It uses [`moveBefore()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore) when available to preserve element state during a lift. Otherwise it falls back to insertion: HTML video playback is preserved, but iframes inside lifted elements reload and player popups restart. While an image is lifted, temporary `sizes` values follow its displayed width when it opens, zooms, or the viewport grows. The browser still selects the matching picture source and responsive candidate; the original sizing hints return when the image lands. Hover and focus warm candidates before opening.

### Scoped galleries

By default, visible zoom-enabled items sharing the same gallery name form a single gallery, regardless of where they appear in the DOM. The `zoomScope` prop limits this by setting a CSS selector boundary — items under separate ancestors matching the selector become separate galleries, even if they share the same gallery name.

This is useful for reusable components (e.g. cards, sections) where you want each instance to have its own gallery without manually assigning unique names:

```astro
---
import { Picture } from 'astro-media-kit/components'
import a from '../assets/a.jpg'
import b from '../assets/b.jpg'
import c from '../assets/c.jpg'
import d from '../assets/d.jpg'
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

If the selector matches no ancestor, the element falls back to standalone behavior and a warning is logged. An invalid CSS selector throws when the gallery is resolved. If `zoom` is `false`, `zoomScope` is ignored.

### Credit metadata

`<Image>` and `<Picture>` automatically extract credit information from embedded XMP metadata via [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) when `credit` is enabled. The following XMP tags are read:

| XMP tag   | Maps to prop           | Description                                        |
| --------- | ---------------------- | -------------------------------------------------- |
| `Creator` | `credit` (string form) | Attribution name (photographer, illustrator, etc.) |
| `Credit`  | `creditOrganization`   | Publication or organization alongside the creator  |
| `Label`   | `creditMediaType`      | Semantic media type (see values below)             |

Explicit `creditMediaType` values use the `MediaType` union: `'animation'`, `'audio'`, `'diagram'`, `'illustration'`, `'image'`, `'photo'`, `'render'`, `'screenshot'`, or `'video'`. An extracted XMP `Label` may contain any text; it is not validated against that union. If `Creator` is a list, the first entry is used.

The `credit` prop collapses the "show the credit line" toggle and the creator-name override into a single value:

- `credit={false}` (default) — no credit line
- `credit={true}` — render the credit line using XMP-extracted or explicit values
- `credit="Jane Doe"` — render the credit line with `"Jane Doe"` as the creator name (overrides XMP `Creator`)

When a creator or organization is present and credits are enabled, these are rendered as a credit line in the `<figcaption>` — for example, "Photo: Jane Doe / Acme Corp". A media type alone does not create a credit line. Explicit props override XMP values.

If the `Label` tag is missing or extraction is not applicable, `creditMediaTypeFallback` is used (defaults to `'image'`).

XMP extraction only runs on local image assets passed as metadata. Public and remote image URL strings skip extraction; manual values still work. `<Video>` and `<Audio>` don't read XMP — they accept `credit`, `creditOrganization`, and `creditMediaType` as manual props only, with the media type defaulting to `'video'` or `'audio'`.

## Video services

Services that require API credentials use Astro's `astro:env/server` for secret access. Set the corresponding environment variables. The integration's `video` option registers their secret schema; also set Astro's `env.validateSecrets: true` to validate them when starting the dev server or a build. Without that setting, Astro validates secrets when accessed rather than at startup.

| Service    | Environment variables                                         |
| ---------- | ------------------------------------------------------------- |
| Bunny      | `BUNNY_API_ACCESS_KEY`, `BUNNY_HOSTNAME`, `BUNNY_LIBRARY_ID`  |
| Cloudflare | `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` |
| Mux        | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`                            |

YouTube, Vimeo, local, and oEmbed do not require credentials.

The current service adapters have these additional requirements:

- **Bunny:** the video must be ready and have MP4 fallback encoding enabled. The MP4 fallback uses the highest available resolution at or below 720p, or the smallest available resolution when all are higher. Title search selects the first returned match.
- **Mux:** pass an asset ID, not a playback ID. The asset must be ready, have exactly one video track, a playback ID (a public one is preferred when there are several), and ready static MP4 renditions.
- **Cloudflare:** the video must be ready and report its input dimensions, an HLS URL, and a thumbnail. The MP4 fallback URL is derived from the HLS URL without checking its availability; caption metadata is not currently loaded.

The adapters do not generate signed playback tokens.

To register the schema and enable startup validation:

```ts
import mediaKit from 'astro-media-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  env: { validateSecrets: true },
  integrations: [
    mediaKit({
      video: ['bunny', 'mux'], // Or 'bunny', or true for all credentialed services
    }),
  ],
})
```

## Integration

The `mediaKit()` integration registers Vite plugins in `astro:config:setup`. All options are optional.

### Auto-import

Enabled by default. Parses `.astro` files during development and builds and replaces quoted local asset paths on configured components with ESM import expressions, so Astro's image pipeline can process them. Remote URLs, public image URLs, data URLs, and expression-valued attributes are left alone. This imports image assets, not the components themselves, and does not transform `.md` or `.mdx` files.

Root-relative source paths such as `/src/assets/photo.jpg` are imported when the file exists under Astro's configured `root`. Files in the configured `publicDir` take precedence when both locations contain the same path, so public image URLs retain their normal behavior.

```ts
import mediaKit, { imageOnlyImport, tldrawDarkImport } from 'astro-media-kit'

// Default behavior — Image, Picture, and ZoomLink src props are auto-imported
mediaKit()

// Custom configuration
mediaKit({
  autoImport: {
    components: {
      Image: 'src',
      MyImage: 'src',
      Picture: ['src', tldrawDarkImport],
      ZoomLink: imageOnlyImport,
    },
  },
})
```

A custom `components` map replaces the default one, so list every component that takes string paths. `imageOnlyImport` imports a `src` unless it is a video source, which `ZoomLink` takes as it is.

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

Astro deletes a raster original that only its transforms used, and the kit's components keep that detection intact. Two kinds of original still remain in the build output: SVG originals processed with `image.dangerouslyProcessSVG`, whose source path Astro loses when it builds the SVG component, and any original kept by a raw `src` read whose URL never reaches the output. Enable `removeOriginals` to delete those after the build completes:

```ts
mediaKit({
  removeOriginals: true,
})
```

This cleanup checks files directly in Astro's configured assets directory. It recognizes JPG, JPEG, PNG, WebP, and SVG originals with the shape `{base}.{HASH8}.{ext}` — the 8-character hash Astro appends before the extension (e.g. `photo.Ab1Cd2Ef.jpg`). Transformed variants use an `_` separator after the hash (`photo.Ab1Cd2Ef_W800.webp`) and are left alone. An original is removed only when at least one transformed sibling exists and its hash and extension are absent from generated HTML, CSS, JavaScript, JSON, SVG, XML, and web manifest files throughout the client and configured server build output. The reference scan handles encoded URLs, direct links, responsive sources, and relative, base-prefixed, or absolute URLs. It conservatively keeps matching references even in comments or unrelated URLs; URLs assembled dynamically from separate strings cannot be detected. If a reference file cannot be read, or a server build’s configured server output is missing, cleanup is skipped. Ordinary files copied from `public/` without such hashes are unaffected. Inspired by [this Astro issue](https://github.com/withastro/astro/issues/4961).

### Strip EXIF

Enable `stripExif` to strip writable metadata tags, including EXIF/XMP, from supported images in the build output after the build completes:

```ts
mediaKit({
  stripExif: true,
})
```

This walks the build output directory recursively and processes `jpg`, `jpeg`, `png`, `webp`, `tif`, `tiff`, `avif`, `heic`, and `gif` files — covering both Astro-processed assets and pass-through copies from `public/`. Source images under `src/` and `public/` on disk are left untouched. Stripping is performed by [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js); ICC color profiles and orientation metadata are kept, preserving colors and rotated or mirrored presentation without rewriting pixels. Individual failures are logged without stopping the build. Formats outside this list are not processed.

### Watermark (dev)

Stamps processed raster images with their pixel dimensions and encoded byte size as a tiled text overlay, so you can visually confirm which srcset candidate the browser actually loaded. SVG output, animated output, and images below `minDimension` are skipped. Intended for dev use — a warning is logged for builds; the option still stamps prerendered build output when enabled, while pages rendered on demand keep the configured runtime image service.

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
| `angle`        | `number`  | `-30`   | Rotation in degrees; negative values tilt counter-clockwise                 |
| `minDimension` | `number`  | `96`    | Skip variants smaller than this on either axis                              |
| `opacity`      | `number`  | `0.8`   | Label fill/stroke opacity (0–1)                                             |

The stamped byte count is the pre-watermark size — the variant's weight without the overlay. Registers a custom local image service that wraps Astro's built-in sharp service; when disabled (the default), the image pipeline is left entirely untouched.

### Video env schema

See the [Video services](#video-services) section above.

## Utilities

Exported from `astro-media-kit`:

- **`resolveImageSource(src, srcDark?)`** — Resolve `ImageMetadata` or `ImageMetadataLike` (optionally plus a dark counterpart) to `ImageMetadata` or `DarkLightImageMetadata`, unwrapping Astro's SVG component form. Enforces format/width/height parity when a dark counterpart is provided.
- **`probeImageMetadata(filePath)`** — Read a local image file and return its `ImageMetadata` (dimensions, format) using Astro's `imageMetadata` utility. Local files only.
- **`isImageMetadataObject(src)`** — Type guard that recognizes image-like values by a string `src`, including Astro's SVG-component wrapper form. It does not validate dimensions or format.
- **`transformAstroSource(source, components, directories?)`** — The auto-import transform the integration applies to `.astro` source, for custom tooling. `components` maps component names to auto-import entries as the `autoImport.components` option does; `directories` supplies Astro's resolved `root` and `publicDir` to tell root imports from public URLs. Returns the transformed source, or `undefined` when nothing changed. Parsing uses `@astrojs/compiler-rs`, the compiler Astro itself uses, and the imports are spliced into the source by position, so the rest of the file is left exactly as written.
- **`tldrawDarkImport`** — An `AutoImportEntry` that generates a `srcDark` import for `.tldr` files.
- **`imageOnlyImport`** — An `AutoImportEntry` that imports `src` unless it is a video source, for `ZoomLink`.

## Types

Exported from `astro-media-kit`:

- **`DarkLightImageMetadata`** — `{ dark: ImageMetadata; light: ImageMetadata }`
- **`ImageMetadataLike`** — `ImageMetadata` with `format` relaxed to `string` for plugin compatibility.
- **`MediaType`** — `'animation' | 'audio' | 'diagram' | 'illustration' | 'image' | 'photo' | 'render' | 'screenshot' | 'video'`
- **`Service`** — `'bunny' | 'cloudflare' | 'local' | 'mux' | 'oembed' | 'vimeo' | 'youtube'`
- **`ServiceConfig`** — Maps each video service name to its configuration type.
- **`CredentialService`** — `'bunny' | 'cloudflare' | 'mux'`, the services that need credentials.
- **`BunnyConfig`**, **`CloudflareConfig`**, **`MuxConfig`** — Credential shapes for those services.
- **`VideoInfo`** — Normalized video metadata (dimensions, duration, URLs, captions).
- **`MediaKitConfig`** — Options accepted by the `mediaKit()` integration function.
- **`AphexConfig`**, **`TldrawConfig`**, **`TldrawImageOptions`**, **`WatermarkConfig`** — Config shapes for the corresponding integration features.
- **`AutoImportConfig`**, **`AutoImportEntry`**, **`AutoImportPluginConfig`** — Types for the auto-import feature's component mapping.

Component prop types are exported from `astro-media-kit/components`: **`AudioProps`**, **`CaptionProps`**, **`CarouselProps`**, **`ImageProps`**, **`PictureProps`**, **`VideoProps`**, **`ZoomerProps`**, and **`ZoomLinkProps`**. **`FormatRules`** and **`FormatsRules`**, the per-input-format object forms of `format`, `fallbackFormat`, and `formats`, are exported there too, as is **`MediaIconName`** for icon overrides.

## Development notes

`pnpm test` runs Node unit/build tests and browser behavior tests in Chromium, Firefox, and WebKit through Playwright; first run `pnpm exec playwright install` to download the browsers. Browser tests use both generated test markup and the pages built by the `core-image` fixture. Run only the Node project with `pnpm vitest run --project unit`, or one browser with `pnpm vitest run --project browser --browser.name=chromium`. Even the unit-only command builds the browser fixture while loading the shared Vitest configuration.

This project is also interesting: [Alos-no/Astro-Smart-Media](https://github.com/Alos-no/Astro-Smart-Media)

## Maintainers

[kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

Video and audio playback are built on [Video.js 10](https://videojs.org) (`@videojs/html` with the `@videojs/hlsjs-video`, `@videojs/youtube-video`, and `@videojs/vimeo-video` media elements). The audio player's skin stylesheet is adapted from Video.js's own, under the [Apache License 2.0](src/components/internal/audio/license.txt). XMP credit extraction relies on [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) and its underlying [exiftool](https://exiftool.org/) project.

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
