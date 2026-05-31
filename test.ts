import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import runRue, { RueFile, RueRouter, ruePlugin, ruePreprocess } from "./src/index.js";
import { stripLineComment } from "./src/helpers.js";

interface CompileResult {
    css: string
    html: string
    errors: string[]
    loggedErrors: string[]
    instance: RueFile
}

interface TestCase {
    name: string
    run(): void
}

interface TestFailure {
    name: string
    message: string
}

const fixturesRoot = path.join("test", "fixtures")

function fixturePath(filePath: string): string {
    return path.join(fixturesRoot, filePath)
}

function compileFixture(filePath: string): CompileResult {
    return compile(() => new RueFile(fixturePath(filePath)))
}

function compileSource(source: string): CompileResult {
    return compile(() => {
        let file = new RueFile()
        file.feed(source)
        return file
    })
}

function compile(createFile: () => RueFile): CompileResult {
    let loggedErrors: string[] = []
    let oldConsoleError = console.error

    console.error = (...args: unknown[]) => loggedErrors.push(args.join(" "))
    let instance: RueFile

    try {
        instance = createFile()
    }
    finally {
        console.error = oldConsoleError
    }

    return {
        css: instance.getCSS(),
        html: instance.getHTML(),
        errors: instance.getErrors(),
        loggedErrors,
        instance,
    }
}

function assertIncludes(actual: string, expected: string, label: string): void {
    assert.ok(
        actual.includes(expected),
        `${label} expected output to include:\n${expected}\n\nActual output:\n${actual}`
    )
}

function assertNoCompileErrors(result: CompileResult, label: string): void {
    assert.equal(result.errors.length, 0, `${label} should compile without Rue errors`)
    assert.equal(result.loggedErrors.length, 0, `${label} should not log Rue errors`)
}

function assertErrorIncludes(result: CompileResult, expected: string, label: string): void {
    assert.ok(
        result.errors.some(error => error.includes(expected)),
        `${label} expected Rue error containing: ${expected}\n\nActual errors:\n${result.errors.join("\n")}`
    )
}

function getFailureMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function runPackageIntegrationTests(): void {
    let toolkit = runRue()
    assert.equal(typeof toolkit.style, "function", "default export should include the Rue preprocessor")
    assert.equal(typeof toolkit.transform, "function", "default export should include the Vite plugin")

    let preprocessor = ruePreprocess()
    let skipped = preprocessor.style({
        content: "def accent: royalblue",
        attributes: { lang: "css" },
    })
    assert.equal(skipped, undefined, "preprocessor should ignore non-rue style blocks")

    let preprocessed = preprocessor.style({
        content: "def accent: royalblue",
        attributes: { lang: "rue" },
    })
    assert.equal(preprocessed?.code.includes("--accent: royalblue;"), true, "preprocessor should compile rue CSS")

    let plugin = ruePlugin()
    assert.equal(plugin.transform("body { color: red }", "/src/app.css"), null, "vite plugin should ignore non-rue files")

    let transformed = plugin.transform("def accent: royalblue", "/src/lib/main.rue?import")
    assert.equal(transformed?.code.includes("--accent: royalblue;"), true, "vite plugin should compile rue imports")
}

function runRouterTests(): void {
    let outputRoot = path.join("test", ".tmp-router-out")
    fs.rmSync(outputRoot, { recursive: true, force: true })
    let router = new RueRouter(fixturePath("router-web"), outputRoot)

    try {
        assert.equal(router.routes.length, 2, "router should build root and nested routes")

        let homePath = path.join(outputRoot, "index.html")
        let aboutPath = path.join(outputRoot, "about", "index.html")
        assert.equal(fs.existsSync(homePath), true, "router should write root index.html")
        assert.equal(fs.existsSync(aboutPath), true, "router should write nested index.html")

        let home = fs.readFileSync(homePath, "utf8")
        let about = fs.readFileSync(aboutPath, "utf8")

        assertIncludes(home, "Fixture Layout", "router home")
        assertIncludes(home, "Home route", "router home")
        assertIncludes(about, "Fixture Layout", "router about")
        assertIncludes(about, "About route", "router about")
        assertIncludes(home, ".layout-shell", "router should include layout CSS")
        assertIncludes(about, ".about-page", "router should include page CSS")
    }
    finally {
        fs.rmSync(outputRoot, { recursive: true, force: true })
    }
}

