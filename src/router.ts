//
// Rue Router
//
// Builds static HTML routes from a web directory.
//

import fs from "fs";
import path from "path";
import { RueFile } from "./compiler.js";
import { readFileText, writeFileText } from "./helpers.js";

export interface RueRoute {
    path: string
    source: string
    output: string
    file: RueFile
}

export class RueRouter {
    routes: RueRoute[] = []

    constructor(
        public webRoot: string = "./web",
        public outputRoot: string = "./out",
        autoBuild: boolean = true
    ) {
        if (autoBuild) this.build()
    }

    build(): RueRoute[] {
        let layoutPath = path.join(this.webRoot, "layout.rue")
        let layoutText = fs.existsSync(layoutPath) ? readFileText(layoutPath) : ""
        let pageFiles = this.#findPageFiles(this.webRoot)

        this.routes = pageFiles.map(pagePath => this.#buildRoute(pagePath, layoutText))
        return this.routes
    }

    #buildRoute(pagePath: string, layoutText: string): RueRoute {
        let routePath = this.#routePath(pagePath)
        let outputPath = this.#outputPath(routePath)
        let source = readFileText(pagePath)
        let file = new RueFile()

        file.feed(layoutText ? source + "\n\n" + layoutText : source, true)
        writeFileText(outputPath, file.getHTML())

        return {
            path: routePath,
            source: pagePath,
            output: outputPath,
            file: file
        }
    }

    #findPageFiles(dir: string): string[] {
        let files: string[] = []

        if (!fs.existsSync(dir)) return files

        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            let entryPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
                files.push(...this.#findPageFiles(entryPath))
                return
            }

            if (entry.name == "main.rue")
                files.push(entryPath)
        })

        return files.sort()
    }

    #routePath(pagePath: string): string {
        let routeDir = path.relative(this.webRoot, path.dirname(pagePath))
        if (!routeDir) return "/"
        return "/" + routeDir.split(path.sep).join("/")
    }

    #outputPath(routePath: string): string {
        if (routePath == "/") return path.join(this.outputRoot, "index.html")
        return path.join(this.outputRoot, routePath, "index.html")
    }
}
