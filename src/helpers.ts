//
// helpers.ts
//
// Rue Programming Language
// created by Aaron Meche
//

import fs from 'fs';
import path from 'path';

export interface RueFunctionSignature {
    name: string
    params: string[]
    call: string
}

export interface RueRunnableFunction {
    function: (...params: unknown[]) => unknown
}

export type RueRunnableFunctionMap = Record<string, RueRunnableFunction>

// Read File Text Content
export function readFileText(filePath: string): string { 
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content;
    } catch (error) {
        let message = error instanceof Error ? error.message : String(error)
        console.error("read file: " + message)
        return ""
    }
}

// Write File Text Content
export function writeFileText(filePath: string, fileContent: string): void {
    const dir = path.dirname(filePath)
    if (dir && dir != ".") fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, fileContent)
}

export function stripLineComment(line: string): string {
    let commentIndex = line.indexOf("//")

    if (commentIndex == -1) return line

    let beforeComment = line.slice(0, commentIndex)
    if (!/[\\'"`]/.test(beforeComment)) return beforeComment

    let quote: string | null = null
    let escaped = false

    for (let i = 0; i < line.length - 1; i++) {
        let char = line[i]
        let nextChar = line[i + 1]

        if (escaped) { escaped = false; continue }
        if (char == "\\") { escaped = true; continue }
        if (quote && char == quote) { quote = null; continue }
        if (!quote && (char == "\"" || char == "'" || char == "`")) { quote = char; continue }
        if (!quote && char == "/" && nextChar == "/") return line.slice(0, i)
    }

    return line
}

export function ensureSemicolon(line: string): string {
    if (line.trim().endsWith(";")) return line
    return line + ";"
}

export function mapID(selectors: string[]): string {
    return selectors.join(" ").replaceAll(" :", ":")
}

export function countRueScopeDepth(line: string): number {
    let quote: string | null = null
    let escaped = false
    let depth = 0

    for (let i = 0; i < line.length; i++) {
        let char = line[i]

        if (escaped) { escaped = false; continue }
        if (char == "\\") { escaped = true; continue }
        if (quote && char == quote) { quote = null; continue }
        if (char == "\"" || char == "'" || char == "`") { quote = char; continue }
        if (quote) continue

        if (char == "{" || char == "[") depth++
        else if (char == "}" || char == "]") depth--
    }

    return depth
}

export function buildRunnableContext(
    runtime: Record<string, unknown>,
    functionMap: RueRunnableFunctionMap
): Record<string, unknown> {
    let context: Record<string, unknown> = { ...runtime }

    Object.keys(functionMap).forEach(name => {
        context[name] = functionMap[name].function
    })

    return context
}

export function resolveFunctionCalls(
    str: string,
    functionMap: RueRunnableFunctionMap,
    onError?: (error: unknown) => void
): string {
    let extractedCalls = extractFunctionCalls(str)

    if (!extractedCalls) return str

    for (let i = 0; i < extractedCalls.length; i++) {
        let funcName = extractedCalls[i].name
        let parameters = extractedCalls[i].params
        let func = functionMap?.[funcName]
        let funcCallStr = extractedCalls[i].call || funcName + "(" + parameters + ")"

        if (!func) continue

        try {
            let funcCallValue = func.function(...parameters)
            str = str.replace(funcCallStr, String(funcCallValue))
        }
        catch (error) {
            if (onError) onError(error)
        }
    }

    return str
}

export function extractFunctionCalls(input: string): RueFunctionSignature[] | null {
    let matches = [...input.matchAll(/([A-Za-z_$][\w$]*)\s*\(([^()]*)\)/g)]

    if (!matches.length) return null

    return matches.map(match => ({
        name: match[1],
        params: match[2].split(",").map(param => param.trim()).filter(Boolean),
        call: match[0],
    }))
}
