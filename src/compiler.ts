// 
// Compiler
//
// Rue Lang
// by Aaron Meche
//

import {
    readFileText, writeFileText,
    stripLineComment, ensureSemicolon,
    mapID,
    buildRunnableContext, resolveFunctionCalls,
    buildStateScript,
    type RueStateMap
} from './helpers.js';
import * as RueUIRuntime from './interface.js';
import { UIElement } from './interface.js';
import {
    captureRawJS, addFunction,
    getInterface as readInterface,
    type RueFunctionMap,
    type RueInterface,
    type RueReaderContext
} from './readers.js';

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type { RueFunctionSignature, RueStateMap } from './helpers.js';
export type { RueCallable, RueCapturedLine, RueFunctionDefinition, RueFunctionMap, RueInterface } from './readers.js';

//
// Main RueFile Class
export class RueFile {
    #rawText: string = ""               // raw file text content
    #styleStack: string[] = []          // active nested CSS selectors
    #cssMap: RueCSSMap = {":root": []}  // parsed CSS, pre compilation
    #funcMap: RueFunctionMap = {}       // parsed JS, funcs and signatures
    #stateMap: RueStateMap = {}         // live state variables and values
    #interface: RueInterface = []       // rue Interface stack
    #rawJS: string[] = []               // raw JS blocks inserted into HTML
    #compiledCSS: string[] = []         // compiled CSS
    #compiledHTML: string[] = []        // compiled HTML
    #currLineIndex: number = 0          // live index tracker for parser
    #errors: string[] = []              // error tracker

    constructor(filepath?: string, autoCompile: boolean = true) {
        if (filepath)
            this.feed(readFileText(filepath), autoCompile)
        return
    }

    feed(string: string, autoCompile: boolean = true): void {
        if (typeof string == "string")
            this.#rawText = string
        else this.#throwError("Feed", "first argument expected type string, not type " + typeof string)

        if (autoCompile)
            this.run()
        return
    }

