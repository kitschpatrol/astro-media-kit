# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `Carousel` with swipe, mouse-drag and keyboard navigation, optional dots and captions, lightbox integration, and a scroll-snap fallback without JavaScript.
- Add `ZoomLink` for opening images or videos from text links, instantiating hidden media on interaction and retaining native fallback links.
- Add `MediaTheme` and `MediaIconName` for document-wide SVG icon overrides across players, carousels, zoom indicators, and lightboxes.
- Add customizable image zoom indicators through `zoomIndicator`, indicator slots, and CSS properties.
- Add shared gallery-control properties for dimensions, placement, colors, icon opacity, and transitions, with component-specific overrides.
- Add lightbox preview policies through `zoomPlaceholder`, hover/focus image prewarming, and retained previews while larger image candidates decode.
- Support direct `.m3u8` video sources through the HLS adapter and existing HLS playback options.
- Add auto-import predicates and the exported `imageOnlyImport` helper; include image sources on `ZoomLink` in the default integration configuration.
- Export `FormatRules`, `FormatsRules`, `ZoomerProps`, and video-service credential types through the public entry points.

### Changed

- **Breaking:** Require Astro `^7.4.5`.
- **Breaking:** Replace PhotoSwipe with a lightbox that lifts original DOM content into a native dialog, requiring browser dialog and invoker-command support.
- **Breaking:** Redesign `Zoomer` around lifted children: replace `src`, `srcset`, `width`, and `height` with `href` and `nativeWidth`, and add interactive-content and placeholder options.
- Replace media-chrome video controls with Video.js 10 controls, including volume popups, buffering/error feedback, responsive layouts, and expanded keyboard controls.
- Use Video.js controls for local audio, adding ten-second seeking and playback-speed selection with a conditionally loaded audio skin.
- Coordinate gallery audio and player controls across lightbox transitions, fading inactive playing media and retaining volume changes made in the viewer.
- **Breaking:** Stop resolving filesystem strings inside `Image` and `Picture`; pass imported metadata or URLs, or resolve paths through the auto-import integration.
- **Breaking:** Make `resolveImageSource` synchronous and metadata-only; use `probeImageMetadata` to read files from disk.
- **Breaking:** Change `transformAstroSource` to accept `autoImport.components` configuration shapes directly, with optional project-root and public-directory context.
- **Breaking:** Move XMP lookup into `Image` and `Picture`, remove `Caption.src` and `Caption.typeFallback`, and allow free-text `Caption.type` labels.
- **Breaking:** Remove `creditMediaTypeFallback` from Audio and Video; use `creditMediaType` to override their audio/video labels.

### Removed

- **Breaking:** Remove the deprecated `FallbackRules` alias; use `FormatRules`.

### Fixed

