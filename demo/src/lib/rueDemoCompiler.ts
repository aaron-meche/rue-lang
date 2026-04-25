type CssMap = Record<string, string[]>;
type VarMap = Record<string, string>;
type RueCallable = (...params: string[]) => unknown;

interface FunctionCall {
	name: string;
	params: string[];
	call: string;
}

interface FunctionDefinition {
	name: string;
	params: string[];
	body: string[];
	function: RueCallable;
}

type FunctionMap = Record<string, FunctionDefinition>;

export interface CompileResult {
	css: string;
	errors: string[];
}

export function compileRue(source: string): CompileResult {
	const compiler = new RueDemoCompiler();
	compiler.feed(source);

	return {
		css: compiler.getCSS(),
		errors: compiler.getErrors()
	};
}

class RueDemoCompiler {
	#txt = "";
	#layers: string[] = [];
	#map: CssMap = { ":root": [] };
	#var: VarMap = {};
	#func: FunctionMap = {};
	#css: string[] = [];
	#errors: string[] = [];
	#inFunc = false;
	#funcSignature: FunctionCall | null = null;
	#funcBody: string[] = [];
	#funcDepth = 0;

	feed(source: string): void {
		this.#txt = source;
		this.run();
	}

	run(): void {
		this.#layers = [];
		this.#map = { ":root": [] };
		this.#var = {};
		this.#func = {};
		this.#css = [];
		this.#errors = [];
		this.#inFunc = false;
		this.#funcSignature = null;
		this.#funcBody = [];
		this.#funcDepth = 0;

		const lines = this.#txt.split("\n");
		for (let i = 0; i < lines.length; i++) {
			try {
				this.#processLine(this.#stripLineComment(lines[i]).trim());
			} catch (error) {
				this.#addError("line " + (i + 1), error);
			}
		}

		if (this.#inFunc) this.#addError("parse", "unclosed function block");
		if (this.#layers.length) this.#addError("parse", "unclosed style block");

		for (let i = 0; i < Object.keys(this.#map).length; i++) {
			this.#css.push(Object.keys(this.#map)[i] + "{");
			this.#css.push("\t" + (Object.values(this.#map)[i] || []).join("\n\t"));
			this.#css.push("}");
		}
	}

	getCSS(): string {
		return this.#css.join("\n");
	}

	getErrors(): string[] {
		return this.#errors;
	}

	#processLine(line: string): void {
		if (!line) return;

		const lastChar = line[line.length - 1];
		const firstChar = line[0];
		const firstWord = line.split(" ")[0];

		if (firstWord == "//") return;
		if (firstWord == "<!--") return;

		if (this.#inFunc) this.#processFunctionCaptureLine(line, lastChar);
		else this.#processStyleCaptureLine(line, firstChar, firstWord);
	}

	#stripLineComment(line: string): string {
		let quote: string | null = null;
		let escaped = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (char == "\\") {
				escaped = true;
				continue;
			}

			if (quote) {
				if (char == quote) quote = null;
				continue;
			}

			if (char == "\"" || char == "'" || char == "`") {
				quote = char;
				continue;
			}

			if (char == "/" && nextChar == "/") return line.slice(0, i);
		}

		return line;
	}

	#processFunctionCaptureLine(line: string, lastChar: string): void {
		if (lastChar == "{") {
			this.#funcDepth++;
			this.#funcBody.push(this.#resolveJavascriptLine(line));
		} else if (line == "}") {
			if (this.#funcDepth != 0) {
				this.#funcDepth--;
				this.#funcBody.push(this.#resolveJavascriptLine(line));
			} else {
				try {
					if (!this.#funcSignature?.name) throw new Error("invalid function signature");
					const params = this.#funcSignature.params || [];
					this.#func[this.#funcSignature.name] = {
						name: this.#funcSignature.name,
						params,
						body: this.#funcBody,
						function: new Function(...params, this.#funcBody.join("\n")) as RueCallable
					};
				} catch (error) {
					this.#addError("add func", error);
				}

				this.#inFunc = false;
				this.#funcSignature = null;
				this.#funcBody = [];
				this.#funcDepth = 0;
			}
		} else {
			this.#funcBody.push(this.#resolveJavascriptLine(line));
		}
	}

	#processStyleCaptureLine(line: string, firstChar: string, firstWord: string): void {
		if (firstWord == "func") {
			const functionCalls = this.#extractFunctionCalls(line);
			if (!functionCalls?.[0]) return this.#addError("func", "invalid function signature");
			this.#inFunc = true;
			this.#funcSignature = functionCalls[0];
		} else if (line.includes("{") && line.includes("}")) {
			this.#processInlineStyleLine(line);
		} else if (line.includes("{")) {
			this.#layers.push(line.replace("{", "").trim());
			this.#map[this.#mapID()] = [];
		} else if (line == "}") {
			if (this.#layers.length) this.#layers.pop();
			else this.#addError("layer", "unexpected closing brace");
		} else if (firstWord == "def") {
			this.#defineRueVar(line.replace("def ", ""));
		} else if (firstChar == "_") {
			this.#defineRueVar(line);
		} else if (line.includes(":")) {
			const curMapID = this.#mapID() || ":root";
			if (!this.#map[curMapID]) this.#map[curMapID] = [];
			this.#map[curMapID].push(this.#resolveString(this.#ensureSemicolon(line)));
		}
	}

	#processInlineStyleLine(line: string): void {
		const selector = line.slice(0, line.indexOf("{")).trim();
		const body = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}")).trim();

		if (!selector) return this.#addError("layer", "invalid inline style selector");

		this.#layers.push(selector);
		const curMapID = this.#mapID();
		if (!this.#map[curMapID]) this.#map[curMapID] = [];
		if (body) this.#processInlineStyleBody(body);
		this.#layers.pop();
	}

	#processInlineStyleBody(body: string): void {
		let buffer = "";

		for (let i = 0; i < body.length; i++) {
			const char = body[i];

			if (char == "{") {
				const parts = buffer.split(";");
				const selector = (parts.pop() || "").trim();
				this.#processInlineDeclarations(parts.join(";"));

				const closeIndex = this.#findInlineCloseBrace(body, i);
				if (!selector || closeIndex == -1) {
					this.#addError("layer", "invalid nested inline style block");
					return;
				}

				this.#layers.push(selector);
				const curMapID = this.#mapID();
				if (!this.#map[curMapID]) this.#map[curMapID] = [];
				this.#processInlineStyleBody(body.slice(i + 1, closeIndex).trim());
				this.#layers.pop();

				buffer = "";
				i = closeIndex;
			} else {
				buffer += char;
			}
		}

		this.#processInlineDeclarations(buffer);
	}

	#processInlineDeclarations(string: string): void {
		const declarations = string.split(";");
		const curMapID = this.#mapID();
		if (!this.#map[curMapID]) this.#map[curMapID] = [];

		for (let i = 0; i < declarations.length; i++) {
			const declaration = declarations[i].trim();
			if (!declaration) continue;
			this.#map[curMapID].push(this.#resolveString(declaration + ";"));
		}
	}

	#findInlineCloseBrace(body: string, openIndex: number): number {
		let depth = 0;

		for (let i = openIndex; i < body.length; i++) {
			if (body[i] == "{") depth++;
			else if (body[i] == "}") {
				depth--;
				if (depth == 0) return i;
			}
		}

		return -1;
	}

