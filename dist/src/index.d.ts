import { RueFile } from './compiler.js';
export { RueFile };
export interface RuePreprocessorResult {
    code: string;
}
export interface RuePreprocessorStyleArgs {
    content: string;
    attributes: Record<string, string | boolean | undefined>;
}
export interface RuePreprocessor {
    style(args: RuePreprocessorStyleArgs): RuePreprocessorResult | void;
}
export default function runRue(): RuePreprocessor;
//# sourceMappingURL=index.d.ts.map