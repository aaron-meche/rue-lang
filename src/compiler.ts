// 
// Compiler
//
// Rue Lang
// by Aaron Meche
//

import {
    readFileText, writeFileText,
    stripLineComment, ensureSemicolon,
    extractFunctionCalls, compileCSSMap,
    mapID,
    countRueScopeDepth, normalizeRueObjectBody,
    resolveRueObjectProperty, resolveRueArrayItem,
    buildRunnableContext, resolveFunctionCalls,
    type RueFunctionSignature
} from './helpers.js';
import * as RueUIRuntime from './interface.js';

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type RueCallable = (...params: unknown[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
export type RueInterface = Record<string, unknown>
export type { RueFunctionSignature } from './helpers.js';
export interface RueFunctionDefinition {
    name: string
    params: string[]
    body: string[]
    function: RueCallable
}

//
// Main RueFile Class
export class RueFile {
    #rawText: string = ""               // Raw text content of imported file (.rue syntax)
    #cssOnion: string[] = []            // Reference used to track real-time css attribute tree
    #cssMap: RueCSSMap = {":root": []}  // JS Map that stores CSS data, pre-compilation
    #funcMap: RueFunctionMap = {}       // JS Map that stores JS functions defined in .rue
    #interface: RueInterface = {}       // JS object that stores the Rue Interface block
    #compiledCSS: string[] = []         // Array of compiled CSS lines ready to be joined.

    #inFunc: boolean = false            // Boolean to toggle function capture mode
    #funcSignature: RueFunctionSignature | null = null
    #funcBody: string[] = []            // Array to capture function body lines
    #funcDepth: number = 0              // Integer counter to handle nested functions

    #inInterface: boolean = false       // Boolean to toggle Interface capture mode
    #interfaceBody: string[] = []       // Array to capture Interface object lines
    #interfaceDepth: number = 0         // Integer counter to handle nested Interface values

    #errors: string[] = []              // Array for caught errors

    constructor(filepath?: string, autoCompile: boolean = true) {
        if (filepath)
            this.feed(readFileText(filepath), autoCompile)
        return
    }

    feed(string: string, autoCompile?: boolean): void {
        if (typeof string == "string")
            this.#rawText = string
        else this.#throwError("Feed", "first argument expected type string, not type " + typeof string)

        if (autoCompile)
            this.run()
        return
    }

    run(): void {
        // Reset Output
        this.#cssOnion = []
        this.#cssMap = { ":root": [] }
        this.#funcMap = {}
        this.#interface = {}
        this.#compiledCSS = []
        this.#inFunc = false
        this.#funcSignature = null
        this.#funcBody = []
        this.#funcDepth = 0
        this.#inInterface = false
        this.#interfaceBody = []
        this.#interfaceDepth = 0
        this.#errors = []
        // 01: Parse
        this.#parse()
        // 02: Compile
        this.#compile()
    }

    #throwError(label: string, error: unknown): void {
        let message = error instanceof Error ? error.message : String(error)
        this.#errors.push(label + ": " + message)
        console.error(label + ": " + message)
    }

    #parse(): void {
        let lineSplitText = this.#rawText?.split("\n")

        if (!lineSplitText) {
            this.#throwError("Parse", "issue encountered when splitting text input by line")
            return
        }

        for (let i = 0; i < lineSplitText.length; i++) {
            try {
                this.#processLine(stripLineComment(lineSplitText[i]).trim())
            }
            catch (error) {
                this.#throwError("line " + (i + 1), error)
            }
        }

        if (this.#inFunc)           { this.#throwError("Parse", "unclosed function block"); return }
        if (this.#inInterface)      { this.#throwError("Parse", "unclosed Interface block"); return }
        if (this.#cssOnion.length)  { this.#throwError("Parse", "unclosed style block"); return }
    }

    #compile(): void {
        this.#compiledCSS = compileCSSMap(this.#cssMap)
    }

    #processLine(line: string): void {
        if (!line) return

        let firstWord = line.split(" ")[0]

        if (this.#inFunc) {
            this.#processFunctionCaptureLine(line)
            return
        }

        if (this.#inInterface) {
            this.#processInterfaceCaptureLine(line)
            return
        }

        switch (firstWord) {
            // Comments
            case "//":
            case "<!--":
                return
            // Functions
            case "func":
            case "function":
            case "component":
                this.#beginFunctionCapture(line, firstWord)
                break
            // Interface
            case "Interface":
                this.#beginInterfaceCapture(line)
                break
            // CSS Styles
            default:
                this.#processStyleCaptureLine(line, firstWord)
                break
        }
    }

    #beginFunctionCapture(line: string, firstWord: string): void {
        let signature = extractFunctionCalls(line)?.[0]

        if (!signature?.name)    { this.#throwError(firstWord, "invalid function signature"); return }
        if (!line.includes("{")) { this.#throwError(signature.name, "missing opening brace"); return }

        this.#inFunc = true
        this.#funcSignature = signature
        this.#funcBody = []
        this.#funcDepth = 0
    }

    #processFunctionCaptureLine(line: string): void {
        let bodyLine = this.#resolveFunctionBodyLine(line)

        if (bodyLine == "}") {
            if (this.#funcDepth == 0) {
                this.#endFunctionCapture()
                return
            }
            this.#funcDepth--
            this.#funcBody.push(bodyLine)
            return
        }

        if (bodyLine.includes("}") && this.#funcDepth > 0) {
            this.#funcDepth--
            this.#funcBody.push(bodyLine)
            return
        }

        this.#funcBody.push(bodyLine)

        if (bodyLine.endsWith("{")) {
            this.#funcDepth++
        }
    }

    #resolveFunctionBodyLine(line: string): string {
        let params = (this.#funcSignature?.params || []).map(param => param.split("=")[0].trim())
        let property = resolveRueObjectProperty(line, params, Object.keys(RueUIRuntime), { skipQuotedKeys: true })

        if (!property) return line
        return property + ","
    }

    #endFunctionCapture(): void {
        try {
            if (!this.#funcSignature?.name) throw new Error("invalid function signature")

            let params = this.#funcSignature.params || []
            let capturedBody = this.#funcBody
            let runtimeNames = Object.keys(RueUIRuntime)
            let runtimeValues = Object.values(RueUIRuntime)
            let callable = new Function(...runtimeNames, ...params, capturedBody.join("\n"))

            this.#funcMap[this.#funcSignature.name] = {
                name: this.#funcSignature.name,
                params: params,
                body: capturedBody,
                function: ((...args: unknown[]) => callable(...runtimeValues, ...args)) as RueCallable,
            }
        }
        catch (error) {
            this.#throwError("add func", error)
        }

        this.#inFunc = false
        this.#funcSignature = null
        this.#funcBody = []
        this.#funcDepth = 0
    }

    #beginInterfaceCapture(line: string): void {
        if (!line.includes("{")) { this.#throwError("Interface", "missing opening brace"); return }

        this.#inInterface = true
        this.#interfaceBody = []
        this.#interfaceDepth = 0
    }

    #processInterfaceCaptureLine(line: string): void {
        if (line == "}" && this.#interfaceDepth == 0) {
            this.#endInterfaceCapture()
            return
        }

        this.#interfaceBody.push(this.#resolveInterfaceBodyLine(line))
        this.#interfaceDepth += countRueScopeDepth(line)
    }

    #resolveInterfaceBodyLine(line: string): string {
        let names = [...Object.keys(this.#funcMap), ...Object.keys(RueUIRuntime)]
        let property = resolveRueObjectProperty(line, names)

        if (property) return property
        return resolveRueArrayItem(line, names)
    }

    #endInterfaceCapture(): void {
        try {
            let context = buildRunnableContext(RueUIRuntime, this.#funcMap)
            let names = Object.keys(context)
            let values = Object.values(context)
            let body = this.#normalizeInterfaceBody().join("\n")
            let buildInterface = new Function(...names, "return ({\n" + body + "\n})")

            this.#interface = buildInterface(...values) as RueInterface
        }
        catch (error) {
            this.#throwError("Interface", error)
        }

        this.#inInterface = false
        this.#interfaceBody = []
        this.#interfaceDepth = 0
    }

    #normalizeInterfaceBody(): string[] {
        return normalizeRueObjectBody(this.#interfaceBody)
    }

    #processStyleCaptureLine(line: string, firstWord: string): void {
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
            if (this.#cssOnion.length) this.#cssOnion.pop()
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
        this.#cssOnion.push(selector)

        let currMapID = mapID(this.#cssOnion)
        if (!this.#cssMap[currMapID]) this.#cssMap[currMapID] = []
    }

    #addStyleDeclaration(line: string): void {
        this.#getCurrentStyleMap().push(this.#resolveString(ensureSemicolon(line)))
    }

    #getCurrentStyleMap(): string[] {
        let currMapID = mapID(this.#cssOnion) || ":root"
        if (!this.#cssMap[currMapID]) this.#cssMap[currMapID] = []

        return this.#cssMap[currMapID]
    }

    #defineCSSVar(line: string): void {
        let definition = line.replace(/^def\s+/, "")
        let varName = definition.split(":")[0]?.trim()
        let varValue = definition.slice(definition.indexOf(":") + 1).trim()

        if (!definition.includes(":") || !varName) return this.#throwError("var", "invalid variable definition")

        this.#cssMap[":root"].push(ensureSemicolon("--" + varName + ": " + this.#resolveString(varValue)))
    }

    #resolveString(line: string): string {
        if (line.includes("(") && line.includes(")")) {
            line = resolveFunctionCalls(line, this.#funcMap, error => this.#throwError("handleFunctionCalls", error))
        }
        return line
    }

    print(): void { console.log(this.#compiledCSS.join("\n")) }
    getCSS(): string { return this.#compiledCSS.join("\n") }
    getInterface(): RueInterface { return this.#interface }
    getErrors(): string[] { return this.#errors }
    output(path: string): void { writeFileText(path, this.#compiledCSS.join("\n")) }
}
