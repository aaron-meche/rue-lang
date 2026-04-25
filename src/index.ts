// 
// Svelte Preprocessor
//
// Rue Lang
// by Aaron Meche
//

import { RueFile } from './compiler.js'

export { RueFile }

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

export default function runRue(): RuePreprocessor {
    return {
        style({ content, attributes }) {
            if (attributes.lang !== 'rue') return
            const compiler = new RueFile()
            compiler.feed(content)
            const css = compiler.getCSS()

            return { code: css }
        }
    }
}
