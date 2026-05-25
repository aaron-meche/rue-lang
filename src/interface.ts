//
// Rue UI Runtime
//
// TypeScript transition of the Ginger UI browser interface classes.
//

type UIValue = unknown
type UIContent = UIValue | UIContent[]
type UIConfig = Record<string, UIValue>
type UIHandler = (elem: HTMLElement) => void
type StateRenderer = () => UIContent

interface GingerUIRegistry {
    handlers: Map<string, UIHandler>
    hoverState: Map<string, string>
}

declare global {
    interface Window {
        gingerUIRegistry?: GingerUIRegistry
        clickRegistry?: Map<string, UIHandler>
        dispatchClick?: (id: string, elem: HTMLElement) => void
        dispatchHover?: (id: string, elem: HTMLElement) => void
        dispatchHoverOut?: (id: string, elem: HTMLElement) => void
    }
}

let stateManager: Record<string, StateRenderer> = {}
let stateRendererCounter = 0

export function getStateRenderers(): Record<string, string> {
    let renderers: Record<string, string> = {}

    Object.keys(stateManager).forEach(id => {
        renderers[id] = stateManager[id].toString()
    })

    return renderers
}

export function resetStateRenderers(): void {
    stateManager = {}
    stateRendererCounter = 0
}

const attributeKeys = new Set([
    "id",
    "class",
    "className",
    "href",
    "target",
    "rel",
    "alt",
    "title",
    "type",
    "role",
    "name",
    "value",
    "placeholder",
    "for",
    "tabindex"
])

function isBrowser(): boolean {
    return typeof document !== "undefined"
}

function escapeAttribute(value: UIValue): string {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}

export function toHTML(input: UIContent): string {
    if (input === null || input === undefined || input === false)
        return ""
    if (Array.isArray(input))
        return input.map(item => toHTML(item)).join("")
    if (typeof (input as { getHTML?: unknown })?.getHTML == "function") {
        return (input as { getHTML: () => string }).getHTML()
    }
    return String(input)
}

function checkWindowEventRegistry(): void {
    if (!window.gingerUIRegistry) {
        window.gingerUIRegistry = {
            handlers: new Map(),
            hoverState: new Map()
        }
    }
    if (!window.clickRegistry) {
        window.clickRegistry = window.gingerUIRegistry.handlers
    }
    if (!window.dispatchClick) {
        window.dispatchClick = (id, elem) => {
            let handler = window.gingerUIRegistry?.handlers.get(id)
            if (typeof handler == "function") handler(elem)
        }
    }
    if (!window.dispatchHover) {
        window.dispatchHover = (id, elem) => {
            let handler = window.gingerUIRegistry?.handlers.get(id)
            if (typeof handler == "function") {
                window.gingerUIRegistry?.hoverState.set(id, elem.style.cssText)
                handler(elem)
            }
        }
    }
    if (!window.dispatchHoverOut) {
        window.dispatchHoverOut = (id, elem) => {
            let originalStyle = window.gingerUIRegistry?.hoverState.get(id)
            if (originalStyle !== undefined) {
                elem.style.cssText = originalStyle
                window.gingerUIRegistry?.hoverState.delete(id)
            }
        }
    }
}

export class UIElement {
    tag = "div"
    src: string | null = null
    self = false
    content = ""
    format: UIConfig = {}
    attributes: UIConfig = {}
    behaviors: Record<string, string> = {}
    identifiers: UIConfig = {}

    protocols: Record<string, (input: UIValue) => void> = {
        tag: input => {
            this.tag = String(input)
        },
        self: input => {
            this.self = Boolean(input)
        },
        src: input => {
            this.src = String(input)
        },
        attrs: input => {
            this.setAttributes(input as UIConfig)
        },
        attributes: input => {
            this.setAttributes(input as UIConfig)
        },
        aria: input => {
            Object.keys((input as UIConfig) ?? {}).forEach(key => {
                this.attributes[`aria-${key.replaceAll("_", "-")}`] = (input as UIConfig)[key]
            })
        },
        data: input => {
            Object.keys((input as UIConfig) ?? {}).forEach(key => {
                this.attributes[`data-${key.replaceAll("_", "-")}`] = (input as UIConfig)[key]
            })
        },
        place: input => {
            let split = String(input).trim().split(" ")
            if (split.length == 1) {
                this.format.top = input
                this.format.left = input
            }
            else if (split.length == 2) {
                this.format.top = split[0]
                this.format.left = split[1]
            }
            else throw new Error("unsupported 'place' input")
        },
        size: input => {
            let split = String(input).trim().split(" ")
            if (split.length == 1) {
                this.format.height = input
                this.format.width = input
            }
            else if (split.length == 2) {
                this.format.height = split[0]
                this.format.width = split[1]
            }
            else throw new Error("unsupported 'size' input")
        },
        onhover: input => {
            if (!isBrowser()) {
                let handler = typeof input == "function" ? input.toString() : String(input)
                this.behaviors.onmouseenter = `this.dataset.rueHoverStyle=this.style.cssText;(${handler})(this);`
                this.behaviors.onmouseleave = `if(this.dataset.rueHoverStyle!==undefined){this.style.cssText=this.dataset.rueHoverStyle;delete this.dataset.rueHoverStyle;}`
                return
            }

            checkWindowEventRegistry()
            let id = "hov_" + Math.random().toString(36).substring(2, 11)
            window.gingerUIRegistry?.handlers.set(id, input as UIHandler)
            this.behaviors.onmouseenter = `window.dispatchHover('${id}', this);`
            this.behaviors.onmouseleave = `window.dispatchHoverOut('${id}', this);`
        },
        onclick: input => {
            if (!isBrowser()) {
                let handler = typeof input == "function" ? input.toString() : String(input)
                this.behaviors.onclick = `(${handler})(this);`
                return
            }

            checkWindowEventRegistry()
            let id = "clk_" + Math.random().toString(36).substring(2, 11)
            window.gingerUIRegistry?.handlers.set(id, input as UIHandler)
            this.behaviors.onclick = `window.dispatchClick('${id}', this);`
        },
        contains: input => {
            this.content = toHTML(input)
        },
        content: input => {
            if (typeof input == "function") {
                let id = "state_" + stateRendererCounter++
                let renderer = input as StateRenderer
                this.content = toHTML(renderer())
                this.identifiers.live_state = id
                stateManager[id] = renderer
                return
            }

            this.content = toHTML(input)
        }
    }