- Match Astro image behavior for import promises, numeric-string dimensions, inline styles, and public or protocol-relative image URLs.
- Apply background compositing and dark backgrounds to URL image sources while preserving transparency needed for CSS theme switching.
- Use the `unknown` format rule for input formats outside the rule table and honor Image's `unknown` override for URL sources.
- Isolate Picture dark-mode selectors, support selector lists, generate stable selector classes, and retain alt text on dark variants.
- Preserve dark picture fallbacks when preferred formats are unsupported or omitted, including dark backgrounds on opaque fallback formats.
- Generate valid Picture srcsets for responsive layouts and densities, avoiding mixed descriptor types and duplicate 1x candidates.
- Keep Picture source URLs usable when the image service generates no responsive variants.
- Avoid generated automatic sizing for native SVG images to prevent Safari distortion while preserving explicit sizing hints.
- Preserve Astro's automatic original-image pruning by avoiding tracked source reads in Image and Picture.
- Read XMP credits from imported files regardless of output-directory configuration, and warn once per failed file lookup.
- Infer remote Picture dimensions once per render instead of probing again for every output variant.
- Preserve literal local filenames while decoding and normalizing media URL paths.
- Resolve auto-import entries independently and preserve explicitly supplied destination props.
- Restore source-root image auto-imports while distinguishing public-directory URLs from importable files.
- Create frontmatter when auto-importing assets into an Astro file that has none.
- Recognize original-image hashes containing underscores, tolerate missing asset directories, and avoid repeated filename scans during cleanup.
- Retain originals referenced by generated client or server output, and skip deletion when required reference scans fail.
- Give EXIF cleanup its own process pool so it does not disable later credit lookups or subsequent builds.
- Register watermarks with Astro's build-time image service, preserve the configured runtime service, and warn only during builds.
- Bound metadata requests, oEmbed requests, Mux lookups, and direct-media probes with fifteen-second timeouts.
- Preserve unlisted Vimeo privacy hashes, including numeric hashes, and reject collection or event URLs as individual video IDs.
- Recognize privacy-enhanced YouTube hosts and trailing-slash watch URLs, and reject partial IDs and playlist embeds as individual videos.
- Preserve page URLs for explicit oEmbed video sources, resolve relative discovery endpoints, and normalize numeric-string dimensions.
- Use the provider's title as the accessible label for oEmbed audio when no label is supplied.
- Correct Cloudflare MP4 fallback URLs and handle missing optional response fields without unintended property-access errors.
- Select ready video MP4 renditions across current and legacy Mux API response formats.
- Choose the smallest available Bunny fallback when all available MP4 resolutions exceed 720p.
- Honor an explicit `poster` for every video service.
- Allow direct cross-origin audio and video to play without CORS headers when caption tracks do not require CORS.
- Provide working native audio/video fallbacks and provider links without JavaScript, including uppercase SoundCloud URLs.
- Keep native-controls videos out of lightbox galleries.
- Preserve player registration and preview stylesheet side effects in consumer production bundles.
- Preserve page and scroll-container positions through lightbox lifts and offscreen closes, and return carousels to the selected slide.
- Keep responsive image previews visible through loading, zoom, resize, and reopen transitions, including Safari image revalidation.
- Restore floated video controls immediately when reversing a lightbox close, and keep player popups usable across moves.
- Prevent sticky expand-button focus and announce the opening lightbox slide after it becomes visible.
- Respect handled carousel keys, allow button-based slides to start drags, and preserve clicks after canceled drags.
- Dispose detached carousels and continue initializing other carousels when one has malformed markup.
- Make video control styling inherit from ancestors and keep zoom-wrapper layout consistent on image-only pages.

### Documentation

- Document Carousel, ZoomLink, MediaTheme, image indicators, shared control styling, and the replacement lightbox's interactions and browser requirements.
- Correct image defaults, source requirements, provider configuration, no-JavaScript behavior, and public API descriptions; clarify that oEmbed HTML remains trusted provider content.
- Clarify original-image cleanup, build-only watermarking, English-only gallery labels, browser-test workflows, and third-party audio-skin attribution.

### Maintenance

- Migrate the Mux SDK dependency from `@mux/mux-node` to `@mux/ts` and refresh runtime dependencies.
- Add Playwright-backed Chromium, Firefox, and WebKit regression tests, expand image parity coverage, and stabilize cross-platform CI timing.
- Refresh development dependencies, pnpm, repository automation, and Video.js skill dependencies, pinning the skill source to a commit.
- Build during package preparation and publish through pnpm.
- Consolidate media, credential, and lightbox helpers, rename the oEmbed HTML normalizer, and remove unused helpers and the passthrough image endpoint.
- Ship the Apache license text for the vendored Video.js audio skin.

## [0.6.0] - 2026-10-07

### Changed

- **Breaking:** Require Astro `^7.3.3` and adapt image transforms and watermark hooks to its updated types and logger argument.
- **Breaking:** Change supported Node.js versions to `^24.16.0 || >=26.3.0`, excluding Node 25 and early Node 26 releases.

### Documentation

- State the precise Node.js and Astro requirements in the installation prerequisites.

### Maintenance

- Refresh runtime dependencies, including video-resolution probing, EXIF tooling, Mux, and the asset-import plugins.
- Upgrade to Vitest 5 and pnpm 12, refresh development tooling and CI actions, and expand XMP and local-video regression tests.
- Add scheduled dependency-update automation and contributor skill synchronization.
- Declare Astro, CSS, and lightbox side-effect modules explicitly for bundlers.

## [0.5.3] - 2026-08-25

### Fixed

- Keep image-format rule tables compatible with Astro's expanded input-format types by adding `apng` entries.

### Documentation

