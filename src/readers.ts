//
// readers.ts
//
// collection of capture methods
// to gather functions, components,
// interfaces, and raw javascript
//

import { countRueScopeDepth, extractFunctionCalls, stripLineComment } from './helpers.js';
import * as RueUIRuntime from './interface.js';
import { compileComponentBody, compileFunctionBody, compileRueOutputBody } from './bodies.js';

// --- --- ---
//    TYPES
// --- --- ---

export type RueCallable = (...params: unknown[]) => unknown
export type RueFunctionMap = Record<string, RueFunctionDefinition>
export type RueInterface = unknown[]

export interface RueFunctionDefinition {
    name: string
    params: string[]
    body: string[]
    function: RueCallable
}

export interface RueCapturedLine {
    text: string
    indent: number
    depth: number
}

export interface RueReaderContext {
    currentLineIndex: number
    rawJS: string[]
    functionMap: RueFunctionMap
    setInterface(value: RueInterface): void
    throwError(label: string, error: unknown): void
    buildRunnableContext(): Record<string, unknown>
}

// --- --- ---
// RAW JAVASCRIPT
// --- --- ---

export function captureRawJS(lines: string[], reader: RueReaderContext): void {
    let body: string[] = []
    let depth = countRueScopeDepth(stripLineComment(lines[reader.currentLineIndex]).trim())

    for (let i = reader.currentLineIndex + 1; i < lines.length; i++) {
        let line = stripLineComment(lines[i]).trim()
        let nextDepth = depth + countRueScopeDepth(line)

        if (nextDepth <= 0) {
            reader.currentLineIndex = i
            reader.rawJS.push(body.join("\n"))
            return
        }

        body.push(lines[i])
        depth = nextDepth
    }

    reader.currentLineIndex = lines.length - 1
    reader.throwError("raw js", "unclosed raw JavaScript block")
}

// --- --- ---
// FUNCTIONS
// --- --- ---

export function addFunction(lines: string[], reader: RueReaderContext): void {
    let startIndex = reader.currentLineIndex
    let startLine = stripLineComment(lines[startIndex]).trim()
    let firstWord = startLine.split(" ")[0]
    let signature = extractFunctionCalls(startLine)?.[0]

    if (!signature?.name) { reader.throwError(firstWord, "invalid function signature"); return }
    if (!startLine.includes("{")) { reader.throwError(signature.name, "missing opening brace"); return }

    let localNames = signature.params.map(param => param.split("=")[0].trim())
    let knownNames = [...localNames, ...Object.keys(reader.functionMap), ...Object.keys(RueUIRuntime), "__rueState"]
    let isComponent = firstWord == "component"
    let capturedLines = readBlockLines(lines, reader, startIndex)
    let body = isComponent
        ? compileComponentBody(capturedLines, knownNames)
        : compileFunctionBody(capturedLines, knownNames)

    try {
        let context = reader.buildRunnableContext()
        let contextNames = Object.keys(context)
        let contextValues = Object.values(context)
        let callable = new Function(...contextNames, ...signature.params, body.join("\n"))

        reader.functionMap[signature.name] = {
            name: signature.name,
            params: signature.params,
            body: body,
            function: ((...args: unknown[]) => callable(...contextValues, ...args)) as RueCallable,
        }
    }
    catch (error) {
        reader.throwError("add func", error)
    }
}

// --- --- ---
// INTERFACES
// --- --- ---

export function getInterface(lines: string[], reader: RueReaderContext): void {
    let startIndex = reader.currentLineIndex
    let startLine = stripLineComment(lines[startIndex]).trim()

    if (!startLine.includes("{")) { reader.throwError("Interface", "missing opening brace"); return }

    let knownNames = [...Object.keys(reader.functionMap), ...Object.keys(RueUIRuntime), "__rueState"]
    let body = compileRueOutputBody(readBlockLines(lines, reader, startIndex), knownNames)

    try {
        let context = reader.buildRunnableContext()
        let contextNames = Object.keys(context)
        let contextValues = Object.values(context)
        let buildInterface = new Function(...contextNames, "return ([\n" + body.join("\n") + "\n])")

        reader.setInterface(buildInterface(...contextValues) as RueInterface)
    }
    catch (error) {
        reader.throwError("Interface", error)
    }
}

// --- --- ---
// HELPERS
// --- --- ---

function readBlockLines(lines: string[], reader: RueReaderContext, startIndex: number): RueCapturedLine[] {
    let body: RueCapturedLine[] = []
    let depth = countRueScopeDepth(stripLineComment(lines[startIndex]).trim())

    for (let i = startIndex + 1; i < lines.length; i++) {
        let rawLine = stripLineComment(lines[i])
        let text = rawLine.trim()
        if (!text) continue

        depth += countRueScopeDepth(text)
        if (depth <= 0) {
            reader.currentLineIndex = i
            return body
        }

        body.push({
            text,
            indent: countIndent(rawLine),
            depth,
        })
    }

    reader.currentLineIndex = lines.length - 1
    reader.throwError("Parse", "unclosed block")
    return body
}

function countIndent(line: string): number {
    let whitespace = line.match(/^[\t ]*/)?.[0] ?? ""
    return whitespace.replaceAll("\t", "    ").length
}
