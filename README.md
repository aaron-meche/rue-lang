# Rue Stylesheet Language

Rue is a small stylesheet language for writing CSS with nested selectors, compile-time variables, CSS custom properties, and simple helper functions.

Created by Aaron Meche.

## Installation

```bash
npm install rue-lang
```

## Basic Usage

```js
import { RueFile } from "rue-lang";

const file = new RueFile("./styles.rue");

console.log(file.getCSS());
file.output("./dist/styles.css");
```

You can also compile a string directly:

```js
import { RueFile } from "rue-lang";

const file = new RueFile();

file.feed(`
body{
    margin: 0;
}
`);

console.log(file.getCSS());
```

## Rue Syntax

### Nested Selectors

Rue lets you nest selectors inside other selectors.

```rue
.card{
    padding: 1rem;

    .title{
        font-weight: 700;
    }
}
```

Compiles to:

```css
:root{
	
}
.card{
	padding: 1rem;
}
.card .title{
	font-weight: 700;
}
```

Inline style blocks are supported too:

```rue
.card { padding: 1rem; .title { font-weight: 700; } }
```

### CSS Custom Properties

Use `def` when you want to create a real CSS custom property in `:root`.

```rue
def bg: black;
def accent: royalblue;

body{
    background: var(--bg);
    color: var(--accent);
}
```

That compiles to CSS like:

```css
:root{
	--bg: black;
	--accent: royalblue;
}
```

### Rue Variables

Use `_name_:` when you want a Rue-only compile-time variable. Rue variables do not appear in the final CSS by themselves. They are replaced before CSS is output.

```rue
_brand_: royalblue
_space_: 1rem

button{
    color: _brand_;
    padding: _space_;
}
```

Compiles to:

```css
button{
	color: royalblue;
	padding: 1rem;
}
```

### `def` vs `_var_`

They solve different problems:

`def name: value;` creates a CSS variable:

```rue
def brand: royalblue;

button{
    color: var(--brand);
}
```

`_name_: value` creates a Rue variable:

```rue
_brand_: royalblue

button{
    color: _brand_;
}
```

Use `def` when you want the value available to browser CSS at runtime through `var(--name)`. Use `_name_` when you only want Rue to substitute the value while compiling.

You can also use a Rue variable inside a `def`:

```rue
_brand_: royalblue

def brand: _brand_;
```

This lets Rue decide the value while still emitting a CSS custom property.

### Functions

Rue supports simple helper functions inside `.rue` files.

```rue
func doublePx(value) {
    return value * 2 + "px"
}

.box{
    width: doublePx(10);
}
```

Function bodies are run as JavaScript, so only use trusted Rue files.

## Svelte Preprocessor

Rue includes a Svelte style preprocessor.

```js
import { ruePreprocess } from "rue-lang";

export default {
    preprocess: [
        ruePreprocess()
    ]
};
```

```svelte
<style lang="rue">
.card{
    padding: 1rem;

    .title{
        font-weight: 700;
    }
}
</style>
```

## Vite Plugin

Rue also includes a Vite plugin for importing `.rue` files.

```js
import ruePlugin from "rue-lang";

export default {
    plugins: [
        ruePlugin()
    ]
};
```

```js
import "./styles.rue";
```

If you prefer an explicit subpath import, `rue-lang/vite-plugin` still works.

## Error Handling

The compiler is designed to keep going when it finds malformed Rue input. It records recoverable errors and still returns the CSS it was able to compile.

```js
const file = new RueFile("./styles.rue");

console.log(file.getCSS());
console.log(file.getErrors());
```

## Development

Rue is written in TypeScript and compiled to `dist/` for npm publishing.

```bash
npm run build
npm test
```

Run the local demo site:

```bash
npm run demo:dev
```

## Project Goal

Rue is intended for personal projects where nested styles, simple variables, and small helper functions make CSS faster to write. The compiler currently stays intentionally small and conservative.