- Correct the Astro prerequisite to version 7 and clarify image sources, dark/light pairs, and responsive configuration.

### Maintenance

- Refresh runtime dependencies, including Mux SDK 15, Aphex/tldraw integrations, EXIF tooling, and the Vimeo element.
- Update development dependencies and pnpm, switch publishing to npm with an OTP, and improve website sitemap discovery in link checks.

## [0.5.2] - 2026-08-05

### Changed

- **Breaking:** Raise the minimum supported Node.js version to 24.16.

### Documentation

- Correct npm package and license links in the README.

### Maintenance

- Refresh runtime dependencies, including EXIF tooling, linkedom, and pretty-bytes.
- Add scheduled repository and website link checking, and simplify release-tag validation and release automation.
- Refresh development dependencies, GitHub Actions, editor tasks, and Astro-specific lint/type configuration.

## [0.5.1] - 2026-07-07

No notable changes.

## [0.5.0] - 2026-07-07

### Changed

- **Breaking:** Require Astro `^7.0.0`, replacing Astro 6 support.

### Fixed

- Preserve oEmbed HTML during normalization instead of rendering an empty embed, and normalize all iframe attributes reliably.
- Respect reduced-motion preferences for lightbox image fades and restrict hover effects to hover-capable pointers.
- Escape gallery names when counting gallery items and locating video slides.

### Maintenance

- Refresh runtime dependencies, including Mux SDK 14, tldraw integration, and media-chrome.
- Upgrade contributor tooling to TypeScript 6 and shared-config 8, refresh pnpm and test dependencies, and apply stricter lint rules.

## [0.4.0] - 2026-06-11

### Changed

- **Breaking:** Raise the Astro peer requirement to `^6.4.0`.

### Maintenance

- Update runtime dependencies, including Astro Compiler 4, EXIF tooling, and media-chrome.
- Refresh development dependencies and pnpm, and work around Starlight configuration type-checking issues in contributor tooling.

## [0.3.1] - 2026-05-19

### Added

- Allow `Image.format` to accept per-input-format output rules for local images.

### Deprecated

- Deprecate the deep-imported `FallbackRules` type alias in favor of `FormatRules`.

### Fixed

- Keep light images visible when selector-based dark mode has no dark counterpart.
- Apply selector-based dark backgrounds correctly for transparent images, including images without a separate dark source.
- Preserve image backgrounds through lightbox transitions and restore click-to-zoom behavior for selector-mode pictures.

### Documentation

- Document Image format rules and the direct output-comparison layer of the Astro parity tests.

### Maintenance

- Expand dark-mode regression coverage and compare rendered image attributes directly with `astro:assets`.

## [0.3.0] - 2026-05-19

### Added

- Allow `Picture.formats` to accept per-input-format rules, including empty lists that skip preferred source generation.

### Changed

- **Breaking:** Replace `Picture.fallbackRules` with an object form of `fallbackFormat`; a string still forces one fallback format.
- **Breaking:** Require explicit dimensions or `inferSize` for remote images instead of enabling size inference automatically.
- **Breaking:** Apply Picture's default WebP source format to SVG inputs too; explicitly select SVG output to preserve vectors without rasterization.

### Documentation

- Clarify Astro-compatible defaults, format rules, remote image requirements, and wrapper examples for recommended defaults.
- Add a guide for maintaining image-component parity tests against Astro.

### Maintenance

- Add built-fixture parity tests for Astro image behavior, with supporting test dependencies and workspace configuration.

## [0.2.6] - 2026-05-19

### Fixed

- Allow the `unknown` key in `Picture.fallbackRules` types for sources without known input formats.

### Documentation

- Document the `unknown` fallback-rule key for remote and string sources.

## [0.2.5] - 2026-05-19

### Added

- Add `Picture.fallbackRules` for overriding fallback output formats by input format.

### Fixed

- Match Astro's default `Image` output format: preserve SVG and convert other local inputs to WebP unless `format` is supplied.

### Documentation

- Document fallback-format rules and annotate which image props originate in Astro or media-kit.

### Maintenance

- Use the current EXIF write-options API and add metadata-stripping regression tests.

## [0.2.4] - 2026-05-19

### Fixed

- Strip image metadata without leaving `_original` backup files in build output.

### Maintenance

