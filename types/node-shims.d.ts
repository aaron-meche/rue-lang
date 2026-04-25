declare module "fs" {
	const fs: {
		readFileSync(path: string, encoding: string): string
		writeFileSync(path: string, content: string): void
		mkdirSync(path: string, options?: { recursive?: boolean }): void
	}

	export default fs
}

declare module "path" {
	const path: {
		dirname(path: string): string
		resolve(...paths: string[]): string
	}

	export default path
}

declare module "url" {
	export function fileURLToPath(url: string): string
}

declare module "node:assert/strict" {
	const assert: {
		ok(value: unknown, message?: string): asserts value
		equal(actual: unknown, expected: unknown, message?: string): void
	}

	export default assert
}

declare const process: {
	exitCode?: number
}
