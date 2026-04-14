/**
 * Resolve scoped galleries by finding ancestors matching CSS selectors and
 * suffixing gallery names with unique IDs per ancestor. This prevents galleries
 * from forming across scope boundaries.
 *
 * Mutates `data-pswp-gallery` on elements with `data-pswp-scope`. Elements
 * without a gallery name (standalone `zoom={true}`) get a synthetic base name
 * so they group within the scope instead of being standalone.
 *
 * Must run before gallery collection in lightbox initialization.
 */
export function resolveScopedGalleries(root: ParentNode = document): void {
	const scopeAncestorIds = new Map<Element, number>()
	let nextScopeId = 0

	for (const element of root.querySelectorAll<HTMLElement>('.pswp-zoom[data-pswp-scope]')) {
		const scope = element.dataset.pswpScope!
		const ancestor = element.closest(scope)
		if (!ancestor) {
			console.warn(
				`[astro-media-kit] zoomScope "${scope}" matched no ancestor for element — falling back to standalone.`,
			)
			continue
		}

		if (!scopeAncestorIds.has(ancestor)) {
			scopeAncestorIds.set(ancestor, nextScopeId++)
		}

		const ancestorId = scopeAncestorIds.get(ancestor)!
		const baseName = element.dataset.pswpGallery ?? '__scoped'
		element.dataset.pswpGallery = `${baseName}__scope_${String(ancestorId)}`
	}
}
