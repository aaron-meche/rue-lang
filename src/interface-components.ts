//
// interface-components.ts
//
// RueUI Components
// for interface.ts
//

import { 
    UIElement,
    type UIConfig,
    type UIContent 
} from "./interface.js"

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