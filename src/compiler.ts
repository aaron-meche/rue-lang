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
    type RueFunctionSignature
} from './helpers.js';
import * as RueUIRuntime from './interface.js';
import { UIElement } from './interface.js';

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type RueCallable = (...params: unknown[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
export type RueInterface = unknown[]
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
    #cssOnion: string[] = []            // Array used to track real-time css attribute tree
    #cssMap: RueCSSMap = { ":root": [] }// JS Map that stores parsed CSS data, pre-compilation
    #funcMap: RueFunctionMap = {}       // JS Map that stores parsed JS signatures and functions
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
        this.#interface = []
        this.#compiledCSS = []
        this.#errors = []
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
                    // Functions
                    case "func":
                    case "function":
                    case "component":
                        this.#currLineIndex += this.#captureFunction(lineSplitText, this.#currLineIndex, firstWord)
                        break
                    // Interface
                    case "Interface":
                        this.#currLineIndex += this.#captureInterface(lineSplitText, this.#currLineIndex)
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
        let htmlBodyContent: string[] = []
        this.#interface.forEach(elem => {
            if (elem instanceof UIElement)
                htmlBodyContent.push(elem.getHTML())
            else htmlBodyContent.push(String(elem))
        })

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
            `\t<meta charset="UTF-8">`,
            `\t<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
            `\t<title>Document</title>`,
            `\t<style>`,
            `${this.#compiledCSS.join("\n")}`,
            `\t</style>`,
            `</head>`,
            `<body>`,
            `\t${htmlBodyContent.join("\n")}`,
            `</body>`,
            `</html>`,
        ]
    }

    #captureFunction(lines: string[], startIndex: number, firstWord: string): number {
        let startLine = stripLineComment(lines[startIndex]).trim()
        let signature = extractFunctionCalls(startLine)?.[0]
        let body: string[] = []
        let depth = 0

        if (!signature?.name)    { this.#throwError(firstWord, "invalid function signature"); return 0 }
        if (!startLine.includes("{")) { this.#throwError(signature.name, "missing opening brace"); return 0 }

        let paramNames = signature.params.map(param => param.split("=")[0].trim())
        let isComponent = firstWord == "component"

        for (let i = startIndex + 1; i < lines.length; i++) {
            let rawLine = stripLineComment(lines[i]).trim()
            if (!rawLine) continue

            if (rawLine == "}" && depth == 0) {
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

            let closesTopLevelExpression = (rawLine.includes("}") || rawLine.includes("]")) && depth == 1
            let bodyLine = closesTopLevelExpression ? rawLine : this.#compileRueObjectLine(rawLine, paramNames)

            if (
                isComponent &&
                body.length == 0 &&
                !bodyLine.startsWith("return ") &&
                (rawLine.startsWith("new ") || /^[A-Za-z_$][\w$]*\s*\(/.test(rawLine))
            ) {
                bodyLine = "return " + bodyLine
            }

            body.push(bodyLine)

            depth += countRueScopeDepth(rawLine)
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
                    let buildInterface = new Function(...contextNames, "return ([\n" + interfaceBody + "\n])")

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
        if (raw.includes("}") || raw.includes("]")) return raw + ","
        if (raw.startsWith("new ")) return raw + ","
        if (!raw.includes(":") && this.#isJavascriptStatement(raw)) return line

        let knownNames = new Set([...localNames, ...Object.keys(RueUIRuntime)])
        let compileValue = (value: string): string => {
            let callName = value.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
            let isJavascriptValue =
                value[0] == "\"" ||
                value[0] == "'" ||
                value[0] == "`" ||
                !Number.isNaN(Number(value)) ||
                ["true", "false", "null", "undefined"].includes(value) ||
                knownNames.has(value) ||
                value.startsWith("new ") ||
                (callName != undefined && knownNames.has(callName)) ||
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
        if (!/^[$A-Z_a-z][$\w]*$/.test(key) && key[0] != "\"" && key[0] != "'") key = JSON.stringify(key)

        return key + ": " + compileValue(value) + ","
    }

    #isJavascriptStatement(line: string): boolean {
        return (
            line.includes("=") ||
            line.startsWith("let ") ||
            line.startsWith("const ") ||
            line.startsWith("var ") ||
            line.startsWith("if ") ||
            line.startsWith("for ") ||
            line.startsWith("while ") ||
            line.startsWith("switch ")
        )
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
