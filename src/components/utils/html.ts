/**
 * The part of a parsed node this module reads, as linkedom and browsers both
 * have it.
 */
type ParsedNode = {
	attributes?: Iterable<{ value: string }>
	childNodes: Iterable<ParsedNode>
	nodeType: number
}

const ESCAPED_CHARACTER_RE = /[&<>]/v

/**
 * Make ready to write out again the markup parsed under `parent`. linkedom
 * writes an attribute's value back escaping only its quotes. Text such as
 * `&amp;copy;` would come back as the character reference `&copy;`, and a `<`
 * would come back raw, which inside a `<noscript>` ends it early for a browser
 * running scripts: that browser reads the element as text up to the first
 * `</noscript>`, attribute values included, and parses the rest as markup.
 * Escaping `&`, `<`, and `>` in the tree first keeps the markup as it was
 * written. Call it after reading any attribute, whose value it changes.
 *
 * Walks child nodes rather than selecting elements, to reach the content of
 * templates.
 */
export function escapeAttributeValues(parent: ParsedNode): void {
	for (const node of parent.childNodes) {
		if (node.nodeType !== 1) {
			continue
		}

		const attributes = node.attributes ?? []
		for (const attribute of attributes) {
			if (ESCAPED_CHARACTER_RE.test(attribute.value)) {
				attribute.value = attribute.value
					.replaceAll('&', '&amp;')
					.replaceAll('<', '&lt;')
					.replaceAll('>', '&gt;')
			}
		}

		escapeAttributeValues(node)
	}
}
