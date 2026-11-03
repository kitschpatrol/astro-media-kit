import { clonePlaceholder } from './clone-placeholder'
import './control-preview.css'

// Resolve the page's presentation before the player acquires overlay styling.
// The copy contains ordinary elements only; none creates another player controller.
const properties = [
	'align-content',
	'align-items',
	'align-self',
	'background',
	'border',
	'border-radius',
	'box-shadow',
	'box-sizing',
	'bottom',
	'clip-path',
	'color',
	'column-gap',
	'display',
	'flex-basis',
	'flex-direction',
	'flex-grow',
	'flex-shrink',
	'flex-wrap',
	'font-family',
	'font-size',
	'font-style',
	'font-variant-numeric',
	'font-weight',
	'grid-template-columns',
	'grid-template-rows',
	'height',
	'justify-content',
	'justify-items',
	'justify-self',
	'left',
	'letter-spacing',
	'line-height',
	'margin',
	'max-height',
	'max-width',
	'min-height',
	'min-width',
	'opacity',
	'order',
	'overflow',
	'padding',
	'position',
	'right',
	'rotate',
	'row-gap',
	'scale',
	'text-align',
	'text-decoration',
	'top',
	'transform',
	'transform-origin',
	'translate',
	'vertical-align',
	'visibility',
	'white-space',
	'width',
	'z-index',
]

const svgProperties = [
	'color',
	'fill',
	'fill-opacity',
	'fill-rule',
	'opacity',
	'stroke',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-opacity',
	'stroke-width',
	'vector-effect',
]

const previews = new WeakMap<Element, { controller: AbortController; element: HTMLElement }>()

/**
 * Leave an inert picture of a lifted player's page controls above its
 * thumbnail.
 */
export function retainControlPreview(item: HTMLElement, subject: Element) {
	if (item.dataset.placeholder === 'none') {
		return
	}

	const controls = subject.querySelector<HTMLElement>('.amk-controls:not([popover])')
	if (controls === null) {
		return
	}

	const home = item.getBoundingClientRect()
	const bounds = controls.getBoundingClientRect()
	if (home.width <= 0 || home.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
		return
	}

	const controller = new AbortController()
	const copy = copyControl(controls, controller.signal)
	if (copy === undefined) {
		controller.abort()
		return
	}

	const element = document.createElement('div')
	element.className = 'amk-page-control-preview'
	element.ariaHidden = 'true'
	element.inert = true
	Object.assign(element.style, {
		height: `${(bounds.height / home.height) * 100}%`,
		left: `${((bounds.left - home.left) / home.width) * 100}%`,
		top: `${((bounds.top - home.top) / home.height) * 100}%`,
		width: `${(bounds.width / home.width) * 100}%`,
	})
	// The copy fills its independently fading surface. In particular, never
	// capture the inherited lifecycle filter from a newly active page item.
	Object.assign(copy.style, { height: '100%', inset: '0', width: '100%' })
	element.append(copy)
	item.append(element)
	previews.set(subject, { controller, element })
}

/** Remove the decorative controls when their original player returns. */
export function releaseControlPreview(subject: Element) {
	const preview = previews.get(subject)
	preview?.controller.abort()
	preview?.element.remove()
	previews.delete(subject)
}

function copyControl(source: Element, signal: AbortSignal): HTMLElement | undefined {
	if (source.matches('[data-popup], [popover], script, style, link, template')) {
		return undefined
	}

	const style = getComputedStyle(source)
	if (style.display === 'none') {
		return undefined
	}

	if (source instanceof SVGSVGElement) {
		const wrapper = clonePlaceholder(source, signal)
		if (wrapper === undefined) {
			return undefined
		}

		wrapper.style.display = 'contents'
		const originals = [source, ...source.querySelectorAll('*')]
		const copies = [...wrapper.querySelectorAll('*')]
		for (const [index, original] of originals.entries()) {
			const svg = copies[index]
			if (!(svg instanceof SVGElement)) {
				continue
			}

			const originalStyle = getComputedStyle(original)
			for (const property of svgProperties) {
				svg.style.setProperty(property, originalStyle.getPropertyValue(property))
			}
		}

		const svg = wrapper.firstElementChild
		if (svg instanceof SVGElement) {
			for (const property of properties) {
				svg.style.setProperty(property, style.getPropertyValue(property))
			}
		}

		return wrapper
	}

	const copy = document.createElement('span')
	for (const property of properties) {
		copy.style.setProperty(property, style.getPropertyValue(property))
	}

	preserveFluidSize(source, copy, style)
	for (const child of source.childNodes) {
		if (child.nodeType === Node.TEXT_NODE) {
			copy.append(document.createTextNode(child.textContent ?? ''))
		} else if (child instanceof Element) {
			const content = copyControl(child, signal)
			if (content !== undefined) {
				copy.append(content)
			}
		}
	}

	return copy
}

function preserveFluidSize(source: Element, copy: HTMLElement, style: CSSStyleDeclaration) {
	// Preserve the kit's fluid surfaces and slider fractions, rather than
	// freezing their computed pixels when the page resizes under the viewer.
	if (source.matches('.amk-bar, .amk-slider-track')) {
		copy.style.width = '100%'
	} else if (source.matches('.amk-center-play')) {
		copy.style.margin = 'auto'
	} else if (source.matches('.amk-slider-fill, .amk-slider-buffer, .amk-slider-thumb')) {
		const isBuffer = source.classList.contains('amk-slider-buffer')
		const fraction = style.getPropertyValue(
			isBuffer ? '--media-slider-buffer' : '--media-slider-fill',
		)
		if (fraction !== '') {
			copy.style.setProperty(
				source.classList.contains('amk-slider-thumb') ? 'left' : 'width',
				fraction,
			)
		}
	}
}
