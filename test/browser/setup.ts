import { buildFixture } from '../parity/helpers/build-fixture'

/** Build the Astro fixture whose pages and assets the browser tests load. */
export default async function setup(): Promise<void> {
	await buildFixture('core-image')
}
