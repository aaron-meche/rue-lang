# Rue Stylesheet Language

Rue is a small stylesheet language for writing nested CSS with lightweight variables and custom JavaScript-powered helpers.

Created by Aaron Meche.

## Installation

```bash
npm install rue-lang
```

## Basic Usage

```js
import { RueFile } from "rue-lang";

const file = new RueFile("./styles.rue");
const css = file.getCSS();

file.output("./dist/styles.css");
```

You can also feed Rue source directly:

```js
import { RueFile } from "rue-lang";

const file = new RueFile();

file.feed(`
def bg: black;

body{
    margin: 0;
    background: var(--bg);
}
`);

console.log(file.getCSS());
```

## Rue Syntax

### CSS Variables

Use `def` to write CSS custom properties into `:root`.

```rue
def bg: black;
def accent: blue;

body{
    background: var(--bg);
    color: var(--accent);
}
```

### Nested Selectors

Selectors can be nested with braces. Rue joins parent and child selectors into normal CSS selectors.

```rue
.page{
    margin: 0 auto;

    .title{
        font-size: 2rem;
    }
}
```

Compiles to:

```css
:root{
	
}
.page{
	margin: 0 auto;
}
.page .title{
	font-size: 2rem;
}
```

### Rue Variables

Rue variables are defined with `_name_:` and called with `_name_`.

```rue
_hue_: 220

def hue: _hue_;

.button{
    color: hsl(_hue_, 80%, 50%);
}
```

### Functions

Rue supports simple custom functions inside `.rue` files.

```rue
func double(value) {
    return value * 2
}

.box{
    width: double(10)px;
}
```

Function bodies are run as JavaScript, so only use trusted Rue files.

## Svelte Preprocessor

Rue includes a Svelte style preprocessor.

```js
import runRue from "rue-lang";

export default {
    preprocess: [
        runRue()
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
import ruePlugin from "rue-lang/src/vite-plugin.js";

export default {
    plugins: [
        ruePlugin()
    ]
};
```

```js
import "./styles.rue";
```

## Error Handling

The compiler is designed to keep going when it finds malformed Rue input. It records recoverable errors and still returns the CSS it was able to compile.

```js
const file = new RueFile("./styles.rue");

console.log(file.getCSS());
console.log(file.getErrors());
```

## Project Goal

Rue is intended for personal projects where nested styles, simple variables, and small helper functions make CSS faster to write. The compiler currently stays intentionally small and conservative.
