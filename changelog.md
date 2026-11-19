# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are drafted with LLM assistance via [Chagent](https://github.com/kitschpatrol/chagent).

## [0.11.1] - 2026-11-19

### Fixed

- Load the optional tldraw and Apple Photos Vite plugins as ES modules while Astro reads its config. This fixes `ERR_PACKAGE_PATH_NOT_EXPORTED` for ESM-only dependencies under `tsx`. Report a missing peer only when its `mediaKit()` option is enabled, and surface other import errors during config loading.

### Maintenance

- Restore pnpm workspace skill installation into `.claude/skills` for Claude Code.

## [0.11.0] - 2026-11-19

### Changed

- **Breaking:** Keep `Image` and `Picture` thumbnails in the page when the lightbox opens. The viewer uses a separate responsive copy that follows the page theme and shows the thumbnail’s pixels until its selected image decodes. IDs and event handlers stay on the original. Set `zoomPlaceholder="none"` to hide the thumbnail while preserving its space.
- Fade ordinary HTML wrapped in `Zoomer` as it expands from its page box and shrinks back to it. The transition uses `--amk-lightbox-open-fade-duration` and `--amk-lightbox-close-fade-duration`.

### Fixed

- Let browsers select `Picture` sources with passthrough image services such as the Astro Cloudflare adapter’s `imageService: 'passthrough'`. Use the image’s MIME type when known and omit the `<source>` element’s `type` when the format is unknown.
- Refresh the native zoom control when a lightbox image finishes loading, so zoom becomes available if the image’s intrinsic width allows it. This also covers density-based `srcset` candidates.
- Animate lightbox photos back to the thumbnail’s current position and crop. Skip the return animation if the thumbnail loses its rendered box or its `object-position` stops being a pair of percentages, even when the wrapper stays visible.
- Prevent the page from shifting when `Zoomer` lifts content with collapsing vertical margins, including when positive and negative margins meet those of neighboring elements.
- Prevent a blank flash when a lifted `Zoomer` image returns and selects a new responsive candidate. Keep its page preview visible while the image decodes, with the zoom indicator above the preview.
- Return focus to the current thumbnail without an unwanted outline after opening a gallery with a pointer and navigating with the keyboard. Tabbing to the thumbnail again shows its normal focus ring.
- Fix a memory leak that retained removed audio and video elements until the next Astro navigation, including players created by `ZoomLink` after their lightbox slides were released.

### Documentation

- Document which lightbox elements move, when neighboring video players enter the viewer, and how placeholders, responsive image sizing, and loading previews work. Explain how the lightbox fade durations apply to ordinary `Zoomer` HTML.

### Maintenance