- Update Astro development dependencies, shared configuration, and pnpm.

## [0.2.3] - 2026-05-17

### Changed

- **Breaking:** Raise the minimum supported Node.js version from 22.18 to 24.

### Fixed

- Automatically inject the client types for enabled Aphex and tldraw integrations.
- Preserve active dark-mode picture sources and transitions when opening images in the lightbox.

### Maintenance

- Refresh runtime dependencies, including Aphex, EXIF tooling, and the Vimeo player element.
- Migrate contributor tooling to pnpm 11, return to TypeScript 5.9, refresh CI actions, and correct authentication passing in the publish script.

## [0.2.2] - 2026-04-29

### Fixed

- Update the Aphex and tldraw plugins to eliminate peer-dependency installation warnings.

### Documentation

- Correct the MIT license link.

## [0.2.1] - 2026-04-28

### Fixed

- Resolve build-output file URLs correctly on Windows when removing originals or stripping image metadata.
- Prevent floating video controls from appearing over still-image lightbox slides in production builds.

### Maintenance

- Run workspace Astro synchronization sequentially during builds.

## [0.2.0] - 2026-04-28

### Added

- Add `Video controls="native"` for browser or provider controls, bypassing the custom control bar and lightbox zoom.

### Changed

- **Breaking:** Rename the `Video` prop `controlStyle` to `controls`.

### Documentation

- Document native video controls and update examples and prop references to use `controls`.

### Maintenance

- Update development dependencies and Markdown link validation, and disable Astro telemetry during CI builds to prevent Windows cleanup crashes.

## [0.1.0] - 2026-04-28

### Added

- Provide `Image` and `Picture` components with responsive image generation, local metadata and remote URL sources, captions, credits, and background colors.
- Support light/dark picture sources selected by system preference or a CSS selector, with configurable output formats and dark backgrounds.
- Provide a unified `Video` player for local files, YouTube, Vimeo, Bunny, Cloudflare Stream, Mux, and generic oEmbed, with playback controls, posters, captions, and HLS options.
- Provide an `Audio` component for local files, SoundCloud tracks, and generic oEmbed sources.
- Provide `Caption` for figure captions and credit lines, including optional extraction of image XMP creator, organization, and media-type metadata.
- Provide PhotoSwipe image/video lightboxes and `Zoomer`, with named galleries, selector-based gallery scopes, captions, and fit/fill/native secondary zoom levels.
- Provide the `mediaKit()` Astro integration with configurable image auto-imports in `.astro` files and optional video-service credential validation.
- Integrate tldraw imports through `unplugin-tldraw`, including a `tldrawDarkImport` helper for generating dark picture variants.
- Support Apple Photos album/title imports through the optional Aphex integration.
- Offer `removeOriginals` to remove original build-output images that have transformed siblings.
- Offer `stripExif` to remove image metadata recursively from build output while leaving source files untouched.
- Offer configurable image watermarks showing responsive variants' dimensions and encoded sizes for debugging.
- Export image-source resolution, metadata probing and detection, the auto-import transform, and component/integration types through the package entry points.
- Distribute Astro components and TypeScript source as ESM, requiring Astro `^6.1.0` and Node.js 22.18 or later.

### Documentation

- Document installation, integration and direct imports, component props, galleries, credits, service credentials, and build options; identify the package as experimental before 1.0.

### Maintenance

- Establish linting, type checking, unit tests, cross-platform CI, and package release tooling.

[Unreleased]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.6.0...HEAD
[0.1.0]: https://github.com/kitschpatrol/astro-media-kit/releases/tag/v0.1.0
[0.2.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.1.0...v0.2.0
[0.2.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.0...v0.2.1
[0.2.2]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.1...v0.2.2
[0.2.3]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.2...v0.2.3
[0.2.4]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.3...v0.2.4
[0.2.5]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.4...v0.2.5
[0.2.6]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.5...v0.2.6
[0.3.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.2.6...v0.3.0
[0.3.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.3.0...v0.3.1
[0.4.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.3.1...v0.4.0
[0.5.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.4.0...v0.5.0
[0.5.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.5.0...v0.5.1
[0.5.2]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.5.1...v0.5.2
[0.5.3]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.5.2...v0.5.3
[0.6.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.5.3...v0.6.0
