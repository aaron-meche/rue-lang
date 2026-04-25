export type RueCSSMap = Record<string, string[]>;
export type RueVarMap = Record<string, string>;
export type RueCallable = (...params: string[]) => unknown;
export interface RueFunctionCall {
    name: string;
    params: string[];
    call: string;
}
export interface RueFunctionSignature {
    name: string;
    params: string[];
    call?: string;
}
export interface RueFunctionDefinition {
    name: string;
    params: string[];
    body: string[];
    function: RueCallable;
}
export type RueFunctionMap = Record<string, RueFunctionDefinition>;
export declare class RueFile {
    #private;
    constructor(filepath?: string, doNotCompile?: boolean);
    feed(string: string, doNotCompile?: boolean): void;
    run(): void;
    print(): void;
    getCSS(): string;
    getErrors(): string[];
    output(path: string): void;
}
//# sourceMappingURL=compiler.d.ts.map