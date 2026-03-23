// Random useful things staged here until more specific grouping is warranted

import type { CollectionEntry, CollectionKey } from 'astro:content'
import { assert } from '@sindresorhus/is'
import get from 'lodash/get'
import { CONFIG } from '../constants'

type VisibilityOptions = 'featured' | 'hidden' | 'protected' | 'tbd' | 'visible'

export type ListProps<C extends CollectionKey> = {
	detailed?: boolean
	heading?: string
	items?: Array<CollectionEntry<C>>
	visibility?: VisibilityOptions | VisibilityOptions[] // Defaults to all
}

/**
 * TK
 */
export function byDate(
	keyPath = 'data.date',
): (a: Record<string, unknown>, b: Record<string, unknown>) => number {
	return (a, b) => {
		const aValue = get(a, keyPath)
		const bValue = get(b, keyPath)

		assert.date(aValue)
		assert.date(bValue)

		return (
			(dateRangeToSingleDate(bValue)!.getTime() || 0) -
			(dateRangeToSingleDate(aValue)!.getTime() || 0)
		)
	}
}

/**
 * Sort by rank
 * @public
 */
export function byRank(
	keyPath: string,
): (a: Record<string, unknown>, b: Record<string, unknown>) => number {
	return (a, b) => {
		const aValue = get(a, keyPath)
		const bValue = get(b, keyPath)

		assert.number(aValue)
		assert.number(bValue)

		return bValue - aValue
	}
}

/**
 * For use with getCollection
 */
export function byDraft(item: Record<string, unknown>): boolean {
	const draft = get(item, 'data.draft', false)
	return (
		!draft ||
		(CONFIG.showDraftsInDev && import.meta.env.DEV) ||
		(CONFIG.showDraftsInProd && import.meta.env.PROD)
	)
}

/**
 * For use with .filter
 */
export function byVisibility(visibility: undefined | VisibilityOptions | VisibilityOptions[]) {
	return (item: Record<string, unknown>) => {
		// Pass through all items if no visibility is specified
		if (visibility === undefined) {
			return true
		}

		const itemVisibility = get(item, 'data.visibility')
		if (typeof itemVisibility !== 'string') {
			return true
		}

		if (Array.isArray(visibility)) {
			return visibility.map((v) => v.toLowerCase()).includes(itemVisibility.toLowerCase())
		}

		return visibility.toLowerCase() === itemVisibility.toLowerCase()
	}
}

/**
 * TK
 */
export function assertExists<T>(result: T | undefined): T {
	if (result === undefined) {
		throw new Error('Received undefined')
	}

	return result
}

// Usage:
// talk.coPresenters.map(({ id }) => <Person {id} />).reduce(oxfordReducer, [])

/**
 * TK
 */
export function oxfordReducer(
	previous: unknown[],
	current: unknown,
	i: number,
	array: string | unknown[],
) {
	if (i === 0) return [current]
	if (array.length > 2 && i === array.length - 1) return [...previous, ', and ', current]
	if (array.length <= 2 && i === array.length - 1) return [...previous, ' and ', current]
	return [...previous, ', ', current]
}

// export function latestDate(...dates: (Date | null)[]): Date | null {
// 	const validDates = dates.filter((date) => date !== null) as Date[]
// 	if (validDates.length === 0) return null
// 	return new Date(Math.max(...validDates.map((date) => date.getTime())))
// }

/**
 * takes an arbitrary number of Date() objects, and returns the latest one that's not null,
 * or null if all the passed dates are null
 */
// export function latestDate(
// 	...dates: Array<Date | undefined | { end: Date | undefined; start: Date }>
// ): Date | undefined {
// 	let maxDate: Date | undefined

// 	for (const date of dates) {
// 		const thisDate = dateRangeToSingleDate(date)
// 		if (thisDate === undefined) continue
// 		if (maxDate === undefined || thisDate.getTime() > maxDate.getTime()) {
// 			maxDate = thisDate
// 		}
// 	}

// 	return maxDate
// }

/**
 * TK
 */
function dateRangeToSingleDate(
	date: Date | undefined | { start: Date | undefined; end: Date | undefined },
	strategy: 'earliest' | 'latest' = 'latest',
): Date | undefined {
	if (date === undefined) {
		return undefined
	}

	if ('start' in date && 'end' in date) {
		if (date.start !== undefined && date.end !== undefined) {
			switch (strategy) {
				case 'earliest': {
					return new Date(Math.min(date.start.getTime(), date.end.getTime()))
				}

				case 'latest': {
					return new Date(Math.max(date.start.getTime(), date.end.getTime()))
				}
			}
		} else if (date.start !== undefined && date.end === undefined) {
			return date.start
		} else if (date.start === undefined && date.end !== undefined) {
			return date.end
		}
	} else {
		return date
	}

	return undefined
}

/**
 * Takes raw dates or range objects from content collections
 */
export function dateFormat(
	date: Date | undefined | { start: Date; end: Date | undefined },
	style?: 'long' | 'short' | 'year' | 'yearMonth' | Intl.DateTimeFormatOptions,
): string | undefined {
	if (date === undefined) {
		return undefined
	}

	if ('start' in date && 'end' in date && date.end) {
		return `${dateFormat(date.start, style)} – ${dateFormat(date.end, style)}`
	}

	if ('start' in date) {
		return dateFormat(date.start, style)
	}

	let options = {}
	switch (style) {
		case 'long':
		case undefined: {
			options = { day: 'numeric', month: 'long', year: 'numeric' }
			break
		}

		case 'short': {
			options = { day: 'numeric', month: 'numeric', year: 'numeric' }
			break
		}

		case 'year': {
			options = { year: 'numeric' }
			break
		}

		case 'yearMonth': {
			options = { month: 'long', year: 'numeric' }
			break
		}

		default: {
			// Probably Intl.DateTimeFormatOptions
			options = style
			break
		}
	}

	return date.toLocaleString('en-US', options)
}
