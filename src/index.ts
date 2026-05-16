//
// Package Entry
//
// Rue Lang
// by Aaron Meche
//

import { RueFile } from './compiler.js'
import createRueVitePlugin, { type RueVitePlugin } from './vite-plugin.js'

export { RueFile }
export * from './interface.js'

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

export interface RuePluginToolkit extends RuePreprocessor, RueVitePlugin {}

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

export const ruePlugin = createRueVitePlugin

export function runRue(): RuePluginToolkit {
    return {
        ...createRueVitePlugin(),
        ...ruePreprocess(),
    }
}

export default runRue
