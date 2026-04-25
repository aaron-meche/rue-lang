export interface RueViteResolveContext {
    id: string;
    importer?: string;
}
export interface RueViteHotUpdateContext {
    file: string;
    server: {
        ws: {
            send(message: {
                type: string;
            }): void;
        };
    };
}
export interface RueVitePlugin {
    name: string;
    enforce: "pre";
    resolveId(id: string, importer?: string): string | void;
    transform(code: string, id: string): {
        code: string;
        map: null;
    } | null;
    handleHotUpdate(context: RueViteHotUpdateContext): void;
}
export default function ruePlugin(): RueVitePlugin;
//# sourceMappingURL=vite-plugin.d.ts.map