    constructor(config: UIConfig = {}) {
        let configKeys = Object.keys(config ?? {})
        for (let i = 0; i < configKeys.length; i++) {
            let currConfigKey = configKeys[i]
            let currConfigValue = config[currConfigKey]

            // First, check protocols for key
            if (this.protocols[currConfigKey]) {
                this.protocols[currConfigKey](currConfigValue)
            }
            // Next, check attributes for key
            else if (attributeKeys.has(currConfigKey)) {
                this.attributes[currConfigKey === "className" ? "class" : currConfigKey] = currConfigValue
            }
            // Then, set format value at key
            else {
                this.format[currConfigKey] = currConfigValue
            }
        }
    }

    setAttributes(input: UIConfig = {}): void {
        Object.keys(input ?? {}).forEach(key => {
            this.attributes[key === "className" ? "class" : key] = input[key]
        })
    }

    getStyle(): string {
        let returnString = ""
        Object.keys(this.format).forEach(attr => {
            let value = this.format[attr]
            if (value === null || value === undefined || value === false) return
            returnString += `${attr.replaceAll("_", "-")}:${value};`
        })
        return returnString
    }

    getBehaviorString(): string {
        let returnString = ""
        Object.keys(this.behaviors).forEach(behavior => {
            returnString += ` ${behavior}="${escapeAttribute(this.behaviors[behavior])}"`
        })
        return returnString
    }

    getAttributeString(): string {
        let attrs = {
            ...this.attributes,
            ...this.identifiers
        }

        let returnString = ""
        Object.keys(attrs).forEach(attr => {
            let value = attrs[attr]
            if (value === null || value === undefined || value === false) return
            if (value === true) {
                returnString += ` ${attr}`
                return
            }
            returnString += ` ${attr}="${escapeAttribute(value)}"`
        })
        return returnString
    }

    getHTML(): string {
        let style = this.getStyle()
        let src = this.src ? ` src="${escapeAttribute(this.src)}"` : ""
        let styleAttribute = style ? ` style="${escapeAttribute(style)}"` : ""
        let openingTag = `<${this.tag}${src}${styleAttribute}${this.getAttributeString()}${this.getBehaviorString()}>`

        if (this.self) return openingTag
        return `${openingTag}${this.content}</${this.tag}>`
    }
}

export class Image extends UIElement {
    constructor(imgURL: string, config: UIConfig = {}) {
        super({
            ...config,
            src: imgURL
        })
        this.tag = "img"
        this.self = true
    }
}

export class Button extends UIElement {
    constructor(content: UIContent, config: UIConfig = {}) {
        super({
            ...config,
            content: content
        })
        this.tag = "button"
    }
}

export class Rectangle extends UIElement {
    constructor(config: UIConfig = {}) {
        super(config)
    }
}

export class Component extends UIElement {
    constructor(content: unknown, config: UIConfig = {}) {
        super({
            ...config,
            content: content
        })
    }
}

export class HStack extends UIElement {
    constructor(elements: UIContent[], config: UIConfig = {}) {
        super({
            ...config,
            display: "grid",
            grid_template_columns: config.grid_template_columns ?? `repeat(${elements.length}, 1fr)`,
            content: elements
        })
    }
}

export class VStack extends UIElement {
    constructor(elements: UIContent[], config: UIConfig = {}) {
        super({
            ...config,
            display: "grid",
            grid_template_rows: config.grid_template_rows ?? `repeat(${elements.length}, auto)`,
            content: elements
        })
    }
}

export class Wrapper extends UIElement {
    constructor(content: UIContent, config: UIConfig = {}) {
        super({
            ...config,
            content: content
        })
    }
}

export class StateStore {
    #data: UIConfig = {}

    constructor(init?: UIConfig) {
        if (init) this.#data = init
    }

    #updateUI(): void {
        if (!isBrowser()) return
        document.querySelectorAll("[live_state]").forEach(elem => {
            let stateId = elem.getAttribute("live_state")
            if (stateId && typeof stateManager[stateId] == "function") {
                elem.innerHTML = toHTML(stateManager[stateId]())
            }
        })
    }

    set(key: string, val: UIValue): void {
        this.#data[key] = val
        this.#updateUI()
    }

    get(key: string): UIValue {
        return this.#data?.[key]
    }

    update(callback?: (data: UIConfig) => UIConfig | void): void {
        if (!callback) {
            this.#updateUI()
            return
        }

        let response = callback(this.#data)
        if (response) {
            this.#data = response
            this.#updateUI()
            return
        }

        throw new Error("Error during state update")
    }
}

export const classes: Record<string, UIConfig> = {
    heading: {
        font_size: "2.4rem",
        font_weight: "700"
    },
    center: {
        display: "flex",
        align_items: "center",
        justify_content: "center"
    },
    mutedUppercase: {
        font_size: "0.9rem",
        font_weight: "700",
        text_transform: "uppercase",
        letter_spacing: "0.3pt",
        opacity: 0.6
    }
}
