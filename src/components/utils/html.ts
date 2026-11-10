/**
 * The part of a parsed node this module reads, as linkedom and browsers both
 * have it.
 */
type ParsedNode = {
	attributes?: Iterable<{ value: string }>
	childNodes: Iterable<ParsedNode>
	nodeType: number
}

/**
 * Make ready to write out again the markup parsed under `parent`. linkedom
 * writes an attribute's value back without escaping its ampersands, so text
 * such as `&amp;copy;` would come back as the character reference `&copy;`.
 * Escaping them in the tree first keeps the markup as it was written. Call it
 * after reading any attribute, whose value it changes.
 *
 * Walks child nodes rather than selecting elements, to reach the content of
 * templates.
 */
export function escapeAttributeAmpersands(parent: ParsedNode): void {
	for (const node of parent.childNodes) {
		if (node.nodeType !== 1) {
			continue
		}

		const attributes = node.attributes ?? []
		for (const attribute of attributes) {
			if (attribute.value.includes('&')) {
				attribute.value = attribute.value.replaceAll('&', '&amp;')
			}
		}

		escapeAttributeAmpersands(node)
	}
}
