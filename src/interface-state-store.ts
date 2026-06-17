//
// interface-state-store.ts
//
// State Storage Class
// for interface.ts

import {
    isBrowser,
    stateManager,
    toHTML,
    type UIConfig,
    type UIValue
} from "./interface.js"

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