- Stabilize browser tests on CI with timestamped gesture replays, waits for animation frames and video seeks, and fixture mounting that lets WebKit release old players. Raise the CI job timeout from 30 to 45 minutes. ([#3](https://github.com/kitschpatrol/astro-media-kit/pull/3))
- Update the Video.js player and its HLS, Vimeo, and YouTube adapters to `^10.5.0`, and `exiftool-vendored` to `^39.4.0`.
- Refresh Astro, Vitest, and `modern-web-guidance` for development. Update the `chagent` release tool to `^0.8.0` and exempt version `0.8.0` from pnpm’s minimum release age check.

## [0.10.1] - 2026-11-17

### Added

- Pinch images and videos in the lightbox on a touchscreen to zoom at every `zoomLevel`, including `"fit"`. Once enlarged, a pinch can cross the fitted size and stretch past either zoom limit with resistance, then springs back into range on release. The Zoom button resets pinched media to fit, and lifting the fingers does not activate a tap. Inside the viewer, this pinch replaces the browser's own page zoom.
- Zoom lightbox images and videos about the pointer with a trackpad pinch (Safari's gesture events included), or by turning the mouse wheel with Ctrl or Command held. Zooming stops at the fitted size and at the zoom limit rather than closing or stretching past them, and a plain wheel still pans and turns slides.
- Close the lightbox by pinching fitted media smaller. The media follows the fingers, the backdrop, controls, and caption fade as it shrinks, and letting go sends it home to its thumbnail. Set `--amk-lightbox-pinch-to-close` to `0` to have it resist and spring back instead.
- Add the `--amk-lightbox-max-zoom` property (default `8`), for how many times its fitted size media can be pinched to, and `--amk-lightbox-pan-padding` (default `32px`), for how far panned media stays from each edge of the viewer. Both are read as a zoom begins.
- Pace the lightbox's opening and closing travel and growth separately, with new `--amk-lightbox-lead-easing` and `--amk-lightbox-follow-easing` properties. By default the content now travels ahead of its growth on the way up and shrinks ahead of its travel on the way home. A zoom inside the viewer keeps one curve for both.

### Changed

- Pan zoomed lightbox media the same way with a finger, mouse, or pen. A pull past an edge gives with resistance, a quick release coasts with momentum, a new press catches it without clicking, and a mouse drag shows a grabbing hand. Two fingers move the media freely and it springs back within limits on release. Zoomed media now moves inside a clipped, transparent viewport rather than a scroll container, so it no longer shows scrollbars; the wheel and arrow keys still pan it. Reduced motion disables momentum and animated returns.
- Keep a zoomed lightbox item's zoom, and the point at its center, through window resizes and rotations instead of resetting it to fit.
- Show the lightbox Zoom button only for items with a secondary `zoomLevel`, or while media is zoomed in. On other items it now fades out and becomes inert instead of staying visible but disabled, including in galleries that mix both kinds of item.

### Fixed

- Recover lightbox gallery swipes after multi-finger touches that start or end outside the track, such as on a control, and stop treating an added finger as a tap on the content.
- Keep the lightbox and its controls on the visible screen when it opens on a page that is already pinch-zoomed, and keep multi-finger gestures in the viewer from scrolling the page behind it.
- Let a pinch-zoomed page pan over inline carousels instead of turning their slides. The carousel's buttons and keyboard navigation still work.
- Stop Chromium from briefly painting opaque frames behind the translucent lightbox when a video player moves into the viewer.
- Stop SVG thumbnails flickering on iPadOS when the lightbox opens: vector artwork now stays in the page, sharp at any page zoom, while the viewer shows a copy. `Image` and `Picture` mark their SVG output with `data-vector`, and an image wrapped by hand counts as vector artwork when its address ends in `.svg` or it carries `data-vector`.
- Stop Safari, including on iPadOS, from returning focus with a visible ring to a video player's container after closing a lightbox opened from that player.

### Documentation

- Lay out the viewer's gestures in the readme as a table by input (touch, mouse, trackpad, and keyboard), followed by notes on moving between items, closing, zooming, panning, and players.
- Describe pinch, trackpad, and Ctrl or Command wheel zoom at every level in the `zoomLevel` and `Zoomer` `level` prop docs. Document the new lightbox pan, zoom-limit, pinch-to-close, and easing properties, and how vector artwork stays in the page.

### Maintenance

- Move the pinch and pan math (size resistance, the pinch-to-close regime, the settle spring, pan limits, edge resistance, and the release coast) into pure modules covered by Node unit tests. Route all input on a zoomed subject through one gesture handler. Remove the unreachable native-scroll panning paths, and consolidate duplicated viewer helpers, including the drag dimming, id stripping, and page carousel following.
- Add browser coverage for pinch, touch and mouse panning, wheel and trackpad zoom, elastic zoom, video pinch, multitouch recovery, scroll containment, resizing, mobile galleries and carousels, SVG lifting, and player paint. New test commands drive multi-finger CDP touches with individual releases, open a top-level mobile page with a real visual viewport, and capture Chromium compositor frames.
- Speed up the browser suite by sharing one opener across the zoom, pinch, and pan tests, testing the pan's spring back once per axis, and moving the mouse home in one step after each test, which takes about three minutes off a twenty-one-minute run.

## [0.10.0] - 2026-11-16

### Changed

- **Breaking:** Raise the Astro peer requirement from `^7.4.7` to `^7.4.12` so consumers receive fixes for shared spread-attribute mutation in scoped templates and proxy-header validation. The scoped-template fix is relevant to the kit's attribute forwarding. This is a precautionary increase; no new Astro API is required and no kit failure was demonstrated on the previous minimum.
- Stop trackpad paging at the first and last slides in lightbox galleries and page carousels, and respond immediately when reversing direction.
- Smooth trackpad movement and let fingers returning to the trackpad stop a glide before it settles on the nearest slide.

### Fixed

- Keep trackpad scrolls that slow to a stop from flicking to another slide, and handle merged or delayed momentum events without advancing extra slides.
- Switch page video thumbnails from posters to live frames when playback starts in a lightbox gallery, preserving their dimensions and retaining posters while video data is unavailable.

### Documentation

- Document trackpad end stops and stopping a glide by returning fingers to the trackpad.
- Correct the image parity test allowlist documentation for fixture IDs and Astro's `data-image-component` marker.

### Maintenance

- Update Video.js dependencies to `^10.4.0`, `@mux/ts` to `^16.2.0`, and `exiftool-vendored` to `^39.3.0`.
- Refresh development and release tooling, including pnpm `12.21.0`, Playwright, chagent, and an explicit esbuild dependency; replace the Astro checker runtime workaround with `glob` and `minimatch` overrides.
- Expand trackpad regression coverage for merged and delayed events, end stops, and interrupted glides, and stabilize the Firefox turn-back test.
- Add `Picture` density parity coverage against Astro `7.4.12`, checking that generated sources contain distinct `1x` and `2x` candidates.

## [0.9.0] - 2026-11-15

### Added

- Add `--amk-gallery-slide-gap` with a `1.5rem` default and component-specific `--amk-carousel-slide-gap` and `--amk-lightbox-slide-gap` overrides.
- Expose audio-track detection through `VideoInfo.hasAudio` for local/direct files, HLS, Bunny, Cloudflare, and Mux; disable silent-video volume controls and shortcuts with configurable `no-audio` artwork and `noAudio` labels.
- Warn in development when zoomable `Image` or `Picture` components have empty alt text, leaving their lightbox links without accessible names.

### Changed

- **Breaking:** **Breaking:** Replace `Image`/`Picture` `zoom-indicator` slots and `Zoomer`'s `indicator` slot with the integration's `zoom-indicator` icon, independent of `expand`; indicators now require `zoomIndicator` or `indicator` explicitly.
- **Breaking:** **Breaking:** Rename the kit's cascade layers to `amk.lightbox`, `amk.gallery`, and `amk.video`, and nest audio skin layers under `amk.audio`; update custom layer orders to use `amk`.
- Give touch-driven galleries and page carousels elastic end stops, and let a press stop a glide before settling on the nearest slide.
- Follow trackpad movement directly, advance at most one slide per swipe, ignore trailing system momentum, and prevent vertical gestures from changing slides; support sideways and Shift-wheel paging.
- Toggle playback from clicks and taps anywhere on full and minimal page videos, reveal controls on touch, and enable surface playback for `controls="lightbox"` players without zoom.
- Play or pause lightbox videos with playback controls on surface clicks or taps, with video zooming reserved for the Zoom button.
- Use caption drags for gallery navigation instead of text selection, preserving caption links; lightbox caption clicks now close the viewer or zoom back out.
- Synchronize page carousels continuously with lightbox drags, swipes, and glides, and settle them on the selected slide when the lightbox closes.

### Removed

- **Breaking:** **Breaking:** Remove the `labels.carousel` integration option from `LabelsConfig`; `Carousel` now renders as a group, named only when its `label` prop is supplied.

### Fixed

- **Breaking:** **Breaking:** Make `@kitschpatrol/unplugin-tldraw` and `@kitschpatrol/unplugin-aphex` optional peers loaded only when enabled, fixing npm installs on Linux/Windows and avoiding unused plugin build scripts; install the corresponding peer when enabling either feature.
- Keep returning video posters and control previews visible until the poster decodes, preventing black thumbnails and play-button flicker in Safari and iPadOS.
- Make offscreen carousel slides inert, move or restore focus to the track when a focused slide or lightbox opener becomes hidden, and leave Home/End inside slides to the page.
- Preserve `youtube-nocookie.com` sources for privacy-enhanced playback while keeping fallback links pointed at the video's YouTube page.
- Prevent carousel slide styles from overriding video, poster, and fallback-media dimensions inside kit players and embeds.
- Reserve lightbox space for the player's configured `--amk-control-size` and safe-area padding so larger controls do not cover the video.
- Keep focus rings fully visible on disabled carousel/lightbox navigation buttons and inactive carousel dots.
- Use the control bar's configured foreground and background colors for video tooltips and scrub times, keeping light themes readable.
- Announce carousel and lightbox slide positions and names once navigation settles, avoiding announcements of slides passed during a drag.
- Scale video control text, tooltips, scrub times, errors, and fallback labels with the reader's default font size without shrinking below existing sizes.
- Avoid duplicate screen-reader announcements from video tooltips and prerendered times.
- Remove duplicate accessible grouping for local audio and label its native no-JavaScript fallback directly.
- Include service-provided caption tracks in the no-JavaScript video fallback.
- Activate button-style zoom items when Space is released on the same item, matching native button timing.
- Allow mouse drags from a video's surface to move its page carousel without toggling playback, while controls retain their own gestures.
- Forward player shortcuts such as K and M while the lightbox dialog has focus, preserving the viewer's navigation and close keys.
- Delay gallery pointer capture until dragging begins so presses on zoomable images and lifted videos retain the correct cursor.

### Security

- Escape attribute values in no-JavaScript fallbacks and reserialized component markup to prevent `</noscript>` breakout and HTML injection through media metadata or URLs.

### Documentation

- Document gallery gestures, slide-gap properties, carousel labeling, and continuous synchronization with the lightbox.
- Update video usage guidance for surface playback, silent-video controls, and privacy-enhanced YouTube embeds.
- Update zoom-indicator customization examples for integration-configured artwork and explicit indicator props.
- Document optional plugin installation, pnpm build-script approvals, and macOS-only Apple Photos support.
- Add cascade-layer and Tailwind CSS v4 setup guidance for placing `amk` above resets and below overriding layers.

### Maintenance

- Add the `modern-web-guidance` development skill with pnpm permissions and Knip configuration.
- Expand gallery, player, and accessibility regression coverage, including recorded Safari trackpad gestures, and stabilize browser tests on macOS and Ubuntu.

## [0.8.0] - 2026-11-11

### Added

- Add `mediaKit({ labels })` and the exported `LabelsConfig` type to customize control labels, slide announcements, and fallback text site-wide.
- Add `--amk-zoom-in-cursor` and `--amk-zoom-out-cursor` properties to customize page and lightbox cursors.
- Recognize `.aac`, `.m4v`, `.oga`, and `.ogv` as direct media sources.

### Changed

- **Breaking:** Replace `MediaTheme` and its `icon-*` slots with site-wide `mediaKit({ icons })` configuration accepting SVG files, file URLs, or markup; export `IconsConfig` and `MediaIconName` from `astro-media-kit`.
- Render video posters and initial times, plus video and audio control icons, before player scripts run; hide uninitialized audio popups.
- Keep images and videos opaque while opening and closing the lightbox, avoiding crossfades over page previews and video tint changes on return.
- Scale `ZoomLink` media to the link text's height during opening and closing animations.
- Update local audio styling to the Video.js 10.3 skin, with playback-speed labels that fit their buttons and revised theme colors.

### Fixed

- Keep page and lightbox cursors consistent with the available zoom or close action, including during transitions.
- Fix repeated carousel realignment and slide-position drift at fractional track widths.
- Stop swallowing the first page click after a touch drag dismisses the lightbox.
- Render caption content once so scripts required by nested components reach the page.
- Fix auto-import corrupting Astro files when media components appear in frontmatter.
- Account for 90-degree and 270-degree rotation metadata when sizing direct video files.
- Recognize Mux IDs of 40 to 64 characters and accept unrecognized identifiers when a video `service` is explicitly set.
- Use Mux asset metadata titles as default video labels.
- Reject non-page oEmbed responses before reading them as HTML, with guidance to use `service="local"` for direct media files.
- Treat protocol-relative media URLs as remote sources for CORS settings and probe their video metadata over HTTPS.
- Prevent lightbox preview styling and detection from interfering with a page's own `data-preview` attributes.
- Limit lazy media-source assignment to the kit's own audio and video markup.
- Keep zoom-enabled full-width images filling their columns even without a zoom indicator.
- Make touch taps reveal video controls instead of pausing playback.
- Preserve escaped ampersands in attributes when rewriting carousel slides, `ZoomLink` templates, oEmbed markup, and custom icons.
- Allow selecting carousel caption text without dragging the slide track.
- Hide inactive carousel buttons and dots when JavaScript is disabled while retaining native scrolling and snapping.
- Respect numeric `quality` values when encoding watermarked images.
- Keep gallery volume fades and restoration working when a new lightbox session begins before the previous session's fades finish.
- Omit empty playback-control groups from minimal players without lightbox zoom.
- Prevent thumbnails from shifting when lifted images return to elements with fractional pixel dimensions.
- Keep lifted media placeholders, previews, and return positions aligned with responsive page layouts after viewport resizing.

### Documentation

- Document the integration's `icons` and `labels` options with configuration examples, supported keys, defaults, and exported types.
- Update player and lightbox guidance for source inference, touch controls, pre-rendered UI, zoom cursors, and opening and closing animations.
- Correct the lightbox's browser requirements and clarify that oEmbed provider markup includes scripts.
- Correct `Carousel` prop documentation to state that `class` takes precedence over `className`.

### Maintenance

- Update `@astrojs/compiler-rs` to `^0.5.3`.
- Update the Astro development dependency to `^7.4.10` and simplify pnpm release-age and skill-directory settings.
- Remove unused player and lightbox code and distinguish internal zoom dimensions from zoom-button styling.
- Keep the retried player startup test first to accommodate intermittent WebKit video-load stalls on Linux.

## [0.7.1] - 2026-11-09

### Fixed

- Fix stuttering during lightbox gallery navigation by decoding larger images asynchronously and retaining previews and page thumbnails until replacements finish decoding.

### Maintenance

- Update `exiftool-vendored` to `^39.2.0`.

## [0.7.0] - 2026-11-07

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
- Add a Collapse button to lifted video controls and a `collapse` icon override for MediaTheme.
- Preserve decorative video-control previews in page thumbnails while their players are lifted.

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
- **Breaking:** **Breaking:** Raise the Astro peer requirement to `^7.4.7`.
- **Breaking:** **Breaking:** Make `transformAstroSource` synchronous and use Astro's Rust compiler, preserving unrelated source text and leaving parse errors for Astro to report.
- **Breaking:** **Breaking:** Restrict `MediaKitConfig.video` to booleans and credential services (`bunny`, `cloudflare`, and `mux`), individually or in arrays.
- Give minimal video players full playback controls in the lightbox and show an Expand button for zoom-enabled players with `controls="none"`.
- Toggle playback when full or minimal video surfaces are clicked or tapped, reserving lightbox opening for the Expand button.
- Match image zoom indicators to video Expand controls, sharing `icon-expand` artwork and player styling defaults.
- Use neutral grayscale media controls, smoother hover fades, and animated volume popups with matching slider handles.
- Give carousel dots larger, adjoining touch targets.

### Removed

- **Breaking:** Remove the deprecated `FallbackRules` alias; use `FormatRules`.
- **Breaking:** **Breaking:** Remove native fullscreen from `controls="minimal"`; use full controls with zoom disabled for native fullscreen.

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
- Preserve ICC color profiles and orientation when stripping image metadata, keeping wide-gamut colors and rotated or mirrored images intact.
- Stop lowercasing free-text credit labels such as `AI Render`.
- Warn about `backgroundDark` without `background` only in development.
- Declare `sharp` `^0.35.4` as an optional peer for watermarking instead of relying on dependency hoisting.
- Probe site-root video paths under the default `public/` directory to recover local video dimensions and duration.
- Recognize HTTP and HTTPS schemes case-insensitively when resolving audio and video sources.
- Apply Vimeo's initial mute setting and forward subsequent mute changes to its playback adapter.
- Delay audio source loading until player attachment so startup failures reach the player's error dialog.
- Fail rendering when Bunny, Cloudflare, or Mux credentials are missing instead of silently omitting videos from production builds.
- Prefer public Mux playback IDs when an asset also lists signed IDs that require unsupported token generation.
- Keep selector-based Picture themes synchronized with their original ancestors while lifted, restoring authored styles on return.
- Apply gallery volume fading and restoration to native audio and video elements used directly as lifted subjects.
- Keep lightbox navigation, zoom, and close buttons working without the Invoker Commands API.
- Keep lightbox video-control fades working in browsers without iterator helpers.
- Mark image links, ZoomLink anchors, and video Expand buttons as dialog openers for assistive technology.
- Preserve normal dialog focus restoration after pointer navigation and focus the selected gallery item after keyboard navigation.
- Synchronize page carousels during lightbox navigation and align clicked slides before measuring their opening transitions.
- Preserve the intended carousel slide during resize races and vertical page scrolling.
- Cancel mouse presses whose release occurred outside the track so later buttonless movement cannot start dragging media.
- Remove every stale slide when opening a new lightbox gallery.
- Avoid instantiating unrelated ZoomLink media when the lightbox backdrop is clicked during a transition.
- Let nested carousels show captions independently of their parent carousel.
- Keep carousel glides instant under reduced motion even when a custom duration is set on the carousel.
- Exclude CSS-hidden media from lightbox galleries.
- Keep zoom indicators anchored to image bounds in stretched layouts, visible above previews, and free of hover background flashes.
- Keep zoom cursors off video toolbars.
- Clip dragged carousel tracks within their viewport when pulled past either end.
- Keep matching video-toolbar controls and translucent backgrounds steady during lightbox crossfades.
- Prevent inactive gallery videos from reactivating the current video's lightbox toolbar.
- Keep paused video controls visible and prevent auto-hiding while hovering player controls or their popups.
- Keep volume popups open when muting and preserve slider arrow keys and popup Escape handling inside the lightbox.

### Documentation

- Document Carousel, ZoomLink, MediaTheme, image indicators, shared control styling, and the replacement lightbox's interactions and browser requirements.
- Correct image defaults, source requirements, provider configuration, no-JavaScript behavior, and public API descriptions; clarify that oEmbed HTML remains trusted provider content.
- Clarify original-image cleanup, build-only watermarking, English-only gallery labels, browser-test workflows, and third-party audio-skin attribution.
- Document player keyboard shortcuts, carousel Home/End navigation and glide timing, and additional video-control styling hooks.
- Explain direct-media range requests and the need for author-controlled source URLs during server rendering.
- Remove obsolete Astro Prettier plugin workaround guidance.

### Maintenance

- Migrate the Mux SDK dependency from `@mux/mux-node` to `@mux/ts` and refresh runtime dependencies.
- Add Playwright-backed Chromium, Firefox, and WebKit regression tests, expand image parity coverage, and stabilize cross-platform CI timing.
- Refresh development dependencies, pnpm, repository automation, and Video.js skill dependencies, pinning the skill source to a commit.
- Build during package preparation and publish through pnpm.
- Consolidate media, credential, and lightbox helpers, rename the oEmbed HTML normalizer, and remove unused helpers and the passthrough image endpoint.
- Ship the Apache license text for the vendored Video.js audio skin.
- Generate release changelogs with chagent during versioning and update the release-note extraction workflow.
- Pin the `@astrojs/astro2tsx` dependency on `@emnapi/runtime` to a compatible version to prevent contributor tooling crashes.

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
[0.7.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.6.0...v0.7.0
[0.7.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.7.0...v0.7.1
[0.8.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.7.1...v0.8.0
[0.9.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.8.0...v0.9.0
[0.10.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.9.0...v0.10.0
[0.10.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.10.0...v0.10.1
[0.11.0]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.10.1...v0.11.0
[0.11.1]: https://github.com/kitschpatrol/astro-media-kit/compare/v0.11.0...v0.11.1
