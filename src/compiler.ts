// 
// Compiler
//
// Rue Lang
// by Aaron Meche
//

import {
    readFileText, writeFileText,
    stripLineComment, ensureSemicolon,
    extractFunctionCalls, mapID,
    countRueScopeDepth,
    buildRunnableContext, resolveFunctionCalls,
    buildStateScript,
    type RueFunctionSignature,
    type RueStateMap
} from './helpers.js';
import * as RueUIRuntime from './interface.js';
import { UIElement } from './interface.js';

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type RueCallable = (...params: unknown[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
export type RueInterface = unknown[]
export type { RueFunctionSignature, RueStateMap } from './helpers.js';
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
    #cssOnion: string[] = []            // Array used to track real-time css attribute tree
    #cssMap: RueCSSMap = { ":root": [] }// JS Map that stores parsed CSS data, pre-compilation
    #funcMap: RueFunctionMap = {}       // JS Map that stores parsed JS signatures and functions
    #stateMap: RueStateMap = {}         // JS Map that stores live state variables and values
    #interface: RueInterface = []       // Array that stores the Rue Interface stack
    #compiledCSS: string[] = []         // Array of compiled CSS lines ready to be joined.
    #compiledHTML: string[] = []        // Array of compiled HTML lines ready to be joined
    #currLineIndex: number = 0          // Number used for real-time active line tracking for errors
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
        this.#cssOnion = []
        this.#cssMap = {}
        this.#funcMap = {}
        this.#stateMap = {}
        this.#interface = []
        this.#compiledCSS = []
        this.#errors = []
        RueUIRuntime.resetStateRenderers()
    }

    #parse(): void {
        let lineSplitText = this.#rawText?.split("\n")

        if (!lineSplitText) {
            this.#throwError("Parse", "issue encountered when splitting text input by line")
            return
        }

        for (this.#currLineIndex = 0; this.#currLineIndex < lineSplitText.length; this.#currLineIndex++) {
            try {
                let line = stripLineComment(lineSplitText[this.#currLineIndex]).trim()
                if (!line) continue

                let firstWord = line.split(" ")[0]

                switch (firstWord) {
                    // Comments
                    case "//":
                    case "<!--":
                        continue
                    // State Variables
                    case "@state":
                        this.#newStateVariable(line)
                        break
                    // Functions
                    case "func":
                    case "function":
                    case "component":
                        this.#addFunction(lineSplitText)
                        break
                    // Interface
                    case "Interface":
                        this.#getInterface(lineSplitText)
                        break
                    // CSS Styles
                    default:
                        this.#processStyleCaptureLine(line, firstWord)
                        break
                }
            }
            catch (error) {
                this.#throwError("line " + (this.#currLineIndex + 1), error)
            }
        }

        if (this.#cssOnion.length)  { this.#throwError("Parse", "unclosed style block"); return }
    }

    #compile(): void {
        this.#compiledCSS = []
        this.#compiledHTML = []

        // Compile CSS
        let cssSelectors = Object.keys(this.#cssMap)
        for (let i = 0; i < cssSelectors.length; i++) {
            this.#compiledCSS.push(cssSelectors[i] + "{")
            this.#compiledCSS.push("\t" + (this.#cssMap[cssSelectors[i]] || []).join("\n\t"))
            this.#compiledCSS.push("}")
        }

        // Compile HTML
        let htmlBodyContent: string[] = [RueUIRuntime.toHTML(this.#interface)]

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
            `${this.#buildStateScript()}`,
            `</body>`,
            `</html>`,
        ]
    }

    #newStateVariable(line: string): void {
        if (!line.includes("=")) { this.#throwError("@state var", "missing '=' sign"); return }
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

    #addFunction(lines: string[]): void {
        let startIndex = this.#currLineIndex
        let startLine = stripLineComment(lines[startIndex]).trim()
        let firstWord = startLine.split(" ")[0]
        let signature = extractFunctionCalls(startLine)?.[0]

        if (!signature?.name) { this.#throwError(firstWord, "invalid function signature"); return }
        if (!startLine.includes("{")) { this.#throwError(signature.name, "missing opening brace"); return }

        let localNames = signature.params.map(param => param.split("=")[0].trim())
        let knownNames = [...localNames, ...Object.keys(this.#funcMap), ...Object.keys(RueUIRuntime), "__rueState"]
        let body = this.#captureBlock(lines, startIndex, 2, knownNames)

        if (firstWord == "component" && body[0] && !body[0].startsWith("return "))
            body[0] = "return " + body[0]

        try {
            let context = this.#buildRunnableContext()
            let contextNames = Object.keys(context)
            let contextValues = Object.values(context)
            let callable = new Function(...contextNames, ...signature.params, body.join("\n"))

            this.#funcMap[signature.name] = {
                name: signature.name,
                params: signature.params,
                body: body,
                function: ((...args: unknown[]) => callable(...contextValues, ...args)) as RueCallable,
            }
        }
        catch (error) {
            this.#throwError("add func", error)
        }
    }

    #getInterface(lines: string[]): void {
        let startIndex = this.#currLineIndex
        let startLine = stripLineComment(lines[startIndex]).trim()

        if (!startLine.includes("{")) { this.#throwError("Interface", "missing opening brace"); return }

        let knownNames = [...Object.keys(this.#funcMap), ...Object.keys(RueUIRuntime), "__rueState"]
        let body = this.#captureBlock(lines, startIndex, 1, knownNames)

        try {
            let context = this.#buildRunnableContext()
            let contextNames = Object.keys(context)
            let contextValues = Object.values(context)
            let buildInterface = new Function(...contextNames, "return ([\n" + body.join("\n") + "\n])")

            this.#interface = buildInterface(...contextValues) as RueInterface
        }
        catch (error) {
            this.#throwError("Interface", error)
        }
    }

    #buildRunnableContext(): Record<string, unknown> {
        return {
            ...buildRunnableContext(RueUIRuntime, this.#funcMap),
            Interface: this.#interface,
            __rueState: new RueUIRuntime.StateStore(this.#stateMap)
        }
    }

    #captureBlock(lines: string[], startIndex: number, commaDepth: number = 2, knownNames: string[] = []): string[] {
        let body: string[] = []
        let startLine = stripLineComment(lines[startIndex]).trim()
        let depth = countRueScopeDepth(startLine)

        for (let i = startIndex + 1; i < lines.length; i++) {
            let currLine = stripLineComment(lines[i]).trim()
            if (!currLine) continue

            let nextDepth = depth + countRueScopeDepth(currLine)
            if (nextDepth <= 0) {
                this.#currLineIndex = i
                return body
            }

            body.push(this.#prepareBlockLine(currLine, nextDepth, commaDepth, knownNames))
            depth = nextDepth
        }

        this.#currLineIndex = lines.length - 1
        this.#throwError("Parse", "unclosed block")
        return body
    }

    #prepareBlockLine(line: string, depth: number, commaDepth: number, knownNames: string[]): string {
        let hadComma = line.endsWith(",")
        let hadSemicolon = line.endsWith(";")
        if (hadComma || hadSemicolon) line = line.slice(0, -1).trim()

        line = this.#resolveStateReferences(line)

        if (line.startsWith("return ")) return line
        if (line.endsWith("{") || line.endsWith("[")) return hadComma ? line + "," : line
        if (line.startsWith("let ") || line.startsWith("const ") || line.startsWith("var ")) return line
        if (line.includes("=") && !line.includes("=>")) return line
        if (line.includes(".") && line.includes("(") && !line.startsWith("new ")) return line

        if (line.includes(":"))
            line = this.#prepareObjectProperty(line, knownNames)

        return hadComma || hadSemicolon || depth >= commaDepth ? line + "," : line
    }

    #resolveStateReferences(line: string): string {
        return line
            .replace(/@([A-Za-z_$][\w$]*)\s*\+\+/g, (_, name: string) => {
                return `__rueState.set("${name}", __rueState.get("${name}") + 1)`
            })
            .replace(/@([A-Za-z_$][\w$]*)\s*--/g, (_, name: string) => {
                return `__rueState.set("${name}", __rueState.get("${name}") - 1)`
            })
            .replace(/@([A-Za-z_$][\w$]*)/g, (_, name: string) => `__rueState.get("${name}")`)
    }

    #prepareObjectProperty(line: string, knownNames: string[]): string {
        let colonIndex = line.indexOf(":")
        let key = line.slice(0, colonIndex).trim()
        let value = line.slice(colonIndex + 1).trim()

        if (!/^[A-Za-z_$][\w$-]*$/.test(key) || !value) return line
        if (!/^[$A-Z_a-z][$\w]*$/.test(key)) key = JSON.stringify(key)

        return key + ": " + this.#prepareObjectValue(value, knownNames)
    }

    #prepareObjectValue(value: string, knownNames: string[]): string {
        let callName = value.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
        let isJavascriptValue =
            value[0] == "\"" ||
            value[0] == "'" ||
            value[0] == "`" ||
            value[0] == "[" ||
            value[0] == "{" ||
            value.includes("=>") ||
            (value.includes(".") && value.includes("(")) ||
            value.startsWith("new ") ||
            !Number.isNaN(Number(value)) ||
            ["true", "false", "null", "undefined"].includes(value) ||
            knownNames.includes(value) ||
            (callName != undefined && knownNames.includes(callName))

        return isJavascriptValue ? value : JSON.stringify(value)
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

        if (!definition.includes(":") || !varName)
            return this.#throwError("var", "invalid variable definition")
        if (!this.#cssMap[":root"])
            this.#cssMap[":root"] = []
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
    getHTML(): string { return this.#compiledHTML.join("\n") }
}
