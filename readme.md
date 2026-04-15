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

## Overview

This is a small collection of Astro components to help you write minimalist, platonic markup in your content and templates without compromising robust output.

It includes:

- **Image**\
  Enhanced Astro `<Image>` wrapper with captions, XMP credit extraction, and PhotoSwipe zoom.
- **Picture**\
  Custom `<picture>` renderer with configurable dark mode (OS preference, CSS selector, or disabled), responsive source sets, and zoom.
- **Video**\
  Unified player for YouTube, Vimeo, Bunny, Cloudflare Stream, Mux, local files, and generic oEmbed, plus credit extraction and PhotoSwipe zoom.
- **Audio**\
  Player for SoundCloud, local files, and generic oEmbed.
- **Integration**\
  Auto-import image assets in `.astro` files (no manual `import` statements), plus support for automatically handling tldraw files via [tldraw-cli](https://github.com/kitschpatrol/tldraw-cli) and Apple Photos plugin support via [aphex](https://github.com/kitschpatrol/aphex).

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
  integrations: [
    mediaKit({
      // All options are optional — defaults are sensible
      // autoImport: true,      // Enabled by default
      // tldraw: false,         // .tldr file support
      // aphex: false,          // Apple Photos imports
      // video: false,          // Env schema injection for video services
    }),
  ],
})
```

### Direct component usage

You can also import components directly without the integration. In this case, pass imported `ImageMetadata` objects rather than string paths:

```astro
---
import { Image, Picture, Video } from 'astro-media-kit/components'
import hero from '../assets/hero.jpg'
---

<Image src={hero} alt="Hero image" />
<Picture src={hero} alt="Hero image" />
<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
```

## Components

### Image

Wraps Astro's built-in `<Image>` with captions, XMP credit extraction, and PhotoSwipe zoom. Accepts `ImageMetadata`, a `{ dark, light }` pair, or a string path (with the integration enabled).

For dark/light pairs, Image uses the light variant only — use Picture for full dark mode support.

```astro
---
import { Image } from 'astro-media-kit/components'
import photo from '../assets/photo.jpg'
---

<Image src={photo} alt="A photo" zoom />
<Image src={photo} alt="With background" background="#f0f0f0" backgroundDark="#1a1a1a" />
```

Key props beyond Astro's standard `<Image>` props:

- **`src`** — `ImageMetadata | DarkLightImageMetadata | ImageMetadataLike | string`
- **`zoom`** — `boolean | string` — Enable PhotoSwipe zoom. A string groups images into a named gallery.
- **`zoomScope`** — `string` — CSS selector defining a gallery scope boundary. Groups cannot form across separate ancestors matching the selector. See [Scoped galleries](#scoped-galleries).
- **`background`** / **`backgroundDark`** — CSS colors for transparent image areas, using `light-dark()`.
- **`creator`** / **`organization`** — Attribution overrides (otherwise extracted from XMP metadata via exiftool).
- **`showCredit`** — `boolean` (default `true`) — Show the credit line in the caption.
- **`type`** — `MediaType` — Semantic label (`'photo'`, `'screenshot'`, `'diagram'`, etc.) shown in the credit line.

Caption text is passed as a slot child:

```astro
<Image src={photo} alt="A sunset">A beautiful sunset over the mountains.</Image>
```

### Picture

Custom `<picture>` renderer with dark mode support. Uses Astro's `getImage()` API directly for full control over responsive source generation.

```astro
---
import { Picture } from 'astro-media-kit/components'
import heroLight from '../assets/hero-light.png'
import heroDark from '../assets/hero-dark.png'
---

