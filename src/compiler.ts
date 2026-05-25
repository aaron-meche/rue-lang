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

interface RueCapturedLine {
    text: string
    indent: number
    depth: number
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
    #rawJS: string[] = []               // Raw JavaScript blocks inserted into compiled HTML
    #compiledCSS: string[] = []         // Array of compiled CSS lines ready to be joined.
    #compiledHTML: string[] = []        // Array of compiled HTML lines ready to be joined
    #currLineIndex: number = 0          // Number used for real-time active line tracking for errors
    #errors: string[] = []              // Array for caught errors

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
        this.#cssOnion = []
        this.#cssMap = {}
        this.#funcMap = {}
        this.#stateMap = {}
        this.#interface = []
        this.#rawJS = []
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
                    // Raw JavaScript
                    case "{":
                        this.#captureRawJS(lineSplitText)
                        break
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

    #buildRawJSScript(): string {
        if (!this.#rawJS.length) return ""
        return `<script>\n${this.#rawJS.join("\n\n")}\n</script>`
    }

    #captureRawJS(lines: string[]): void {
        let body: string[] = []
        let depth = countRueScopeDepth(stripLineComment(lines[this.#currLineIndex]).trim())

        for (let i = this.#currLineIndex + 1; i < lines.length; i++) {
            let line = stripLineComment(lines[i]).trim()
            let nextDepth = depth + countRueScopeDepth(line)

            if (nextDepth <= 0) {
                this.#currLineIndex = i
                this.#rawJS.push(body.join("\n"))
                return
            }

            body.push(lines[i])
            depth = nextDepth
        }

        this.#currLineIndex = lines.length - 1
        this.#throwError("raw js", "unclosed raw JavaScript block")
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
        let isComponent = firstWord == "component"
        let capturedLines = this.#captureBlockLines(lines, startIndex)
        let body = isComponent
            ? this.#compileComponentBody(capturedLines, knownNames)
            : this.#prepareCapturedBlock(capturedLines, 2, knownNames)


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
        let body = this.#compileRueOutputBody(this.#captureBlockLines(lines, startIndex), knownNames)

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

    #captureBlockLines(lines: string[], startIndex: number): RueCapturedLine[] {
        let body: RueCapturedLine[] = []
        let startLine = stripLineComment(lines[startIndex]).trim()
        let depth = countRueScopeDepth(startLine)

        for (let i = startIndex + 1; i < lines.length; i++) {
            let rawLine = stripLineComment(lines[i])
            let currLine = rawLine.trim()
            if (!currLine) continue

            let nextDepth = depth + countRueScopeDepth(currLine)
            if (nextDepth <= 0) {
                this.#currLineIndex = i
                return body
            }

            body.push({
                text: currLine,
                indent: this.#countIndent(rawLine),
                depth: nextDepth
            })
            depth = nextDepth
        }

        this.#currLineIndex = lines.length - 1
        this.#throwError("Parse", "unclosed block")
        return body
    }

    #prepareCapturedBlock(lines: RueCapturedLine[], commaDepth: number, knownNames: string[]): string[] {
        return lines.map(line => this.#prepareBlockLine(line.text, line.depth, commaDepth, knownNames))
    }

    #compileComponentBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
        if (this.#hasTopLevelReturn(lines))
            return this.#prepareCapturedBlock(lines, 2, knownNames)

        if (this.#hasRueOutputBody(lines, knownNames))
            return this.#compileRueReturnBody(lines, knownNames)

        return ["return new UIElement({", ...this.#prepareCapturedBlock(lines, 1, knownNames), "})"]
    }

    #hasTopLevelReturn(lines: RueCapturedLine[]): boolean {
        if (!lines.length) return false
        let baseIndent = Math.min(...lines.map(line => line.indent))
        return lines.some(line => line.indent == baseIndent && line.text.startsWith("return "))
    }

    #compileRueReturnBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
        let setupLines: RueCapturedLine[] = []
        let outputLines: RueCapturedLine[] = []
        let outputStarted = false

        for (let i = 0; i < lines.length; i++) {
            if (!outputStarted && this.#isSetupLine(lines[i].text)) {
                setupLines.push(lines[i])
                continue
            }

            outputStarted = true
            outputLines.push(lines[i])
        }

        return [
            ...this.#prepareCapturedBlock(setupLines, 2, knownNames),
            "return ([",
            ...this.#compileRueOutputBody(outputLines, knownNames),
            "])"
        ]
    }

    #compileRueOutputBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
        let body: string[] = []

        for (let i = 0; i < lines.length; i++) {
            let callEndIndex = this.#findRueNewCallEnd(lines, i)
            let configEndIndex = this.#findAttachedConfigEnd(lines, i, callEndIndex)

            if (configEndIndex > callEndIndex) {
                body.push(...this.#compileAttachedConfigCall(
                    lines.slice(i, callEndIndex + 1),
                    lines.slice(callEndIndex + 1, configEndIndex + 1),
                    knownNames
                ))
                i = configEndIndex
                continue
            }

            body.push(this.#prepareBlockLine(lines[i].text, lines[i].depth, 1, knownNames))
        }

        return body
    }

    #findRueNewCallEnd(lines: RueCapturedLine[], callIndex: number): number {
        if (!this.#startsRueNewCall(lines[callIndex].text)) return callIndex

        let depth = 0
        for (let i = callIndex; i < lines.length; i++) {
            depth += this.#countExpressionDepth(lines[i].text)
            if (depth <= 0) return i
        }

        return callIndex
    }

    #findAttachedConfigEnd(lines: RueCapturedLine[], callIndex: number, callEndIndex: number): number {
        let call = this.#parseRueNewExpression(lines.slice(callIndex, callEndIndex + 1))
        if (!call || this.#hasTopLevelComma(call.args)) return callIndex

        let firstConfigLine = lines[callEndIndex + 1]
        if (!firstConfigLine) return callIndex
        if (firstConfigLine.indent <= lines[callIndex].indent) return callIndex
        if (!this.#isConfigLine(firstConfigLine.text)) return callIndex

        let endIndex = callEndIndex + 1
        for (let i = callEndIndex + 2; i < lines.length; i++) {
            if (lines[i].indent <= lines[callIndex].indent) break
            endIndex = i
        }

        return endIndex
    }

    #compileAttachedConfigCall(callLines: RueCapturedLine[], configLines: RueCapturedLine[], knownNames: string[]): string[] {
        let call = this.#parseRueNewExpression(callLines)
        if (!call) return this.#prepareCapturedBlock(callLines, 1, knownNames)

        let configBody = this.#prepareCapturedBlock(configLines, 1, knownNames)
        let args = this.#compileRueCallArgs(call.name, callLines, knownNames)

        if (call.name == "UIElement") {
            let contentLine = args ? [`content: ${args},`] : []
            return [`new UIElement({`, ...contentLine, ...configBody, `}),`]
        }

        if (call.name == "Rectangle" && !args)
            return [`new Rectangle({`, ...configBody, `}),`]

        return [`new ${call.name}(${args}${args ? ", " : ""}{`, ...configBody, `}),`]
    }

    #compileRueCallArgs(name: string, lines: RueCapturedLine[], knownNames: string[]): string {
        if (lines.length == 1) {
            let call = this.#parseRueNewExpression(lines)
            return this.#resolveStateReferences(call?.args.trim() ?? "")
        }

        let firstLine = lines[0].text.replace(new RegExp(`^new\\s+${name}\\s*\\(`), "")
        let lastLine = lines[lines.length - 1].text.replace(/\)$/, "")
        let argLines = lines.map(line => ({ ...line }))

