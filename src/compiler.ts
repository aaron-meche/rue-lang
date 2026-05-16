// 
// Compiler
//
// Rue Lang
// by Aaron Meche
//

import { fileURLToPath } from 'url';
import { readFileText, writeFileText } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type RueVarMap = Record<string, string>
export type RueCallable = (...params: string[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
//
// Interface Exports
export interface RueFunctionCall {
    name: string
    params: string[]
    call: string
}
export interface RueFunctionSignature {
    name: string
    params: string[]
    call?: string
}
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
    #varMap: RueVarMap = {}             // JS Map that stores Rue variables defined in .rue
    #funcMap: RueFunctionMap = {}       // JS Map that stores JS functions defined in .rue
    #compiledCSS: string[] = []         // Array of compiled CSS lines ready to be joined.\

    #inFunc: boolean = false
    #funcSignature: RueFunctionSignature | null = null
    #funcBody: string[] = []
    #funcDepth: number = 0

    #errors: string[] = []

    // Read from filepath, parse and compile
    constructor(filepath?: string, autoCompile: boolean = true) {
        if (filepath)
            this.feed(readFileText(filepath), autoCompile)
        return
    }

    // Force feed string instead of filepath
    feed(string: string, autoCompile?: boolean): void {
        this.#rawText = typeof string == "string" ? string : ""

        if (autoCompile)
            this.run()
        return
    }

    // Parse and Compile stored text
    run(): void {
        // Reset Output
        this.#cssOnion = []
        this.#cssMap = { ":root": [] }
        this.#varMap = {}
        this.#funcMap = {}
        this.#compiledCSS = []
        this.#inFunc = false
        this.#funcSignature = null
        this.#funcBody = []
        this.#funcDepth = 0
        this.#errors = []
        // Begin Program:
        // 01: Parse
        this.#parse()
        // 02: Compile
        this.#compile()
    }

    #addError(label: string, error: unknown): void {
        let message = error instanceof Error ? error.message : String(error)
        this.#errors.push(label + ": " + message)
        console.error(label + ": " + message)
    }

    // Iterate and process all lines
    #parse(): void {
        let lineSplitText = this.#rawText?.split("\n")
        if (!lineSplitText) return
        for (let i = 0; i < lineSplitText.length; i++) {
            try {
                this.#processLine(this.#stripLineComment(lineSplitText[i]).trim())
            }
            catch (error) {
                this.#addError("line " + (i + 1), error)
            }
        }
        if (this.#inFunc) {
            this.#addError("parse", "unclosed function block")
            this.#inFunc = false
            this.#funcSignature = null
            this.#funcBody = []
            this.#funcDepth = 0
        }
        if (this.#cssOnion.length) {
            this.#addError("parse", "unclosed style block")
            this.#cssOnion = []
        }
    }

    // Build CSS file from map
    #compile(): void {
        for (let i = 0; i < Object.keys(this.#cssMap).length; i++) {
            this.#compiledCSS.push(Object.keys(this.#cssMap)[i] + "{")
            this.#compiledCSS.push("\t" + (Object.values(this.#cssMap)[i] || []).join("\n\t"))
            this.#compiledCSS.push("}")
        }
    }

    // Interpret each line, building map
    #processLine(line: string): void {
        if (!line) return

        let lastChar = line[line.length - 1]
        let firstChar = line[0]
        let firstWord = line.split(" ")[0]
        
        if (firstWord == "//") return
        if (firstWord == "<!--") return

        // Function Capture Mode
        if (this.#inFunc)   
            this.#processFunctionCaptureLine(line, lastChar)
        // Style Capture Mode
        else this.#processStyleCaptureLine(line, lastChar, firstChar, firstWord)
    }

    #stripLineComment(line: string): string {
        let quote: string | null = null
        let escaped = false

        for (let i = 0; i < line.length; i++) {
            let char = line[i]
            let nextChar = line[i + 1]

            if (escaped) { escaped = false; continue }
            if (char == "\\") { escaped = true; continue }
            if (quote && char == quote) { quote = null; continue; }
            if (char == "\"" || char == "'" || char == "`") { quote = char; continue }
            if (!quote && char == "/" && nextChar == "/") return line.slice(0, i)
        }

        return line
    }

    #processFunctionCaptureLine(line: string, lastChar: string): void {
        // Nested function
        if (lastChar == "{") {
            this.#funcDepth++
            this.#funcBody.push(this.#resolveJavascriptLine(line))
        }
        // Close function
        else if (line == "}") {
            // If closing nested function
            if (this.#funcDepth != 0) {
                this.#funcDepth--
                this.#funcBody.push(this.#resolveJavascriptLine(line))
            }
            // If closing main function
            else {
                try {
                    this.#funcBody = this.#handleJavascriptContext(this.#funcBody)
                    if (!this.#funcSignature?.name) throw new Error("invalid function signature")
                    let params = this.#funcSignature.params || []
                    this.#funcMap[this.#funcSignature.name] = {
                        name: this.#funcSignature.name,
                        params: params,
                        body: this.#funcBody,
                        function: new Function(...params, this.#funcBody.join("\n")) as RueCallable,
                    }
                }
                catch (error) {
                    this.#addError("add func", error)
                }
                this.#inFunc = false
                this.#funcSignature = null
                this.#funcBody = []
                this.#funcDepth = 0
            }
        }
        // Add new line to function
        else {
            this.#funcBody.push(this.#resolveJavascriptLine(line))
        }
    }

    #processStyleCaptureLine(line: string, lastChar: string, firstChar: string, firstWord: string): void {
        // Function Decl    e.g. : func name(params) {
        if (firstWord == "func") {
            let functionCalls = this.#extractFunctionCalls(line)
            if (!functionCalls?.[0]) return this.#addError("func", "invalid function signature")
            this.#inFunc = true
            this.#funcSignature = functionCalls[0]
        } 
        // Inline Layer     e.g. : elem { background: red }
        else if (line.includes("{") && line.includes("}")) {
            this.#processInlineStyleLine(line)
        } 
        // New Layer        e.g. : elem {
        else if (line.includes("{")) {
            this.#cssOnion.push(line.replace("{", "").trim())
            this.#cssMap[this.#mapID()] = []
        } 
        // Close Layer      e.g. : }
        else if (line == "}") {
            if (this.#cssOnion.length) this.#cssOnion.pop()
            else this.#addError("layer", "unexpected closing brace")
        } 
        // Variable Def     e.g. : def name: val  ||  _name_: val
        else if (firstWord == "def" || firstChar == "_") {
            this.#defineRueVar(line)
        } 
        // Key: Value       e.g. : background: red
        else if (line.includes(":")) {
            let curMapID = this.#mapID() || ":root"
            if (!this.#cssMap[curMapID]) this.#cssMap[curMapID] = []
            this.#cssMap[curMapID].push(this.#resolveString(this.#ensureSemicolon(line)))
        }
    }

    // e.g. : elem { background: red }
    #processInlineStyleLine(line: string): void {
        let selector = line.slice(0, line.indexOf("{")).trim()
        let body = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}")).trim()

        if (!selector) return this.#addError("layer", "invalid inline style selector")

        this.#cssOnion.push(selector)
        let curMapID = this.#mapID()
        if (!this.#cssMap[curMapID]) this.#cssMap[curMapID] = []

        if (body) this.#processInlineStyleBody(body)

        this.#cssOnion.pop()
    }

    // e.g. : elem { background: red; color: blue }
    #processInlineStyleBody(body: string): void {
        let buffer = ""

        for (let i = 0; i < body.length; i++) {
            let char = body[i]

            if (char == "{") {
                let parts = buffer.split(";")
                let selector = (parts.pop() || "").trim()
                this.#processInlineDeclarations(parts.join(";"))

                if (!selector) {
                    this.#addError("layer", "invalid nested inline style selector")
                    buffer = ""
                    continue
                }

                let closeIndex = this.#findInlineCloseBrace(body, i)
                if (closeIndex == -1) {
                    this.#addError("layer", "unclosed inline style block")
                    return
                }

                this.#cssOnion.push(selector)
                let curMapID = this.#mapID()
                if (!this.#cssMap[curMapID]) this.#cssMap[curMapID] = []
                this.#processInlineStyleBody(body.slice(i + 1, closeIndex).trim())
                this.#cssOnion.pop()

                buffer = ""
                i = closeIndex
            }
            else {
                buffer += char
            }
        }

        this.#processInlineDeclarations(buffer)
    }

    #processInlineDeclarations(string: string): void {
        let declarations = string.split(";")
        let curMapID = this.#mapID()
        if (!this.#cssMap[curMapID]) this.#cssMap[curMapID] = []
        for (let i = 0; i < declarations.length; i++) {
            let declaration = declarations[i].trim()
            if (!declaration) continue
            this.#cssMap[curMapID].push(this.#resolveString(declaration + ";"))
        }
    }

    #findInlineCloseBrace(body: string, openIndex: number): number {
        let depth = 0
        for (let i = openIndex; i < body.length; i++) {
            if (body[i] == "{") depth++
            else if (body[i] == "}") {
                depth--
                if (depth == 0) return i
            }
        }
        return -1
    }

    #mapID(): string { return this.#cssOnion.join(" ")?.replaceAll(" :", ":") }

    #defineRueVar(line: string): void {
        if (line.split(" ")[0] == "def") line = line.replace("def ", "")
        let varName = line.split(":")[0].replaceAll("_", "").trim()
        let varValue = this.#stripSemicolon(line.slice(line.indexOf(":") + 1).trim())
        if (!line.includes(":") || !varName) return this.#addError("var", "invalid variable definition")

        let resolvedValue = this.#resolveString(varValue)
        this.#varMap[varName] = resolvedValue

        let rootLine = "--" + varName + ": " + resolvedValue
        this.#cssMap[":root"].push(this.#ensureSemicolon(rootLine))
    }

    #ensureSemicolon(line: string): string {
        if (line.trim().endsWith(";")) return line
        return line + ";"
    }

    #stripSemicolon(line: string): string {
        if (line.trim().endsWith(";")) return line.trim().slice(0, -1).trim()
        return line
    }

    #resolveJavascriptLine(line: string): string {
        if (line.includes("_")) return this.#handleRueVarCalls(line)
        return line
    }

    // Handle var definitions + function calls
    #resolveString(line: string): string {
        let charSplit = line.split("")
        let wordSplit = line.split(" ")
        // Variable Definition
        if (wordSplit[0] == "def") {
            line = line?.replace("def ", "--")
        }
        if (charSplit.includes("_")) {
            line = this.#handleRueVarCalls(line)
        }
        // Function Call
        if (line.includes("(") && line.includes(")")) {
            line = this.#handleFunctionCalls(line)
        }
        return line
    }

    #extractFunctionCalls(str: string): RueFunctionCall[] | null {
        if (!str.includes("(")) return null
        let numOfLParen = str.split("(").length - 1
        let indexOfLParen = null
        let functions: RueFunctionCall[] = []
        let currFunc: { name: string, params: string, call: string } = { name: "", params: "", call: "" }
        for (let i = 0; i < numOfLParen; i++) {
            indexOfLParen = str.indexOf("(")
            // Capture BEHIND (function name)
            for (let i = indexOfLParen; i > 0; --i) {
                let prevChar = str[i - 1]
                if (prevChar != " ") {
                    currFunc.name = prevChar + currFunc.name
                } 
                else break
            }
            // Capture AHEAD (function parameters)
            for (let i = indexOfLParen; i < str.length; ++i) {
                let nextChar = str[i + 1]
                if (nextChar != ")") {
                    currFunc.params += nextChar
                } 
                else break
            }
            currFunc.call = currFunc.name + "(" + currFunc.params + ")"
            let params = currFunc.params
                ?.split(",")
                .map((param) => param.trim())
                .filter((param) => param)
            functions.push({ name: currFunc.name, params, call: currFunc.call })
            currFunc = { name: "", params: "", call: "" }
            str = str.replace("(", "_")
        }
        return functions
    }

    #handleFunctionCalls(str: string): string {
        let extractedCalls = this.#extractFunctionCalls(str)
        if (!extractedCalls) return str
        for (let i = 0; i < extractedCalls.length; i++) {
            let funcName = extractedCalls[i].name
            let parameters = extractedCalls[i].params
            // Fetch function from func map
            let func = this.#funcMap?.[funcName]
            let funcCallStr = extractedCalls[i].call || funcName + "(" + parameters + ")"
            if (func) {
                try {
                    let funcCallValue = func.function(...parameters)
                    str = str.replace(funcCallStr, String(funcCallValue))
                }
                catch (error) {
                    this.#addError("handleFunctionCalls", error)
                }
            }
        }
        return str
    }

    // in development
    #handleJavascriptContext(lineArr: string[]): string[] {
        for (let i = 0; i < lineArr.length; i++) {
            let calls = this.#extractFunctionCalls(lineArr[i])
            if (!calls) continue
            for (let i = 0; i < calls.length; i++) {
                let foundFunc = this.#funcMap?.[calls[i].name]
                if (!foundFunc) continue
            }
        }
        return lineArr
    }

    #handleRueVarCalls(line: string): string {
        let curVarName = ""
        for (let i = line.indexOf("_") + 1; i < line.length; i++) {
            if (line[i] == "_") break
            curVarName += line[i]
        }
        if (!curVarName || this.#varMap[curVarName] == undefined) return line
        line = line.replace("_" + curVarName + "_", this.#varMap[curVarName])
        if (line.includes("_")) 
            return this.#handleRueVarCalls(line)
        else 
            return line
    }

    print(): void { console.log(this.#compiledCSS.join("\n")) }
    getCSS(): string { return this.#compiledCSS.join("\n") }
    getErrors(): string[] { return this.#errors }
    output(path: string): void { writeFileText(path, this.#compiledCSS.join("\n")) }
}