<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} alt="No dark variant" srcDark={false} />
```

Key props:

- **`src`** — `ImageMetadata | DarkLightImageMetadata | ImageMetadataLike | string`
- **`srcDark`** — `ImageMetadata | ImageMetadataLike | string | boolean` — Dark mode variant. When `src` is a `{ dark, light }` pair (e.g. from a tldraw import), the dark variant is used automatically unless `srcDark={false}`.
- **`darkMode`** — `'media' | 'none' | string` — Dark mode switching strategy. See [Dark mode strategies](#dark-mode-strategies) below.
- **`alt`** — Required alt text.
- **`formats`** — `ImageOutputFormat[]` (default `['webp']`) — Output formats for `<source>` elements.
- **`fallbackFormat`** — `ImageOutputFormat` (default `'png'`) — Format for the `<img>` fallback.
- **`widths`** / **`densities`** / **`sizes`** — Responsive source set control.
- **`layout`** — `'responsive' | 'constrained' | 'fixed' | 'full-width' | 'none'` (default `'responsive'`)
- **`background`** / **`backgroundDark`** — CSS background colors for transparent areas.
- **`zoom`** — `boolean | string` — PhotoSwipe zoom support.
- **`zoomScope`** — `string` — CSS selector defining a gallery scope boundary. See [Scoped galleries](#scoped-galleries).
- **`creator`** / **`organization`** / **`showCredit`** / **`type`** — Caption and credit props (same as Image).

#### Dark mode strategies

The `darkMode` prop controls how Picture switches between light and dark image variants. It accepts three kinds of values:

**`'media'`** (default) — Uses `prefers-color-scheme` media queries on `<source>` elements. The browser picks the correct variant based on the OS color scheme preference. Background colors use the CSS `light-dark()` function. This is the most performant option: a single `<picture>` element, and the browser handles source selection natively.

```astro
<!-- Default behavior — follows OS dark mode preference -->
<Picture src={heroLight} srcDark={heroDark} alt="Hero" />
<Picture src={heroLight} srcDark={heroDark} alt="Hero" darkMode="media" />
```

**CSS selector string** — Any string other than `'media'` or `'none'` is treated as a CSS selector that identifies dark mode on the page. This is for frameworks that control dark mode via a class or attribute rather than the OS preference, like Starlight (`[data-theme="dark"]`) or Tailwind CSS (`.dark`).

Renders two `<picture>` elements (one light, one dark) and injects a `<style>` block that toggles visibility based on the selector. The dark variant's images load lazily when the selector activates.

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
<Video src="dQw4w9WgXcQ" service="youtube" controlStyle="none" autoPlay loop />
```

Key props:

