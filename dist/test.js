//
// test.ts
// 
// Testing script for
// running Rue compiler
//
import assert from "node:assert/strict";
import { RueFile } from "./src/compiler.js";
function compileFixture(path) {
    let errors = [];
    let oldConsoleError = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    let rueInstance;
    try {
        rueInstance = new RueFile(path);
    }
    finally {
        console.error = oldConsoleError;
    }
    return {
        css: rueInstance.getCSS(),
        errors: rueInstance.getErrors(),
        loggedErrors: errors,
        instance: rueInstance,
    };
}
function assertContains(css, expected, name) {
    assert.ok(css.includes(expected), name + " expected CSS to include:\n" + expected + "\n\nActual CSS:\n" + css);
}
function runCase(test) {
    let result = compileFixture(test.path);
    let contains = test.contains || [];
    let errors = test.errors || [];
    if (test.assert)
        test.assert(result);
    for (let i = 0; i < contains.length; i++) {
        assertContains(result.css, contains[i], test.name);
    }
    for (let i = 0; i < errors.length; i++) {
        assert.ok(result.errors.some((error) => error.includes(errors[i])), test.name + " expected error containing: " + errors[i]);
    }
    return result;
}
function getFailureMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function main(testToRun = "all") {
    let stressTests = [
        {
            name: "basic defs",
            path: "./test/stress-01-basic-defs.rue",
            contains: [
                "--bg: black;",
                "body{\n\tmargin: 0;",
                "background: var(--bg);",
            ],
        },
        {
            name: "deep nesting",
            path: "./test/stress-02-deep-nesting.rue",
            contains: [
                ".app .shell .panel .title{\n\tfont-weight: 700;",
            ],
        },
        {
            name: "pseudo selectors",
            path: "./test/stress-03-pseudo-selectors.rue",
            contains: [
                ".button:hover{\n\tcolor: red;",
                ".button:focus-visible{\n\toutline: solid 2px blue;",
            ],
        },
        {
            name: "rue vars",
            path: "./test/stress-04-rue-vars.rue",
            contains: [
                "--hue: 220;",
                "color: hsl(220, 80%, 50%);",
            ],
        },
        {
            name: "missing rue var",
            path: "./test/stress-05-missing-rue-var.rue",
            contains: [
                "color: _unknown_;",
            ],
        },
        {
            name: "functions",
            path: "./test/stress-06-functions.rue",
            contains: [
                "width: 3px;",
                "padding: 1.5rem;",
            ],
        },
        {
            name: "function errors",
            path: "./test/stress-07-function-errors.rue",
            contains: [
                "width: explode();",
                "height: 2rem;",
            ],
            errors: [
                "handleFunctionCalls: boom",
            ],
        },
        {
            name: "unclosed style",
            path: "./test/stress-08-unclosed-style.rue",
            contains: [
                ".broken{\n\tcolor: red;",
            ],
            errors: [
                "parse: unclosed style block",
            ],
        },
        {
            name: "unexpected close",
            path: "./test/stress-09-unexpected-close.rue",
            contains: [
                ".after{\n\tcolor: green;",
            ],
            errors: [
                "layer: unexpected closing brace",
            ],
        },
        {
            name: "comments",
            path: "./test/stress-10-comments.rue",
            contains: [
                ".shown{\n\tcolor: green;",
            ],
            assert(result) {
                assert.ok(!result.css.includes(".hidden"), "comments should not compile commented selectors");
            },
        },
        {
            name: "empty blocks",
            path: "./test/stress-11-empty-blocks.rue",
            contains: [
                ".empty{\n\t\n}",
                ".parent .child{\n\t\n}",
            ],
        },
        {
            name: "root properties",
            path: "./test/stress-12-root-properties.rue",
            contains: [
                ":root{\n\tcolor: red;\n\tbackground: blue;",
            ],
        },
        {
            name: "invalid var",
            path: "./test/stress-13-invalid-var.rue",
            contains: [
                ".keeps-going{\n\tcolor: red;",
            ],
            errors: [
                "var: invalid variable definition",
            ],
        },
        {
            name: "unclosed function",
            path: "./test/stress-14-unclosed-function.rue",
            errors: [
                "parse: unclosed function block",
            ],
        },
        {
            name: "repeat run",
            path: "./test/stress-15-repeat-run.rue",
            assert(result) {
                let firstCSS = result.css;
                result.instance.run();
                assert.equal(result.instance.getCSS(), firstCSS, "repeat run should not duplicate compiled CSS");
            },
        },
        {
            name: "inline style blocks",
            path: "./test/stress-16-inline-style.rue",
            contains: [
                ".element{\n\tbackground: red;",
                "color: white;",
                ".element .child{\n\tcolor: blue;",
                ".element .child .label{\n\tfont-weight: 700;",
            ],
        },
        {
            name: "mixed vars and functions",
            path: "./test/stress-17-mixed-vars-functions.rue",
            contains: [
                "--space: 2rem;",
                "padding: 2rem;",
                "margin: 1rem;",
            ],
        },
        {
            name: "many selectors",
            path: "./test/stress-18-many-selectors.rue",
            contains: [
                ".a{\n\tcolor: red;",
                ".b{\n\tcolor: blue;",
                ".c .d .e{\n\tcolor: green;",
            ],
        },
        {
            name: "rue vars in function calls",
            path: "./test/stress-19-vars-in-functions.rue",
            contains: [
                "--brand: hsl(175, 75%, 50%);",
                "color: hsl(175, 60%, 40%);",
            ],
        },
        {
            name: "rue vars in javascript functions",
            path: "./test/stress-20-rue-vars-in-js.rue",
            contains: [
                "--hue: 175;",
                "--brand: hsl(175, 75%, 50%);",
                "color: hsl(175, 60%, 40%);",
            ],
        },
        {
            name: "unified var declarations",
            path: "./test/stress-21-unified-vars.rue",
            contains: [
                "--accent: royalblue;",
                "--space: 1rem;",
                "color: royalblue;",
                "padding: 1rem;",
            ],
        },
        {
            name: "inline comments",
            path: "./test/stress-22-inline-comments.rue",
            contains: [
                "--l0: hsl(175, 8%, 8%);",
                "background: hsl(175, 8%, 8%);",
                "content: \"https://example.com/a//b\";",
            ],
            assert(result) {
                assert.ok(!result.css.includes("layer 0"), "inline comments should be removed");
            },
        },
    ];
    let passed = 0;
    let failed = [];
    if (testToRun == "all") {
        for (let i = 0; i < stressTests.length; i++) {
            try {
                runCase(stressTests[i]);
                passed++;
            }
            catch (error) {
                failed.push({
                    name: stressTests[i].name,
                    path: stressTests[i].path,
                    message: getFailureMessage(error),
                });
            }
        }
        let total = stressTests.length;
        console.log(passed, "out of", total, "tests passed", Math.round(passed * 100 / total), "%");
        console.log(failed.length, "tests failed");
        for (let i = 0; i < failed.length; i++) {
            console.log("");
            console.log("failed:", failed[i].name);
            console.log("file:", failed[i].path);
            console.log(failed[i].message);
        }
        if (failed.length)
            process.exitCode = 1;
    }
    else {
        let rueInstance = new RueFile(`./test/${testToRun}.rue`);
        rueInstance.output(`./output/${testToRun}.css`);
    }
}
main();
//# sourceMappingURL=test.js.map