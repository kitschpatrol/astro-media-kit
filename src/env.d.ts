// eslint-disable-next-line ts/triple-slash-reference -- must use triple-slash to keep this as an ambient declaration file (import would make it a module)
/// <reference types="astro/client" />

// Allow tsc to resolve .astro file imports.
// Astro's own type checker (astro check) handles full type validation of these files.
declare module '*.astro' {
	type Props = Record<string, unknown>
	const component: (props: Props) => unknown
	export default component
	export type { Props }
}