	#resolveString(line: string): string {
		const charSplit = line.split("");
		const wordSplit = line.split(" ");

		if (wordSplit[0] == "def") line = line.replace("def ", "--");
		if (charSplit.includes("_")) line = this.#handleRueVarCalls(line);
		if (line.includes("(") && line.includes(")")) line = this.#handleFunctionCalls(line);

		return line;
	}

	#extractFunctionCalls(str: string): FunctionCall[] | null {
		if (!str.includes("(")) return null;

		const calls: FunctionCall[] = [];
		let working = str;
		const numOfLParen = str.split("(").length - 1;

		for (let i = 0; i < numOfLParen; i++) {
			const indexOfLParen = working.indexOf("(");
			let name = "";
			let params = "";

			for (let j = indexOfLParen; j > 0; --j) {
				const prevChar = working[j - 1];
				if (prevChar != " ") name = prevChar + name;
				else break;
			}

			for (let j = indexOfLParen; j < working.length; ++j) {
				const nextChar = working[j + 1];
				if (nextChar != ")") params += nextChar;
				else break;
			}

			calls.push({
				name,
				params: params.split(",").map((param) => param.trim()).filter((param) => param),
				call: name + "(" + params + ")"
			});

			working = working.replace("(", "_");
		}

		return calls;
	}

	#handleFunctionCalls(str: string): string {
		const extractedCalls = this.#extractFunctionCalls(str);
		if (!extractedCalls) return str;

		for (let i = 0; i < extractedCalls.length; i++) {
			const funcName = extractedCalls[i].name;
			const parameters = extractedCalls[i].params;
			const func = this.#func?.[funcName];
			const funcCallStr = extractedCalls[i].call || funcName + "(" + parameters + ")";

			if (func) {
				try {
					const funcCallValue = func.function(...parameters);
					str = str.replace(funcCallStr, String(funcCallValue));
				} catch (error) {
					this.#addError("handleFunctionCalls", error);
				}
			}
		}

		return str;
	}

	#handleRueVarCalls(line: string): string {
		let curVarName = "";

		for (let i = line.indexOf("_") + 1; i < line.length; i++) {
			if (line[i] == "_") break;
			curVarName += line[i];
		}

		if (!curVarName || this.#var[curVarName] == undefined) return line;
		line = line.replace("_" + curVarName + "_", this.#var[curVarName]);

		if (line.includes("_")) return this.#handleRueVarCalls(line);
		return line;
	}

	#mapID(): string {
		return this.#layers.join(" ").replaceAll(" :", ":");
	}

	#defineRueVar(line: string): void {
		const varName = line.split(":")[0].replaceAll("_", "").trim();
		const varValue = this.#stripSemicolon(line.slice(line.indexOf(":") + 1).trim());
		if (!line.includes(":") || !varName) return this.#addError("var", "invalid variable definition");

		const resolvedValue = this.#resolveString(varValue);
		this.#var[varName] = resolvedValue;

		const rootLine = "--" + varName + ": " + resolvedValue;
		this.#map[":root"].push(this.#ensureSemicolon(rootLine));
	}

	#ensureSemicolon(line: string): string {
		if (line.trim().endsWith(";")) return line;
		return line + ";";
	}

	#stripSemicolon(line: string): string {
		if (line.trim().endsWith(";")) return line.trim().slice(0, -1).trim();
		return line;
	}

	#resolveJavascriptLine(line: string): string {
		if (line.includes("_")) return this.#handleRueVarCalls(line);
		return line;
	}

	#addError(label: string, error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.#errors.push(label + ": " + message);
	}
}