    #throwError(label: string, error: unknown): void {
        let message = error instanceof Error ? error.message : String(error)
        let errorMessage = `[${label}] line ${this.#currLineIndex + 1}: ${message}`
        this.#errors.push(errorMessage)
        console.error(errorMessage)
    }

    run(): void {
        this.#reset()
        this.#parse()
        this.#compile()
    }
    
    #reset(): void {
        this.#styleStack = []
        this.#cssMap = {}
        this.#funcMap = {}
        this.#stateMap = {}
        this.#interface = []
        this.#rawJS = []
        this.#compiledCSS = []
        this.#compiledHTML = []
        this.#currLineIndex = 0
        this.#errors = []
        RueUIRuntime.resetStateRenderers()
    }

    #parse(): void {
        let lines = this.#rawText.split("\n")

        for (this.#currLineIndex = 0; this.#currLineIndex < lines.length; this.#currLineIndex++) {
            try {
                let line = stripLineComment(lines[this.#currLineIndex]).trim()
                if (!line) 
                    continue
                let firstWord = line.split(" ")[0]

                switch (firstWord) {
                    // Comments
                    case "//":
                    case "<!--":
                        continue
                    // Raw JavaScript
                    case "{":
                        captureRawJS(lines, this.#readerContext())
                        break
                    // State Variables
                    case "@state":
                        this.#newStateVariable(line)
                        break
                    // Functions
                    case "func":
                    case "function":
                    case "component":
                        addFunction(lines, this.#readerContext())
                        break
                    // Interface
                    case "Interface":
                        readInterface(lines, this.#readerContext())
                        break
                    // CSS Styles
                    default:
                        this.#processStyleLine(line, firstWord)
                        break
                }
            }
            catch (error) {
                this.#throwError("line " + (this.#currLineIndex + 1), error)
            }
        }

        if (this.#styleStack.length)  { this.#throwError("Parse", "unclosed style block"); return }
    }

    #compile(): void {
        let cssSelectors = Object.keys(this.#cssMap)
        for (let i = 0; i < cssSelectors.length; i++) {
            this.#compiledCSS.push(cssSelectors[i] + "{")
            this.#compiledCSS.push("\t" + (this.#cssMap[cssSelectors[i]] || []).join("\n\t"))
            this.#compiledCSS.push("}")
        }

        // Compile HTML
        let htmlBodyContent: string[] = [RueUIRuntime.toHTML(this.#interface)]
        let htmlScripts = [this.#buildStateScript(), this.#buildRawJSScript()].filter(Boolean).join("\n")

        // Check for Errors, (if) Insert into HTML
        if (this.#errors.length > 0) {
            let errorMessageArray: UIElement[] = []
            this.#errors.forEach(err => { 
                errorMessageArray.push(new UIElement({ 
                    padding: "1.2rem",
                    background: "rgb(60, 30, 30)",
                    content: err 
                }))
            })
            htmlBodyContent.push(new UIElement({
                width: "fit-content",
                display: "grid",
                gap: "0.8rem",
                padding: "2.4rem",
                background: "rgb(20, 0, 0)",
                color: "rgb(255, 230, 230)",
                content: errorMessageArray
            }).getHTML())
        }

        this.#compiledHTML = [
            `<!DOCTYPE html>`,
            `<html lang="en">`,
            `<head>`,
            `<meta charset="UTF-8">`,
            `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
            `<title>Document</title>`,
            `<style>`,
            `${this.#compiledCSS.join("\n")}`,
            `</style>`,
            `</head>`,
            `<body>`,
            `${htmlBodyContent.join("\n")}`,
            `${htmlScripts}`,
            `</body>`,
            `</html>`,
        ]
    }

    #newStateVariable(line: string): void {
        if (!line.includes("=")) { 
            this.#throwError("@state var", "missing '=' sign")
            return 
        }
        let equalIndex = line.indexOf("=")
        let variableName = line.slice(0, equalIndex).replace("@state", "").trim()
        let valueText = line.slice(equalIndex + 1).trim()

        try {
            this.#stateMap[variableName] = new Function("return (" + valueText + ")")()
        }
        catch {
            this.#stateMap[variableName] = valueText
        }
    }

    #buildStateScript(): string {
        return buildStateScript(this.#stateMap, RueUIRuntime.getStateRenderers())
    }

    #buildRawJSScript(): string {
        if (!this.#rawJS.length) return ""
        return `<script>\n${this.#rawJS.join("\n\n")}\n</script>`
    }

    #readerContext(): RueReaderContext {
        const compiler = this

        return {
            get currentLineIndex() { return compiler.#currLineIndex },
            set currentLineIndex(index: number) { compiler.#currLineIndex = index },
            rawJS: compiler.#rawJS,
            functionMap: compiler.#funcMap,
            setInterface(value) { compiler.#interface = value },
            throwError(label, error) { compiler.#throwError(label, error) },
            buildRunnableContext() { return compiler.#buildRunnableContext() }
        }
    }

    #buildRunnableContext(): Record<string, unknown> {
        return {
            ...buildRunnableContext(RueUIRuntime, this.#funcMap),
            Interface: this.#interface,
            __rueState: new RueUIRuntime.StateStore(this.#stateMap)
        }
    }

    #processStyleLine(line: string, firstWord: string): void {
        // Single-line style blocks are disabled for now.
        if (line.includes("{") && line.includes("}")) {
            this.#throwError("layer", "single-line style blocks are not supported")
        }
        // New Layer        e.g. : elem {
        else if (line.includes("{")) {
            this.#beginStyleLayer(line.replace("{", "").trim())
        }
        // Close Layer      e.g. : }
        else if (line == "}") {
            if (this.#styleStack.length) this.#styleStack.pop()
            else this.#throwError("layer", "unexpected closing brace")
        }
        // CSS Variable Def e.g. : def name: val
        else if (firstWord == "def") {
            this.#defineCSSVar(line)
        }
        // Key: Value       e.g. : background: red
        else if (line.includes(":")) {
            this.#addStyleDeclaration(line)
        }
    }

    #beginStyleLayer(selector: string): void {
        this.#styleStack.push(selector)

        let currMapID = mapID(this.#styleStack)
        if (!this.#cssMap[currMapID]) this.#cssMap[currMapID] = []
    }

    #addStyleDeclaration(line: string): void {
        this.#getCurrentStyleMap().push(this.#resolveStyleFunctions(ensureSemicolon(line)))
    }

    #getCurrentStyleMap(): string[] {
        let currMapID = mapID(this.#styleStack) || ":root"
        if (!this.#cssMap[currMapID]) this.#cssMap[currMapID] = []

        return this.#cssMap[currMapID]
    }

    #defineCSSVar(line: string): void {
        let definition = line.replace(/^def\s+/, "")
        let varName = definition.split(":")[0]?.trim()
        let varValue = definition.slice(definition.indexOf(":") + 1).trim()

        if (!definition.includes(":") || !varName)
            return this.#throwError("var", "invalid variable definition")
        if (!this.#cssMap[":root"])
            this.#cssMap[":root"] = []
        this.#cssMap[":root"].push(ensureSemicolon("--" + varName + ": " + this.#resolveStyleFunctions(varValue)))
    }

    #resolveStyleFunctions(line: string): string {
        if (!line.includes("(") || !line.includes(")")) return line

        return resolveFunctionCalls(line, this.#funcMap, error => {
            this.#throwError("handleFunctionCalls", error)
        })
    }

    print(): void { console.log(this.#compiledCSS.join("\n")) }
    getCSS(): string { return this.#compiledCSS.join("\n") }
    getInterface(): RueInterface { return this.#interface }
    getErrors(): string[] { return this.#errors }
    output(path: string): void { writeFileText(path, this.#compiledCSS.join("\n")) }
    getHTML(): string { return this.#compiledHTML.join("\n") }
}
