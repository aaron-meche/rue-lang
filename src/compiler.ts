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
import fs from "fs";
import path from "path";

//
// Type Exports
export type RueCSSMap = Record<string, string[]>
export type RueCallable = (...params: unknown[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
export type RueInterface = unknown[]
export type { RueFunctionSignature, RueStateMap } from './helpers.js';
export interface RueSourcePart {
    text: string
    sourcePath: string
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
    #sourcePath: string | null = null       // Current file path, used for relative imports
    #lineSourcePaths: string[] = []         // Source path for each raw text line
    #importStack: string[] = []             // Tracks nested imports and prevents cycles
    #resetRuntimeOnRun: boolean = true      // Root files reset live-state renderers, imports do not
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

    constructor(
        filepath?: string,
        autoCompile: boolean = true,
        importStack: string[] = [],
        resetRuntimeOnRun: boolean = true
    ) {
        this.#resetRuntimeOnRun = resetRuntimeOnRun

        if (filepath) {
            let resolvedPath = path.resolve(filepath)
            this.#sourcePath = resolvedPath
            this.#importStack = importStack.length ? importStack : [resolvedPath]
            this.feed(readFileText(resolvedPath), autoCompile, resolvedPath)
        }
        return
    }

    feed(string: string, autoCompile?: boolean, sourcePath?: string): void {
        if (sourcePath) {
            let resolvedPath = path.resolve(sourcePath)
            this.#sourcePath = resolvedPath
            this.#lineSourcePaths = string.split("\n").map(() => resolvedPath)
            if (!this.#importStack.length)
                this.#importStack = [resolvedPath]
        }
        else {
            this.#lineSourcePaths = []
        }

        if (typeof string == "string")
            this.#rawText = string
        else this.#throwError("Feed", "first argument expected type string, not type " + typeof string)

        if (autoCompile)
            this.run()
        return
    }

    feedParts(parts: RueSourcePart[], autoCompile: boolean = true): void {
        let textLines: string[] = []
        let sourcePaths: string[] = []

        parts.forEach(part => {
            if (!part.text) return

            let resolvedPath = path.resolve(part.sourcePath)
            let lines = part.text.split("\n")

            if (textLines.length) {
                textLines.push("")
                sourcePaths.push(resolvedPath)
            }

            textLines.push(...lines)
            sourcePaths.push(...lines.map(() => resolvedPath))

            if (!this.#sourcePath)
                this.#sourcePath = resolvedPath
            if (!this.#importStack.length)
                this.#importStack = [resolvedPath]
        })

        this.#rawText = textLines.join("\n")
        this.#lineSourcePaths = sourcePaths

        if (autoCompile)
            this.run()
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
        if (this.#resetRuntimeOnRun)
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
                this.#sourcePath = this.#lineSourcePaths[this.#currLineIndex] || this.#sourcePath

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
                    // Imports
                    case "import":
                        this.#addImport(line)
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

    #addImport(line: string): void {
        let match = line.match(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](.+)["']\s*;?$/)

        if (!match) {
            this.#throwError("import", "expected syntax: import Name from \"./file.rue\"")
            return
        }

        let importName = match[1]
        let importPath = this.#resolveImportPath(match[2])

        if (!importPath.endsWith(".rue")) {
            this.#throwError("import", "only .rue imports are supported")
            return
        }
        if (!fs.existsSync(importPath)) {
            this.#throwError("import", "could not find " + importPath)
            return
        }
        if ((this.#sourcePath && importPath == path.resolve(this.#sourcePath)) || this.#importStack.includes(importPath)) {
            this.#throwError("import", "circular import detected for " + importPath)
            return
        }

        let importedFile = new RueFile(importPath, true, [...this.#importStack, importPath], false)
        this.#mergeImportedFile(importedFile)

        this.#funcMap[importName] = {
            name: importName,
            params: [],
            body: ["// imported Interface from " + importPath],
            function: () => importedFile.getInterface(),
        }
    }

    #resolveImportPath(importPath: string): string {
        if (importPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(importPath))
            return path.resolve(importPath)

        let basePath = this.#sourcePath ? path.dirname(this.#sourcePath) : "."
        return path.resolve(basePath, importPath)
    }

    #mergeImportedFile(importedFile: RueFile): void {
        Object.keys(importedFile.#cssMap).forEach(selector => {
            if (!this.#cssMap[selector]) this.#cssMap[selector] = []
            this.#cssMap[selector].push(...importedFile.#cssMap[selector])
        })

        this.#stateMap = {
            ...importedFile.#stateMap,
            ...this.#stateMap
        }

        this.#rawJS.push(...importedFile.#rawJS)
        this.#errors.push(...importedFile.#errors)
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
        let body = this.#captureBlock(lines, startIndex, isComponent ? 1 : 2, knownNames)

        if (isComponent)
            body = ["return new UIElement({", ...body, "})"]

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
        if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+\s*\(/.test(line)) return line

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