- **`src`** — `string` — A URL, raw service ID, local file path, or Bunny title string.
- **`service`** — `'bunny' | 'cloudflare' | 'local' | 'mux' | 'oembed' | 'vimeo' | 'youtube'` — Override service inference. Required for Bunny title search and bare IDs without a URL.
- **`controlStyle`** — `'full' | 'minimal' | 'lightbox' | 'none'` (default `'full'`) — Player chrome level.
- **`autoPlay`** — `boolean` (default `false`) — Auto-play (muted by default for browser policies).
- **`muted`** — `boolean` (default `true`)
- **`loop`** — `boolean` (default `false`)
- **`poster`** — `string` — Override the service-provided thumbnail.
- **`zoom`** — `boolean | string` — PhotoSwipe lightbox for the video.
- **`zoomScope`** — `string` — CSS selector defining a gallery scope boundary. See [Scoped galleries](#scoped-galleries).
- **`preload`** — `'auto' | 'metadata' | 'none'` (default `'metadata'`) — Preload behavior hint.
- **`capQualityToSize`** — `boolean` — Limit HLS quality to the element's rendered size. Passed to hls.js's `capLevelToPlayerSize`.
- **`initialBandwidth`** — `number` — Initial HLS bandwidth estimate in bits/s. Higher values start at higher quality.
- **`label`** — `string` — Accessible label for the video player. Falls back to the video title.
- **`typeFallback`** — `MediaType` (default `'video'`) — Fallback media type when XMP Label tag is missing.
- **`creator`** / **`organization`** / **`showCredit`** / **`type`** — Caption and credit props.

URL formats recognized automatically:

| Service | Formats                                                 |
| ------- | ------------------------------------------------------- |
| YouTube | `youtube.com/watch`, `youtu.be/`, `/embed/`, `/shorts/` |
| Vimeo   | `vimeo.com/`, `player.vimeo.com/`                       |
| Local   | Direct file URLs (detected by extension)                |
| oEmbed  | Any other URL (falls back to oEmbed discovery)          |

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

Key props:

- **`src`** — `string` — A URL, SoundCloud track ID, or local file path.
- **`service`** — `'local' | 'oembed' | 'soundcloud'` — Override service inference.
- **`autoPlay`** — `boolean` (default `false`)
- **`muted`** — `boolean` (default `false`)
- **`loop`** — `boolean` (default `false`)
- **`preload`** — `'auto' | 'metadata' | 'none'` (default `'metadata'`)
- **`label`** — `string` — Accessible label for the audio player.
- **`typeFallback`** — `MediaType` (default `'audio'`) — Fallback media type when XMP Label tag is missing.

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

Image and Picture automatically extract credit information from embedded XMP metadata via [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js). The following XMP tags are read:

| XMP tag   | Maps to prop   | Description                                        |
| --------- | -------------- | -------------------------------------------------- |
| `Creator` | `creator`      | Attribution name (photographer, illustrator, etc.) |
| `Credit`  | `organization` | Publication or organization alongside the creator  |
| `Label`   | `type`         | Semantic media type (see values below)             |

The `Label` tag maps to the `MediaType` union: `'animation'`, `'audio'`, `'diagram'`, `'illustration'`, `'image'`, `'photo'`, `'render'`, `'screenshot'`, or `'video'`.

When present, these are rendered as a credit line in the `<figcaption>` — for example, "Photo: Jane Doe / Acme Corp". Props passed directly to the component override the XMP values.

If the `Label` tag is missing, the `typeFallback` prop is used instead (defaults to `'image'` for Image/Picture, `'video'` for Video, `'audio'` for Audio).

Video and Audio components don't extract XMP metadata — they accept `creator`, `organization`, and `type` as manual props only.

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

Enable `.tldr` file support via `@kitschpatrol/unplugin-tldraw`. Tldraw files are converted to SVG/PNG at build time and fed into Astro's image pipeline.

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

Enable Apple Photos `~aphex/` import support via `@kitschpatrol/unplugin-aphex`. Photos exported from macOS Photos.app can be referenced by album and title:

```ts
mediaKit({
  aphex: true,
})
```

```astro
<Image src="~aphex/Vacation/Beach Sunset" alt="Beach sunset" />
```

### Video env schema

See the [Video services](#video-services) section above.

## Utilities

Exported from `astro-media-kit`:

- **`resolveImageSource(src)`** — Resolve a string path or `ImageMetadata` to a usable `ImageMetadata` object.
- **`probeImageMetadata(filePath)`** — Read an image file and return its metadata (dimensions, format) using Astro's `imageMetadata` utility.
- **`isImageMetadataObject(src)`** — Type guard that checks whether a value is an `ImageMetadata` object.

## Types

Exported from `astro-media-kit`:

- **`DarkLightImageMetadata`** — `{ dark: ImageMetadata; light: ImageMetadata }`
- **`ImageMetadataLike`** — `ImageMetadata` with `format` relaxed to `string` for plugin compatibility.
- **`MediaType`** — `'animation' | 'audio' | 'diagram' | 'illustration' | 'image' | 'photo' | 'render' | 'screenshot' | 'video'`
- **`Service`** — `'bunny' | 'cloudflare' | 'local' | 'mux' | 'oembed' | 'vimeo' | 'youtube'`
- **`ServiceConfig`** — Maps each video service name to its configuration type.
- **`VideoInfo`** — Normalized video metadata (dimensions, duration, URLs, captions).

## Development notes

The [Astro Prettier plugin](https://github.com/withastro/prettier-plugin-astro) has issues parsing nested script tags in Astro templates, see [#452](https://github.com/withastro/prettier-plugin-astro/issues/452) and [#454](https://github.com/withastro/prettier-plugin-astro/issues/454).

This means that the `Zoomer.astro` and `VideoPlayer.astro` crash Prettier and cannot be automatically formatted.

I have released [a fork of the Astro Prettier plugin](https://github.com/kitschpatrol/prettier-plugin-astro/tree/fix-nested-script-tags) incorporating fixes for these issues.

## Maintainers

[@kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

Video playback is built on [media-chrome](https://github.com/muxinc/media-chrome), [hls-video-element](https://github.com/muxinc/hls-video-element), [youtube-video-element](https://github.com/nicknisi/youtube-video-element), and [vimeo-video-element](https://github.com/nicknisi/vimeo-video-element). Image zoom uses [PhotoSwipe](https://photoswipe.com/). XMP credit extraction relies on [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) and its underlying [exiftool](https://exiftool.org/) project.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/astro-media-kit/issues) and pull requests are welcome.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © Eric Mika

<!-- /license -->
