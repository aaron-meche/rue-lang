// 
// Compiler
//
// Rue Lang
// by Aaron Meche
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __sysDir = path.dirname(__filename);
// Read File Text Content
function readFileText(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content;
    }
    catch (error) {
        let message = error instanceof Error ? error.message : String(error);
        console.error("read file: " + message);
        return "";
    }
}
// Write File Text Content
function writeFileText(filePath, fileContent) {
    const dir = path.dirname(filePath);
    if (dir && dir != ".")
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, fileContent);
}
export class RueFile {
    #txt = null;
    #layers = [];
    #map = {};
    #var = {};
    #func = {};
    #css = [];
    #inFunc = false;
    #funcSignature = null;
    #funcBody = [];
    #funcDepth = 0;
    #errors = [];
    // Read from filepath, parse and compile
    constructor(filepath, doNotCompile = false) {
        if (!filepath)
            return;
        this.feed(readFileText(filepath), doNotCompile);
    }
    // Force feed strinb instead of filepath
    feed(string, doNotCompile) {
        this.#txt = typeof string == "string" ? string : "";
        if (doNotCompile)
            return;
        this.run();
    }
    // Parse and Compile stored text
    run() {
        this.#resetOutput();
        this.#parse();
        this.#compile();
    }
    #resetOutput() {
        this.#layers = [];
        this.#map = { ":root": [] };
        this.#var = {};
        this.#func = {};
        this.#css = [];
        this.#inFunc = false;
        this.#funcSignature = null;
        this.#funcBody = [];
        this.#funcDepth = 0;
        this.#errors = [];
    }
    #addError(label, error) {
        let message = error instanceof Error ? error.message : String(error);
        this.#errors.push(label + ": " + message);
        console.error(label + ": " + message);
    }
    // Iterate and process all lines
    #parse() {
        let lineSplitText = this.#txt?.split("\n");
        if (!lineSplitText)
            return;
        for (let i = 0; i < lineSplitText.length; i++) {
            try {
                this.#processLine(this.#stripLineComment(lineSplitText[i]).trim());
            }
            catch (error) {
                this.#addError("line " + (i + 1), error);
            }
        }
        if (this.#inFunc) {
            this.#addError("parse", "unclosed function block");
            this.#inFunc = false;
            this.#funcSignature = null;
            this.#funcBody = [];
            this.#funcDepth = 0;
        }
        if (this.#layers.length) {
            this.#addError("parse", "unclosed style block");
            this.#layers = [];
        }
    }
    // Build CSS file from map
    #compile() {
        for (let i = 0; i < Object.keys(this.#map).length; i++) {
            this.#css.push(Object.keys(this.#map)[i] + "{");
            this.#css.push("\t" + (Object.values(this.#map)[i] || []).join("\n\t"));
            this.#css.push("}");
        }
    }
    // Interpret each line, building map
    #processLine(line) {
        if (!line)
            return;
        let lastChar = line[line.length - 1];
        let firstChar = line[0];
        let firstWord = line.split(" ")[0];
        if (firstWord == "//")
            return;
        if (firstWord == "<!--")
            return;
        // Function Capture Mode
        if (this.#inFunc)
            this.#processFunctionCaptureLine(line, lastChar);
        // Style Capture Mode
        else
            this.#processStyleCaptureLine(line, lastChar, firstChar, firstWord);
    }
    #stripLineComment(line) {
        let quote = null;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
            let char = line[i];
            let nextChar = line[i + 1];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char == "\\") {
                escaped = true;
                continue;
            }
            if (quote && char == quote) {
                quote = null;
                continue;
            }
            if (char == "\"" || char == "'" || char == "`") {
                quote = char;
                continue;
            }
            if (!quote && char == "/" && nextChar == "/")
                return line.slice(0, i);
        }
        return line;
    }
    #processFunctionCaptureLine(line, lastChar) {
        // Nested function
        if (lastChar == "{") {
            this.#funcDepth++;
            this.#funcBody.push(this.#resolveJavascriptLine(line));
        }
        // Close function
        else if (line == "}") {
            // If closing nested function
            if (this.#funcDepth != 0) {
                this.#funcDepth--;
                this.#funcBody.push(this.#resolveJavascriptLine(line));
            }
            // If closing main function
            else {
                try {
                    this.#funcBody = this.#handleJavascriptContext(this.#funcBody);
                    if (!this.#funcSignature?.name)
                        throw new Error("invalid function signature");
                    let params = this.#funcSignature.params || [];
                    this.#func[this.#funcSignature.name] = {
                        name: this.#funcSignature.name,
                        params: params,
                        body: this.#funcBody,
                        function: new Function(...params, this.#funcBody.join("\n")),
                    };
                }
                catch (error) {
                    this.#addError("add func", error);
                }
                this.#inFunc = false;
                this.#funcSignature = null;
                this.#funcBody = [];
                this.#funcDepth = 0;
            }
        }
        // Add new line to function
        else {
            this.#funcBody.push(this.#resolveJavascriptLine(line));
        }
    }
    #processStyleCaptureLine(line, lastChar, firstChar, firstWord) {
        // Function Decl    e.g. : func name(params) {
        if (firstWord == "func") {
            let functionCalls = this.#extractFunctionCalls(line);
            if (!functionCalls?.[0])
                return this.#addError("func", "invalid function signature");
            this.#inFunc = true;
            this.#funcSignature = functionCalls[0];
        }
        // Inline Layer     e.g. : elem { background: red }
        else if (line.includes("{") && line.includes("}")) {
            this.#processInlineStyleLine(line);
        }
        // New Layer        e.g. : elem {
        else if (line.includes("{")) {
            this.#layers.push(line.replace("{", "").trim());
            this.#map[this.#mapID()] = [];
        }
        // Close Layer      e.g. : }
        else if (line == "}") {
            if (this.#layers.length)
                this.#layers.pop();
            else
                this.#addError("layer", "unexpected closing brace");
        }
        // Variable Def     e.g. : def name: val  ||  _name_: val
        else if (firstWord == "def" || firstChar == "_") {
            this.#defineRueVar(line);
        }
        // Key: Value       e.g. : background: red
        else if (line.includes(":")) {
            let curMapID = this.#mapID() || ":root";
            if (!this.#map[curMapID])
                this.#map[curMapID] = [];
            this.#map[curMapID].push(this.#resolveString(this.#ensureSemicolon(line)));
        }
    }
    // e.g. : elem { background: red }
    #processInlineStyleLine(line) {
        let selector = line.slice(0, line.indexOf("{")).trim();
        let body = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}")).trim();
        if (!selector)
            return this.#addError("layer", "invalid inline style selector");
        this.#layers.push(selector);
        let curMapID = this.#mapID();
        if (!this.#map[curMapID])
            this.#map[curMapID] = [];
        if (body)
            this.#processInlineStyleBody(body);
        this.#layers.pop();
    }
    // e.g. : elem { background: red; color: blue }
    #processInlineStyleBody(body) {
        let buffer = "";
        for (let i = 0; i < body.length; i++) {
            let char = body[i];
            if (char == "{") {
                let parts = buffer.split(";");
                let selector = (parts.pop() || "").trim();
                this.#processInlineDeclarations(parts.join(";"));
                if (!selector) {
                    this.#addError("layer", "invalid nested inline style selector");
                    buffer = "";
                    continue;
                }
                let closeIndex = this.#findInlineCloseBrace(body, i);
                if (closeIndex == -1) {
                    this.#addError("layer", "unclosed inline style block");
                    return;
                }
                this.#layers.push(selector);
                let curMapID = this.#mapID();
                if (!this.#map[curMapID])
                    this.#map[curMapID] = [];
                this.#processInlineStyleBody(body.slice(i + 1, closeIndex).trim());
                this.#layers.pop();
                buffer = "";
                i = closeIndex;
            }
            else {
                buffer += char;
            }
        }
        this.#processInlineDeclarations(buffer);
    }
    #processInlineDeclarations(string) {
        let declarations = string.split(";");
        let curMapID = this.#mapID();
        if (!this.#map[curMapID])
            this.#map[curMapID] = [];
        for (let i = 0; i < declarations.length; i++) {
            let declaration = declarations[i].trim();
            if (!declaration)
                continue;
            this.#map[curMapID].push(this.#resolveString(declaration + ";"));
        }
    }
    #findInlineCloseBrace(body, openIndex) {
        let depth = 0;
        for (let i = openIndex; i < body.length; i++) {
            if (body[i] == "{")
                depth++;
            else if (body[i] == "}") {
                depth--;
                if (depth == 0)
                    return i;
            }
        }
        return -1;
    }
    #mapID() { return this.#layers.join(" ")?.replaceAll(" :", ":"); }
    #defineRueVar(line) {
        if (line.split(" ")[0] == "def")
            line = line.replace("def ", "");
        let varName = line.split(":")[0].replaceAll("_", "").trim();
        let varValue = this.#stripSemicolon(line.slice(line.indexOf(":") + 1).trim());
        if (!line.includes(":") || !varName)
            return this.#addError("var", "invalid variable definition");
        let resolvedValue = this.#resolveString(varValue);
        this.#var[varName] = resolvedValue;
        let rootLine = "--" + varName + ": " + resolvedValue;
        this.#map[":root"].push(this.#ensureSemicolon(rootLine));
    }
    #ensureSemicolon(line) {
        if (line.trim().endsWith(";"))
            return line;
        return line + ";";
    }
    #stripSemicolon(line) {
        if (line.trim().endsWith(";"))
            return line.trim().slice(0, -1).trim();
        return line;
    }
    #resolveJavascriptLine(line) {
        if (line.includes("_"))
            return this.#handleRueVarCalls(line);
        return line;
    }
    // Handle var definitions + function calls
    #resolveString(line) {
        let charSplit = line.split("");
        let wordSplit = line.split(" ");
        // Variable Definition
        if (wordSplit[0] == "def") {
            line = line?.replace("def ", "--");
        }
        if (charSplit.includes("_")) {
            line = this.#handleRueVarCalls(line);
        }
        // Function Call
        if (line.includes("(") && line.includes(")")) {
            line = this.#handleFunctionCalls(line);
        }
        return line;
    }
    #extractFunctionCalls(str) {
        if (!str.includes("("))
            return null;
        let numOfLParen = str.split("(").length - 1;
        let indexOfLParen = null;
        let functions = [];
        let currFunc = { name: "", params: "", call: "" };
        for (let i = 0; i < numOfLParen; i++) {
            indexOfLParen = str.indexOf("(");
            // Capture BEHIND (function name)
            for (let i = indexOfLParen; i > 0; --i) {
                let prevChar = str[i - 1];
                if (prevChar != " ") {
                    currFunc.name = prevChar + currFunc.name;
                }
                else
                    break;
            }
            // Capture AHEAD (function parameters)
            for (let i = indexOfLParen; i < str.length; ++i) {
                let nextChar = str[i + 1];
                if (nextChar != ")") {
                    currFunc.params += nextChar;
                }
                else
                    break;
            }
            currFunc.call = currFunc.name + "(" + currFunc.params + ")";
            let params = currFunc.params
                ?.split(",")
                .map((param) => param.trim())
                .filter((param) => param);
            functions.push({ name: currFunc.name, params, call: currFunc.call });
            currFunc = { name: "", params: "", call: "" };
            str = str.replace("(", "_");
        }
        return functions;
    }
    #handleFunctionCalls(str) {
        let extractedCalls = this.#extractFunctionCalls(str);
        if (!extractedCalls)
            return str;
        for (let i = 0; i < extractedCalls.length; i++) {
            let funcName = extractedCalls[i].name;
            let parameters = extractedCalls[i].params;
            // Fetch function from func map
            let func = this.#func?.[funcName];
            let funcCallStr = extractedCalls[i].call || funcName + "(" + parameters + ")";
            if (func) {
                try {
                    let funcCallValue = func.function(...parameters);
                    str = str.replace(funcCallStr, String(funcCallValue));
                }
                catch (error) {
                    this.#addError("handleFunctionCalls", error);
                }
            }
        }
        return str;
    }
    // in development
    #handleJavascriptContext(lineArr) {
        for (let i = 0; i < lineArr.length; i++) {
            let calls = this.#extractFunctionCalls(lineArr[i]);
            if (!calls)
                continue;
            for (let i = 0; i < calls.length; i++) {
                let foundFunc = this.#func?.[calls[i].name];
                if (!foundFunc)
                    continue;
            }
        }
        return lineArr;
    }
    #handleRueVarCalls(line) {
        let curVarName = "";
        for (let i = line.indexOf("_") + 1; i < line.length; i++) {
            if (line[i] == "_")
                break;
            curVarName += line[i];
        }
        if (!curVarName || this.#var[curVarName] == undefined)
            return line;
        line = line.replace("_" + curVarName + "_", this.#var[curVarName]);
        if (line.includes("_"))
            return this.#handleRueVarCalls(line);
        else
            return line;
    }
    print() { console.log(this.#css.join("\n")); }
    getCSS() { return this.#css.join("\n"); }
    getErrors() { return this.#errors; }
    output(path) { writeFileText(path, this.#css.join("\n")); }
}
//# sourceMappingURL=compiler.js.map