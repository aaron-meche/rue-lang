export interface RuePreprocessorResult {
	code: string
}

export interface RuePreprocessorStyleArgs {
	content: string
	attributes: Record<string, string | boolean | undefined>
}

export interface RuePreprocessor {
	style(args: RuePreprocessorStyleArgs): RuePreprocessorResult | void
}

export declare class RueFile {
	constructor(filepath?: string, doNotCompile?: boolean)
	feed(content: string, doNotCompile?: boolean): void
	run(): void
	print(): void
	getCSS(): string
	getErrors(): string[]
	output(path: string): void
}

declare function runRue(): RuePreprocessor
export default runRue
