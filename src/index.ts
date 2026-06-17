//
// Package Entry
//
// Rue Lang
// by Aaron Meche
//

import { RueFile } from './compiler.js'
import { RueRouter } from './router.js'

export { RueFile, RueRouter }
export * from './interface.js'
export * from './interface-components.js'
export * from './router.js'

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

export function ruePreprocess(): RuePreprocessor {
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
