//
// Vite Plugin
//
// Rue Lang
// by Aaron Meche
//

import { RueFile } from "./compiler.js"

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
    transform(code: string, id: string): { code: string, map: null } | null
    handleHotUpdate(context: RueViteHotUpdateContext): void
}

function stripQuery(id: string): string {
    let queryIndex = id.indexOf("?")
    return queryIndex == -1 ? id : id.slice(0, queryIndex)
}

function isRueId(id: string): boolean {
    return stripQuery(id).endsWith(".rue")
}

export default function ruePlugin(): RueVitePlugin {
    return {
        name: 'rue-vite-plugin',
        enforce: 'pre',

        transform(code, id) {
            if (!isRueId(id)) return null

            const compiler = new RueFile()
            compiler.feed(code)
            const css = compiler.getCSS()
            const cleanId = stripQuery(id)

            return { 
                code: `
                if (typeof document !== 'undefined') {
                    const __id = ${JSON.stringify(cleanId)};
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
            if (isRueId(file)) {
                server.ws.send({ type: 'full-reload' })
            }
        }
    }
}
