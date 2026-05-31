//
// bodies.ts
//
// Turns captured Rue block lines into JavaScript
// bodies that can be passed to Function().
//

import type { RueCapturedLine } from './readers.js';

export function compileFunctionBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
    return compileCapturedLines(lines, 2, knownNames)
}

export function compileComponentBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
    if (hasTopLevelReturn(lines))
        return compileFunctionBody(lines, knownNames)

    if (hasRueOutputBody(lines, knownNames))
        return compileRueReturnBody(lines, knownNames)

    return ["return new UIElement({", ...compileCapturedLines(lines, 1, knownNames), "})"]
}

export function compileRueOutputBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
    let body: string[] = []

    for (let i = 0; i < lines.length; i++) {
        let callEndIndex = findRueNewCallEnd(lines, i)
        let configEndIndex = findAttachedConfigEnd(lines, i, callEndIndex)

        if (configEndIndex > callEndIndex) {
            body.push(...compileAttachedConfigCall(
                lines.slice(i, callEndIndex + 1),
                lines.slice(callEndIndex + 1, configEndIndex + 1),
                knownNames
            ))
            i = configEndIndex
            continue
        }

        body.push(compileCapturedLine(lines[i].text, lines[i].depth, 1, knownNames))
    }

    return body
}

function compileCapturedLines(lines: RueCapturedLine[], commaDepth: number, knownNames: string[]): string[] {
    return lines.map(line => compileCapturedLine(line.text, line.depth, commaDepth, knownNames))
}

function compileRueReturnBody(lines: RueCapturedLine[], knownNames: string[]): string[] {
    let setupLines: RueCapturedLine[] = []
    let outputLines: RueCapturedLine[] = []
    let outputStarted = false

    for (let i = 0; i < lines.length; i++) {
        if (!outputStarted && isSetupLine(lines[i].text)) {
            setupLines.push(lines[i])
            continue
        }

        outputStarted = true
        outputLines.push(lines[i])
    }

    return [
        ...compileCapturedLines(setupLines, 2, knownNames),
        "return ([",
        ...compileRueOutputBody(outputLines, knownNames),
        "])"
    ]
}

function compileAttachedConfigCall(
    callLines: RueCapturedLine[],
    configLines: RueCapturedLine[],
    knownNames: string[]
): string[] {
    let call = parseRueNewExpression(callLines)
    if (!call) return compileCapturedLines(callLines, 1, knownNames)

    let configBody = compileCapturedLines(configLines, 1, knownNames)
    let args = compileRueCallArgs(call.name, callLines, knownNames)

    if (call.name == "UIElement") {
        let contentLine = args ? [`content: ${args},`] : []
        return [`new UIElement({`, ...contentLine, ...configBody, `}),`]
    }

    if (call.name == "Rectangle" && !args)
        return [`new Rectangle({`, ...configBody, `}),`]

    return [`new ${call.name}(${args}${args ? ", " : ""}{`, ...configBody, `}),`]
}

function compileRueCallArgs(name: string, lines: RueCapturedLine[], knownNames: string[]): string {
    if (lines.length == 1) {
        let call = parseRueNewExpression(lines)
        return resolveStateReferences(call?.args.trim() ?? "")
    }

    let firstLine = lines[0].text.replace(new RegExp(`^new\\s+${name}\\s*\\(`), "")
    let lastLine = lines[lines.length - 1].text.replace(/\)$/, "")
    let argLines = lines.map(line => ({ ...line }))

    argLines[0].text = firstLine.trim()
    argLines[argLines.length - 1].text = lastLine.trim()

    return compileCapturedLines(argLines.filter(line => line.text), 2, knownNames).join("\n")
}

function compileCapturedLine(line: string, depth: number, commaDepth: number, knownNames: string[]): string {
    let hadComma = line.endsWith(",")
    let hadSemicolon = line.endsWith(";")
    if (hadComma || hadSemicolon) line = line.slice(0, -1).trim()

    line = resolveStateReferences(line)

    if (line.startsWith("return ")) return line
    if (line.endsWith("{") || line.endsWith("[")) return hadComma ? line + "," : line
    if (isSetupLine(line)) return line
    if (line.includes("=") && !line.includes("=>")) return line
    if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/.test(line)) return line

    if (line.includes(":"))
        line = prepareObjectProperty(line, knownNames)

    return hadComma || hadSemicolon || depth >= commaDepth ? line + "," : line
}

