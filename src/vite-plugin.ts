//
// Vite Plugin
//
// Rue Lang
// by Aaron Meche
//

import { RueFile } from "./compiler.js"
import path from 'path'

export interface RueViteResolveContext {
    id: string
    importer?: string
}

export interface RueViteHotUpdateContext {
    file: string
    server: {
        ws: {
            send(message: { type: string }): void
        }
    }
}

export interface RueVitePlugin {
    name: string
    enforce: "pre"
    resolveId(id: string, importer?: string): string | void
    transform(code: string, id: string): { code: string, map: null } | null
    handleHotUpdate(context: RueViteHotUpdateContext): void
}

export default function ruePlugin(): RueVitePlugin {
    return {
        name: 'rue-vite-plugin',
        enforce: 'pre',

        resolveId(id, importer) {
            if (id.endsWith('.rue')) {
                if (!importer) return path.resolve(id)
                return path.resolve(path.dirname(importer), id)
            }
        },

        transform(code, id) {
            if (!id.endsWith('.rue')) return null

            const compiler = new RueFile(id)
            const css = compiler.getCSS()

            return { 
                code: `
                if (typeof document !== 'undefined') {
                    const __id = ${JSON.stringify(id)};
                    let el = document.querySelector(\`style[data-rue="\${__id}"]\`)
                    if (!el) {
                    el = document.createElement('style')
                    el.setAttribute('data-rue', __id)
                    document.head.appendChild(el)
                    }
                    el.textContent = ${JSON.stringify(css)};
                }`, 
                map: null 
            }
        },

        handleHotUpdate({ file, server }) {
            if (file.endsWith('.rue')) {
                server.ws.send({ type: 'full-reload' })
            }
        }
    }
}