        argLines[0].text = firstLine.trim()
        argLines[argLines.length - 1].text = lastLine.trim()

        return this.#prepareCapturedBlock(argLines.filter(line => line.text), 2, knownNames).join("\n")
    }

    #hasRueOutputBody(lines: RueCapturedLine[], knownNames: string[]): boolean {
        for (let i = 0; i < lines.length; i++) {
            if (this.#isSetupLine(lines[i].text)) continue
            return this.#isRueOutputLine(lines[i].text, knownNames)
        }

        return false
    }

    #isRueOutputLine(line: string, knownNames: string[]): boolean {
        if (line.startsWith("new ")) return true
        if (/^["'`]/.test(line)) return true

        let callName = line.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
        return callName != undefined && knownNames.includes(callName)
    }

    #isSetupLine(line: string): boolean {
        return line.startsWith("let ") || line.startsWith("const ") || line.startsWith("var ")
    }

    #isConfigLine(line: string): boolean {
        return line.includes(":") || line.startsWith("...")
    }

    #startsRueNewCall(line: string): boolean {
        return /^new\s+[A-Za-z_$][\w$]*\s*\(/.test(line)
    }

    #parseRueNewExpression(lines: RueCapturedLine[]): { name: string, args: string } | null {
        let expression = lines.map(line => line.text).join("\n")
        let match = expression.match(/^new\s+([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/)
        if (!match) return null
        return { name: match[1], args: match[2] }
    }

    #countIndent(line: string): number {
        let whitespace = line.match(/^[\t ]*/)?.[0] ?? ""
        return whitespace.replaceAll("\t", "    ").length
    }

    #countExpressionDepth(value: string): number {
        return this.#scanExpression(value).depth
    }

    #hasTopLevelComma(value: string): boolean {
        return this.#scanExpression(value).hasTopLevelComma
    }

    #scanExpression(value: string): { depth: number, hasTopLevelComma: boolean } {
        let quote: string | null = null
        let escaped = false
        let depth = 0
        let hasTopLevelComma = false

        for (let i = 0; i < value.length; i++) {
            let char = value[i]

            if (escaped) { escaped = false; continue }
            if (char == "\\") { escaped = true; continue }
            if (quote && char == quote) { quote = null; continue }
            if (!quote && (char == "\"" || char == "'" || char == "`")) { quote = char; continue }
            if (quote) continue

            if (char == "(" || char == "[" || char == "{") depth++
            else if (char == ")" || char == "]" || char == "}") depth--
            else if (char == "," && depth == 0) hasTopLevelComma = true
        }

        return { depth, hasTopLevelComma }
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
        if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/.test(line)) return line

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