function prepareObjectProperty(line: string, knownNames: string[]): string {
    let colonIndex = line.indexOf(":")
    let key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    if (!/^[A-Za-z_$][\w$-]*$/.test(key) || !value) return line
    if (!/^[$A-Z_a-z][$\w]*$/.test(key)) key = JSON.stringify(key)

    return key + ": " + prepareObjectValue(value, knownNames)
}

function prepareObjectValue(value: string, knownNames: string[]): string {
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

function resolveStateReferences(line: string): string {
    return line
        .replace(/@([A-Za-z_$][\w$]*)\s*\+\+/g, (_, name: string) => {
            return `__rueState.set("${name}", __rueState.get("${name}") + 1)`
        })
        .replace(/@([A-Za-z_$][\w$]*)\s*--/g, (_, name: string) => {
            return `__rueState.set("${name}", __rueState.get("${name}") - 1)`
        })
        .replace(/@([A-Za-z_$][\w$]*)/g, (_, name: string) => `__rueState.get("${name}")`)
}

function findRueNewCallEnd(lines: RueCapturedLine[], callIndex: number): number {
    if (!startsRueNewCall(lines[callIndex].text)) return callIndex

    let depth = 0
    for (let i = callIndex; i < lines.length; i++) {
        depth += scanExpression(lines[i].text).depth
        if (depth <= 0) return i
    }

    return callIndex
}

function findAttachedConfigEnd(lines: RueCapturedLine[], callIndex: number, callEndIndex: number): number {
    let call = parseRueNewExpression(lines.slice(callIndex, callEndIndex + 1))
    if (!call || scanExpression(call.args).hasTopLevelComma) return callIndex

    let firstConfigLine = lines[callEndIndex + 1]
    if (!firstConfigLine) return callIndex
    if (firstConfigLine.indent <= lines[callIndex].indent) return callIndex
    if (!isConfigLine(firstConfigLine.text)) return callIndex

    let endIndex = callEndIndex + 1
    for (let i = callEndIndex + 2; i < lines.length; i++) {
        if (lines[i].indent <= lines[callIndex].indent) break
        endIndex = i
    }

    return endIndex
}

function hasRueOutputBody(lines: RueCapturedLine[], knownNames: string[]): boolean {
    for (let i = 0; i < lines.length; i++) {
        if (isSetupLine(lines[i].text)) continue
        return isRueOutputLine(lines[i].text, knownNames)
    }

    return false
}

function hasTopLevelReturn(lines: RueCapturedLine[]): boolean {
    if (!lines.length) return false
    let baseIndent = Math.min(...lines.map(line => line.indent))
    return lines.some(line => line.indent == baseIndent && line.text.startsWith("return "))
}

function isRueOutputLine(line: string, knownNames: string[]): boolean {
    if (line.startsWith("new ")) return true
    if (/^["'`]/.test(line)) return true

    let callName = line.match(/^([A-Za-z_$][\w$]*)\s*\(/)?.[1]
    return callName != undefined && knownNames.includes(callName)
}

function isSetupLine(line: string): boolean {
    return line.startsWith("let ") || line.startsWith("const ") || line.startsWith("var ")
}

function isConfigLine(line: string): boolean {
    return line.includes(":") || line.startsWith("...")
}

function startsRueNewCall(line: string): boolean {
    return /^new\s+[A-Za-z_$][\w$]*\s*\(/.test(line)
}

function parseRueNewExpression(lines: RueCapturedLine[]): { name: string, args: string } | null {
    let expression = lines.map(line => line.text).join("\n")
    let match = expression.match(/^new\s+([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/)
    if (!match) return null
    return { name: match[1], args: match[2] }
}

function scanExpression(value: string): { depth: number, hasTopLevelComma: boolean } {
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
