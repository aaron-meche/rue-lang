# Rue

Rue is an experimental TypeScript compiler and UI runtime for building web interfaces from `.rue` files.

Rue started as a small stylesheet language for nested CSS. It is currently evolving into a compact UI language that combines CSS-like styling, JavaScript-powered components, live state, and file-based routing without writing HTML syntax directly.

Created by Aaron Meche.

## Status

Rue is under active development. The syntax and public API may change while the project moves from a stylesheet compiler toward a fuller Rue UI workflow.

Current focus:

- `.rue` files as the primary UI authoring format.
- Components that compile into `UIElement` runtime objects.
- Ordered `Interface` blocks for page output.
- CSS-like style blocks and CSS custom properties.
- Lightweight live state with `@state`.
- Static route generation from a `web/` directory into an `out/` directory.

## Install

```bash
npm install rue-lang
```

For local development:

```bash
npm install
npm run build
node test.js
```

The local smoke test builds routes from `dev/web` into `dev/out`.

## Basic Route Build

```js
import { RueRouter } from "rue-lang"

new RueRouter("./web", "./out")
```

Route convention:

```text
web/main.rue          -> /
web/about/main.rue    -> /about
web/layout.rue        -> shared layout
out/index.html        -> generated home page
out/about/index.html  -> generated about page
```

`layout.rue` can wrap child page output by placing `Interface` inside its own `Interface` block.

## Rue File Example

```rue
def accent: #19c6a7

.counter-card {
    padding: 1rem
    border: solid 1px rgba(0, 0, 0, 0.12)
}

@state count = 0

component Counter() {
    className: counter-card
    display: grid
    gap: 0.8rem
    content: [
        new Wrapper("Counter")

        new UIElement({
            font-size: 2rem
            font-weight: 800
            content: () => {
                return @count
            }
        })

        new Button("Increment", {
            background: var(--accent)
            padding: 0.7rem 1rem
            cursor: pointer
            onclick: () => {
                @count++
            }
        })
    ]
}

Interface {
    Counter()
}
```

## Core Syntax

### Styles

Rue supports CSS-like blocks with nested selector behavior and optional semicolons.

```rue
.card {
    padding: 1rem

    :hover {
        background: #f5f5f5
    }
}
```

### CSS Variables

Use `def` to emit CSS custom properties into `:root`.

```rue
def ink: #111315
def accent: #19c6a7
```

### Components

Components are functions whose bodies become `UIElement` config objects.

```rue
component Heading(text) {
    font-size: 2.4rem
    font-weight: 800
    content: text
}
```

The compiler treats that like a function returning:

```js
new UIElement({
    "font-size": "...",
    content: text
})
```

Rue style keys are written in CSS form, such as `font-size`, and are converted into runtime output.

### Interface

Every page-oriented Rue file uses an `Interface` block as its ordered output.

```rue
Interface {
    Heading("Rue")
    new Wrapper("Build UI from Rue files.")
}
```

The interface body is evaluated as an array of runtime UI content.

### Live State

Use `@state` to define live values and `@name` to reference them inside Rue expressions.

```rue
@state count = 4

content: () => {
    return @count
}

onclick: () => {
    @count++
}
```

The compiler rewrites state references into generated browser-side state updates.

### Raw JavaScript

A top-level raw JavaScript block can be inserted into the generated HTML.

```rue
{
    console.log("Loaded from Rue")
}
```

Use this as an escape hatch for small browser scripts.

## Runtime Classes

Rue exports UI runtime primitives from `rue-lang` and `rue-lang/interface`.

Common classes:

- `UIElement`
- `Wrapper`
- `Button`
- `Image`
- `Rectangle`
- `HStack`
- `VStack`
- `StateStore`

Example:

```js
import { UIElement, Button, Wrapper } from "rue-lang"
```

`UIElement` config keys are interpreted as protocols, HTML attributes, or inline styles.

Common protocol keys:

- `content`
- `onclick`
- `onhover`
- `attrs`
- `aria`
- `data`
- `tag`
- `src`
- `self`

Style keys can use underscores in JavaScript objects, such as `font_size`, and Rue/runtime output converts them to CSS form.

## Programmatic Compiler Usage

```js
import { RueFile } from "rue-lang"

const file = new RueFile("./web/main.rue")

console.log(file.getCSS())
console.log(file.getHTML())
console.log(file.getErrors())
```

Compile from a string:

```js
import { RueFile } from "rue-lang"

const file = new RueFile()

file.feed(`
body {
    margin: 0
}

Interface {
    new Wrapper("Hello from Rue")
}
`)

console.log(file.getHTML())
```

## Vite And Svelte CSS Integration

Rue still includes the earlier stylesheet-oriented integrations.

Vite:

```js
import ruePlugin from "rue-lang"

export default {
    plugins: [ruePlugin()]
}
```

Svelte style preprocessing:

```js
import { ruePreprocess } from "rue-lang"

export default {
    preprocess: [ruePreprocess()]
}
```

```svelte
<style lang="rue">
.card {
    padding: 1rem
}
</style>
```

These integrations currently compile Rue style output, not full static routes.

## Project Structure

```text
src/compiler.ts       RueFile parser/compiler
src/interface.ts      UI runtime classes
src/router.ts         Static route builder
src/vite-plugin.ts    Vite stylesheet plugin
dev/web/              Local Rue showcase source
dev/out/              Generated local HTML output
rue.tmLanguage.json   VS Code TextMate grammar
test.js               Local route-generation smoke test
```

## Development

```bash
npm run build
node test.js
```

Useful commands:

- `npm run build`: compile TypeScript.
- `node test.js`: generate local HTML routes from `dev/web` to `dev/out`.
- `npm test`: build and run the package test entry.

## Known Limits

- Rue is experimental and changing quickly.
- General import syntax is intentionally not part of the current workflow.
- The old object-shaped `Interface { head, body, style }` model is removed.
- Inline single-line CSS blocks are not currently supported.
- The public package metadata may lag behind the active Rue UI direction.

## License

MIT
