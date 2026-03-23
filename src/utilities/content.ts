import type { CollectionEntry, CollectionKey } from 'astro:content'
import is from '@sindresorhus/is'
import { getCollection } from 'astro:content'
import { z } from 'astro/zod'
import GithubSlugger from 'github-slugger'
import camelCase from 'lodash/camelCase'

function transformWikiLink(link: string): string {
	if (!link.startsWith('[[') || !link.endsWith(']]')) {
		return link
	}

	// Remove the surrounding [[ and ]]
	const inner = link.slice(2, -2)
	// Split by the optional alias pipe
	const [pathPart] = inner.split('|')
	// Split the path into segments and take the last one

	if (pathPart === undefined) {
		throw new Error(`Invalid wiki link format: ${link}`)
	}

	const segments = pathPart.split('/')
	const finalSegment = segments.at(-1)

	if (finalSegment === undefined) {
		throw new Error(`Invalid wiki link format: ${link}`)
	}

	// Create a fresh instance of GithubSlugger and generate the slug
	const slugger = new GithubSlugger()
	return slugger.slug(finalSegment)
}

function wikiLinkToSlug(input: unknown): unknown {
	if (typeof input === 'string') {
		return transformWikiLink(input)
	}
	if (Array.isArray(input)) {
		return input.map((item) =>
			typeof item === 'string' ? transformWikiLink(item) : (item as unknown),
		)
	}
	return input
}

/**
 * Creates a preprocessed Zod schema that transforms object keys to camelCase,
 * converts null values to undefined, and converts WikiLink references into
 * slugs which will match IDs from other content collections.
 */
export function transformObsidianSchema<T extends z.ZodRawShape>(shape: T) {
	return z.preprocess((data) => {
		if (typeof data !== 'object' || data === null) return data
		const newData: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(data)) {
			// Also turn any WikiLinks (references) into slugs
			newData[camelCase(key)] = value === null ? undefined : wikiLinkToSlug(value)
		}

		return newData
	}, z.object(shape))
}

/**
 * Gets all entries from a specific collection that reference the provided item ID
 * @param collectionName - The name of the collection to search in
 * @param referenceField - The field name that contains the reference
 * @param itemId - The ID of the item to find references to, this is usually the data.meta.id, not the MDX file's id!
 * @returns Array of collection entries that reference the specified item
 * @example
 * // Find all awards that reference a specific project
 * const linkedAwards = await getLinked('awards', 'project', project.data.meta.id)
 */
export async function getLinked<T extends CollectionKey>(
	collectionName: T,
	referenceField: string,
	itemId: string,
): Promise<Array<CollectionEntry<T>>> {
	// Get all entries from the specified collection
	const allEntries = await getCollection(collectionName)

	// Filter entries that reference the specified item
	return allEntries.filter((entry) => {
		const data = entry.data as Record<string, unknown>
		const fieldValue = data[referenceField]

		// Handle case where reference field contains a single string ID
		if (typeof fieldValue === 'string') {
			return fieldValue === itemId
		}

		// Handle case where reference field contains an array of IDs
		if (Array.isArray(fieldValue)) {
			if (fieldValue.length === 0) return false

			// Handle array of strings
			if (typeof fieldValue[0] === 'string') {
				return fieldValue.includes(itemId)
			}

			// Handle array of objects with id properties
			if (typeof fieldValue[0] === 'object' && fieldValue[0]) {
				return fieldValue.some((ref) => {
					if (is.plainObject(ref) && 'id' in ref && typeof ref.id === 'string') {
						return ref.id === itemId
					}
					return false
				})
			}
		}

		// Handle case where reference field is an object with an id property
		if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
			return 'id' in fieldValue && fieldValue.id === itemId
		}

		return false
	})
}

/**
 * Creates a date range object from a start and end date
 * @param start - The start date
 * @param end - The end date
 * @returns The date range object if both start and end are defined, or just the start date  or undefined if start is undefined
 */
export function createDateRange(
	start?: Date,
	end?: Date,
): Date | undefined | { start: Date; end: Date } {
	if (start === undefined) return undefined
	if (end === undefined) return start
	return {
		start,
		end,
	}
}
