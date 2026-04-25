// 
// Rue Programming Language
// Svelte Preprocessor
//
// by Aaron Meche
//
import { RueFile } from './compiler.js'

export { RueFile }

export default function runRue() {
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