const tests: TestCase[] = [
    {
        name: "package integrations",
        run: runPackageIntegrationTests,
    },
    {
        name: "line comments preserve urls",
        run() {
            assert.equal(stripLineComment("plain text"), "plain text")
            assert.equal(stripLineComment("// full line comment"), "")
            assert.equal(stripLineComment("color: red // comment"), "color: red ")
            assert.equal(stripLineComment("Link(\"https://example.com\")"), "Link(\"https://example.com\")")
            assert.equal(stripLineComment("Link(\"https://example.com\") // comment"), "Link(\"https://example.com\") ")
            assert.equal(stripLineComment("Link(\"https://one.test\", \"https://two.test\") // comment"), "Link(\"https://one.test\", \"https://two.test\") ")
        },
    },
    {
        name: "css styles and defs",
        run() {
            let result = compileFixture("styles.rue")
            assertNoCompileErrors(result, "styles")
            assertIncludes(result.css, "--ink: #111315;", "styles")
            assertIncludes(result.css, ".card{\n\tpadding: 1rem;", "styles")
            assertIncludes(result.css, ".card:hover{\n\tcolor: var(--accent);", "styles")
        },
    },
    {
        name: "function helpers in CSS",
        run() {
            let result = compileFixture("function-style.rue")
            assertNoCompileErrors(result, "function style")
            assertIncludes(result.css, "--space: 1.5rem;", "function style")
            assertIncludes(result.css, "padding: 2rem;", "function style")
        },
    },
    {
        name: "components and interface output",
        run() {
            let result = compileFixture("component-interface.rue")
            assertNoCompileErrors(result, "component interface")
            assertIncludes(result.html, "<h1", "component interface")
            assertIncludes(result.html, "class=\"hero-title\"", "component interface")
            assertIncludes(result.html, "font-size:2rem;", "component interface")
            assertIncludes(result.html, "Build UI without raw HTML", "component interface")
            assertIncludes(result.html, "Plain text output", "component interface")
        },
    },
    {
        name: "component call config syntax",
        run() {
            let result = compileFixture("component-call-config.rue")
            assertNoCompileErrors(result, "component call config")
            assertIncludes(result.html, "Rue", "component call config")
            assertIncludes(result.html, "padding:0.4rem 0.7rem;", "component call config")
            assertIncludes(result.html, "border-radius:999px;", "component call config")
            assertIncludes(result.html, "AB", "component call config")
            assertIncludes(result.html, "Interface text", "component call config")
            assertIncludes(result.html, "font-size:1.2rem;", "component call config")
            assertIncludes(result.html, "Count: 3", "component call config")
            assertIncludes(result.html, "__rueState.set(&quot;count&quot;", "component call config")
        },
    },
    {
        name: "advanced component call config syntax",
        run() {
            let result = compileFixture("component-call-config-advanced.rue")
            assertNoCompileErrors(result, "advanced component call config")
            assertIncludes(result.css, ".action-button{\n\tborder: solid 1px black;", "advanced component call config")
            assertIncludes(result.html, "Live: 1", "advanced component call config")
            assertIncludes(result.html, "live_state=\"state_0\"", "advanced component call config")
            assertIncludes(result.html, "<img src=\"cover.png\"", "advanced component call config")
            assertIncludes(result.html, "role=\"group\"", "advanced component call config")
            assertIncludes(result.html, "Cover", "advanced component call config")
            assertIncludes(result.html, "class=\"action-button\"", "advanced component call config")
            assertIncludes(result.html, "__rueState.set(&quot;count&quot;", "advanced component call config")
            assertIncludes(result.html, "width:3rem;height:2rem;background:#111;", "advanced component call config")
            assertIncludes(result.html, "color:purple;", "advanced component call config")
        },
    },
    {
        name: "live state output",
        run() {
            let result = compileFixture("live-state.rue")
            assertNoCompileErrors(result, "live state")
            assertIncludes(result.html, "window.__rueStateData = {\"count\":2};", "live state")
            assertIncludes(result.html, "live_state=\"state_0\"", "live state")
            assertIncludes(result.html, "\"state_0\": () => {", "live state")
            assertIncludes(result.html, "__rueState.set(&quot;count&quot;", "live state")
            assertIncludes(result.html, "Count: 2", "live state")
        },
    },
    {
        name: "raw javascript output",
        run() {
            let result = compileFixture("raw-js.rue")
            assertNoCompileErrors(result, "raw js")
            assertIncludes(result.html, "window.__rueFixtureLoaded = true", "raw js")
            assertIncludes(result.html, "Raw JS fixture", "raw js")
        },
    },
    {
        name: "feed compiles by default",
        run() {
            let result = compileSource(`
def accent: royalblue

Interface {
    new Wrapper("compiled from feed")
}
`)
            assertNoCompileErrors(result, "feed")
            assertIncludes(result.css, "--accent: royalblue;", "feed")
            assertIncludes(result.html, "compiled from feed", "feed")
        },
    },
    {
        name: "repeat run is stable",
        run() {
            let result = compileFixture("component-interface.rue")
            let firstCSS = result.css
            let firstHTML = result.html

            result.instance.run()

            assert.equal(result.instance.getCSS(), firstCSS, "repeat run should not duplicate CSS")
            assert.equal(result.instance.getHTML(), firstHTML, "repeat run should not change HTML")
        },
    },
    {
        name: "compiler errors",
        run() {
            let unclosedStyle = compileFixture("errors/unclosed-style.rue")
            assertErrorIncludes(unclosedStyle, "unclosed style block", "unclosed style")

            let unexpectedClose = compileFixture("errors/unexpected-close.rue")
            assertErrorIncludes(unexpectedClose, "unexpected closing brace", "unexpected close")

            let badComponent = compileFixture("errors/bad-component.rue")
            assertErrorIncludes(badComponent, "missing opening brace", "bad component")
        },
    },
    {
        name: "router layout output",
        run: runRouterTests,
    },
]

function main(): void {
    let passed = 0
    let failed: TestFailure[] = []

    for (let i = 0; i < tests.length; i++) {
        try {
            tests[i].run()
            passed++
        }
        catch (error) {
            failed.push({
                name: tests[i].name,
                message: getFailureMessage(error),
            })
        }
    }

    console.log(`${passed} out of ${tests.length} tests passed`)
    console.log(`${failed.length} tests failed`)

    for (let i = 0; i < failed.length; i++) {
        console.log("")
        console.log("failed:", failed[i].name)
        console.log(failed[i].message)
    }

    if (failed.length) process.exitCode = 1
}

main()
