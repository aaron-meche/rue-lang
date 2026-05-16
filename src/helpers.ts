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

export interface RueObjectPropertyOptions {
    skipQuotedKeys?: boolean
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

export function ensureSemicolon(line: string): string {
    if (line.trim().endsWith(";")) return line
    return line + ";"
}

export function compileCSSMap(cssMap: Record<string, string[]>): string[] {
    let compiledCSS: string[] = []
    let selectors = Object.keys(cssMap)

    for (let i = 0; i < selectors.length; i++) {
        compiledCSS.push(selectors[i] + "{")
        compiledCSS.push("\t" + (cssMap[selectors[i]] || []).join("\n\t"))
        compiledCSS.push("}")
    }

    return compiledCSS
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

export function normalizeRueObjectBody(lines: string[]): string[] {
    return lines.map(line => {
        let trimmed = line.trim()

        if (!trimmed || trimmed.endsWith(",") || trimmed.endsWith("{") || trimmed.endsWith("[")) return line

        return line + ","
    })
}

export function resolveRueObjectProperty(
    line: string,
    localNames: Iterable<string> = [],
    runtimeNames: Iterable<string> = [],
    options: RueObjectPropertyOptions = {}
): string | null {
    if (!line.includes(":")) return null

    let colonIndex = line.indexOf(":")
    let key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    if (!key || !value) return null
    if (options.skipQuotedKeys && (key.startsWith("\"") || key.startsWith("'"))) return null

    return key + ": " + resolveRueObjectValue(value, localNames, runtimeNames)
}

export function resolveRueArrayItem(
    line: string,
    localNames: Iterable<string> = [],
    runtimeNames: Iterable<string> = []
): string {
    let trimmed = line.trim()

    if (!trimmed || trimmed == "}" || trimmed == "]") return line
    if (trimmed.endsWith("{") || trimmed.endsWith("[") || trimmed.endsWith(")")) return line

    return line.replace(trimmed, resolveRueObjectValue(trimmed, localNames, runtimeNames))
}

export function resolveRueObjectValue(
    value: string,
    localNames: Iterable<string> = [],
    runtimeNames: Iterable<string> = []
): string {
    let cleanValue = value.endsWith(",") ? value.slice(0, -1).trim() : value.trim()
    let knownNames = new Set([...localNames, ...runtimeNames])

    if (!cleanValue) return cleanValue
    if (cleanValue[0] == "\"" || cleanValue[0] == "'" || cleanValue[0] == "`") return cleanValue
    if (!Number.isNaN(Number(cleanValue))) return cleanValue
    if (["true", "false", "null", "undefined"].includes(cleanValue)) return cleanValue
    if (knownNames.has(cleanValue)) return cleanValue
    if (cleanValue.includes("(") || cleanValue.includes("[") || cleanValue.includes("{")) return cleanValue

    return JSON.stringify(cleanValue)
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
