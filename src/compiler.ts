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
    countRueScopeDepth,
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
        this.#reset()
        this.#parse()
        this.#compile()
    }

    #throwError(label: string, error: unknown): void {
        let message = error instanceof Error ? error.message : String(error)
        this.#errors.push(label + ": " + message)
        console.error(label + ": " + message)
    }

    #reset(): void {
        this.#cssOnion = []
        this.#cssMap = { ":root": [] }
        this.#funcMap = {}
        this.#interface = {}
        this.#compiledCSS = []
        this.#errors = []
    }

    #parse(): void {
        let lineSplitText = this.#rawText?.split("\n")

        if (!lineSplitText) {
            this.#throwError("Parse", "issue encountered when splitting text input by line")
            return
        }

        for (let i = 0; i < lineSplitText.length; i++) {
            try {
                let line = stripLineComment(lineSplitText[i]).trim()
                if (!line) continue

                let firstWord = line.split(" ")[0]

                switch (firstWord) {
                    // Comments
                    case "//":
                    case "<!--":
                        continue
                    // Functions
                    case "func":
                    case "function":
                    case "component":
                        i += this.#captureFunction(lineSplitText, i, firstWord)
                        break
                    // Interface
                    case "Interface":
                        i += this.#captureInterface(lineSplitText, i)
                        break
                    // CSS Styles
                    default:
                        this.#processStyleCaptureLine(line, firstWord)
                        break
                }
            }
            catch (error) {
                this.#throwError("line " + (i + 1), error)
            }
        }

        if (this.#cssOnion.length)  { this.#throwError("Parse", "unclosed style block"); return }
    }

    #compile(): void {
        this.#compiledCSS = compileCSSMap(this.#cssMap)
    }

    #captureFunction(lines: string[], startIndex: number, firstWord: string): number {
        let startLine = stripLineComment(lines[startIndex]).trim()
        let signature = extractFunctionCalls(startLine)?.[0]
        let body: string[] = []
        let depth = 0

        if (!signature?.name)    { this.#throwError(firstWord, "invalid function signature"); return 0 }
        if (!startLine.includes("{")) { this.#throwError(signature.name, "missing opening brace"); return 0 }

        let paramNames = signature.params.map(param => param.split("=")[0].trim())

        for (let i = startIndex + 1; i < lines.length; i++) {
            let rawLine = stripLineComment(lines[i]).trim()
            if (!rawLine) continue

            if (rawLine == "}") {
                if (depth == 0) {
                    try {
                        let params = signature.params || []
                        let runtimeNames = Object.keys(RueUIRuntime)
                        let runtimeValues = Object.values(RueUIRuntime)
                        let callable = new Function(...runtimeNames, ...params, body.join("\n"))

                        this.#funcMap[signature.name] = {
                            name: signature.name,
                            params: params,
                            body: body,
                            function: ((...args: unknown[]) => callable(...runtimeValues, ...args)) as RueCallable,
                        }
                    }
                    catch (error) {
                        this.#throwError("add func", error)
                    }

                    return i - startIndex
                }
                depth--
                body.push(this.#compileRueObjectLine(rawLine, paramNames))
                continue
            }

            let bodyLine = this.#compileRueObjectLine(rawLine, paramNames)

            if (rawLine.includes("}") && depth > 0) {
                depth--
                body.push(bodyLine)
                continue
            }

            body.push(bodyLine)

            if (rawLine.endsWith("{")) {
                depth++
            }
        }

        this.#throwError("Parse", "unclosed function block")
        return lines.length - startIndex - 1
    }

    #captureInterface(lines: string[], startIndex: number): number {
        let line = stripLineComment(lines[startIndex]).trim()

        if (!line.includes("{")) { this.#throwError("Interface", "missing opening brace"); return 0 }

        let body: string[] = []
        let depth = 0
        let knownNames = [...Object.keys(this.#funcMap), ...Object.keys(RueUIRuntime)]

        for (let i = startIndex + 1; i < lines.length; i++) {
            let bodyLine = stripLineComment(lines[i]).trim()
            if (!bodyLine) continue

            if (bodyLine == "}" && depth == 0) {
                try {
                    let context = buildRunnableContext(RueUIRuntime, this.#funcMap)
                    let contextNames = Object.keys(context)
                    let values = Object.values(context)
                    let interfaceBody = body.join("\n")
                    let buildInterface = new Function(...contextNames, "return ({\n" + interfaceBody + "\n})")

                    this.#interface = buildInterface(...values) as RueInterface
                }
                catch (error) {
                    this.#throwError("Interface", error)
                }

                return i - startIndex
            }

            body.push(this.#compileRueObjectLine(bodyLine, knownNames))
            depth += countRueScopeDepth(bodyLine)
        }

        this.#throwError("Parse", "unclosed Interface block")
        return lines.length - startIndex - 1
    }

    #compileRueObjectLine(line: string, localNames: string[]): string {
        let raw = line.trim()
        if (!raw) return line

        if (raw.endsWith(",")) raw = raw.slice(0, -1).trim()

        if (raw == "}" || raw == "]") return raw + ","
        if (raw.startsWith("return ") || raw.endsWith("{") || raw.endsWith("[")) return line
        if (raw.includes("}")) return line

        let knownNames = new Set([...localNames, ...Object.keys(RueUIRuntime)])
        let compileValue = (value: string): string => {
            let isJavascriptValue =
                value[0] == "\"" ||
                value[0] == "'" ||
                value[0] == "`" ||
                !Number.isNaN(Number(value)) ||
                ["true", "false", "null", "undefined"].includes(value) ||
                knownNames.has(value) ||
                value.includes("(") ||
                value.includes("[") ||
                value.includes("{")

            return isJavascriptValue ? value : JSON.stringify(value)
        }

        if (raw.startsWith("...")) return raw + ","
        if (!raw.includes(":")) return compileValue(raw) + ","

        let colonIndex = raw.indexOf(":")
        let key = raw.slice(0, colonIndex).trim()
        let value = raw.slice(colonIndex + 1).trim()

        if (!key || !value) return line

        return key + ": " + compileValue(value) + ","
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
