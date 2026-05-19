declare module "fs" {
	interface Dirent {
		name: string
		isDirectory(): boolean
	}

	const fs: {
		readFileSync(path: string, encoding: string): string
		writeFileSync(path: string, content: string): void
		mkdirSync(path: string, options?: { recursive?: boolean }): void
		existsSync(path: string): boolean
		readdirSync(path: string, options: { withFileTypes: true }): Dirent[]
	}

	export default fs
}

declare module "path" {
	const path: {
		dirname(path: string): string
		join(...paths: string[]): string
		relative(from: string, to: string): string
		resolve(...paths: string[]): string
		sep: string
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
