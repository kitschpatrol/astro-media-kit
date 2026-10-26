/**
 * The lightbox's client entry, loaded by `<Zoomer>` on pages that have a
 * zoom-enabled component. Astro runs it once per page load, and its document
 * listeners survive client-side navigation.
 */
import { installLightbox } from './lightbox'

installLightbox()
