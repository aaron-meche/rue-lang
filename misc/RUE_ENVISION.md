# Rue Method 3 Syntax Assessment

This note assesses the proposed "method 3" component syntax from `dev/web/sandbox.rue` and the compiler/runtime changes Rue would need to support it well.

## Current Syntax

Rue currently treats a `component` body as a `UIElement` config object.

```rue
component Card(title) {
    display: grid
    gap: 1rem
    content: [
        new Wrapper(title)
        new Button("Open", {
            cursor: pointer
        })
    ]
}
```

The compiler captures the component block, prepares each line into JavaScript-compatible object syntax, then wraps the body:

```js
return new UIElement({
    ...
})
```

This is simple and practical, but it keeps Rue close to JavaScript object literals. The language still asks the author to think in terms of `content: [...]`.

## Proposed Method 3

```rue
component GameCard(gameObj) {
    let gameImgSrc = gameObj?.thumb ?? null
    let gameTitle = gameObj?.title ?? "Empty Title"
    let gameTags = gameObj?.tags ?? []

    return new VStack
        padding: 0.8rem
        border-radius: 1.6rem

        new Image(gameImgSrc)
            width: 100%
            aspect-ratio: 16 / 9
            border-radius: 0.8rem

        new ItemLabel(gameTitle)
        new ItemDescr(gameTags.join(", "))
}
```

This syntax makes the component body read like a UI tree:

- `return new VStack` starts the root element.
- Indented `key: value` lines become config for the current element.
- Indented `new Something(...)` lines become children.
- Deeper indented config lines belong to the most recent child.

## Assessment

Method 3 would make Rue better as a language.

The main reason is that it gives Rue its own authoring model instead of feeling like JavaScript object syntax with optional commas. It is closer to how UI is actually understood: parent element, local styles, nested children.

It also removes the least attractive part of current Rue components: manually opening `content: [` and managing arrays inside component config. That alone would make serious Rue interfaces easier to scan.

However, Method 3 would make the compiler more complex in the short term.

Rue's current compiler is mostly line-based. It captures brace-delimited blocks and then transforms lines into runnable JavaScript. Method 3 requires the compiler to understand indentation and build a nested UI structure before emitting JavaScript. That is a different parsing model.

Long term, Method 3 could simplify Rue's mental model. It would not simplify the compiler unless Rue commits to a proper small parser for component/interface bodies.

## Recommendation

Adopt Method 3 as Rue's target component syntax, but do not bolt it directly onto `#prepareBlockLine`.

The best path is:

1. Keep current syntax working while Method 3 is experimental.
2. Add a dedicated tree parser for returned UI trees.
3. Use Method 3 only after `return new ...` at first.
4. Later decide whether `Interface` bodies should also support the same tree syntax.

Do not try to support every possible shorthand immediately. The first implementation should be narrow and predictable.

## Compiler Changes Needed

### 1. Preserve Indentation During Capture

Current capture logic trims lines early:

```ts
let currLine = stripLineComment(lines[i]).trim()
```

Method 3 needs leading whitespace because indentation defines parent/child relationships.

Necessary change:

- Capture both the raw line and the trimmed line.
- Keep indentation width for tree parsing.
- Continue using trimmed lines for normal JavaScript/object-line behavior.

Suggested internal shape:

```ts
interface RueCapturedLine {
    raw: string
    text: string
    indent: number
    lineNumber: number
}
```

This does not need to replace the whole compiler immediately, but Method 3 parsing needs this information.

### 2. Detect Tree Return Blocks

The compiler needs to identify this pattern:

```rue
return new VStack
```

It should not confuse it with current JavaScript syntax:

```rue
return new VStack([...], {...})
```

Simple detection rule:

- Line starts with `return new `
- Line does not contain `(`
- Line does not end with `{`
- The next non-empty line is more indented

Then pass control to a dedicated UI tree compiler.

### 3. Add A UI Tree Node Representation

The compiler should build a small intermediate structure instead of trying to emit JavaScript line by line.

```ts
interface RueTreeNode {
    factory: string
    args: string
    config: string[]
    children: RueTreeNode[]
    textChildren: string[]
}
```

This does not have to become a full AST. It only needs to represent a returned UI element tree.

### 4. Parse Node Lines

The parser should recognize node lines like:

```rue
new VStack
new Image(gameImgSrc)
new ItemLabel(gameTitle)
```

Rules:

- `new Name` starts a child with no constructor args.
- `new Name(args)` starts a child with constructor args.
- A plain string line can become a text child.
- A known component call like `GameCard(game)` may become a child call.

This is where Rue must be careful. The compiler should not treat every arbitrary JavaScript expression as a tree node unless it is explicitly allowed.

### 5. Parse Config Lines

Lines with `key: value` under a node become config values for that node.

Example:

```rue
new Image(gameImgSrc)
    width: 100%
    aspect-ratio: 16 / 9
```

Compiles to a config object:

```js
{
    "width": "100%",
    "aspect-ratio": "16 / 9"
}
```

This can reuse the same value rules currently used by `#prepareObjectProperty`, but the logic should be extracted cleanly rather than stretched further inside `#prepareBlockLine`.

### 6. Emit JavaScript From The Tree

The compiler has to convert the parsed tree into valid runtime calls.

The hard part is that Rue runtime constructors are not currently uniform:

- `UIElement(config)`
- `Image(imgURL, config)`
- `Button(content, config)`
- `Wrapper(content, config)`
- `VStack(elements, config)`
- `HStack(elements, config)`

Method 3 is easiest if children and config can be emitted consistently.

Possible emission:

```js
new VStack([
    new Image(gameImgSrc, {
        width: "100%",
        "aspect-ratio": "16 / 9",
        "border-radius": "0.8rem"
    }),
    new ItemLabel(gameTitle),
    new ItemDescr(gameTags.join(", "))
], {
    padding: "0.8rem",
    "border-radius": "1.6rem"
})
```

This works for `VStack` and `HStack`, but it does not generalize cleanly across every runtime class.

### 7. Normalize Runtime Element Creation

To keep the compiler from needing a hardcoded table of every class constructor, Rue should eventually add a runtime creation helper.

Example:

```ts
createRueElement(factory, args, config, children)
```

Then Method 3 could compile to something like:

```js
createRueElement(VStack, [], {
    padding: "0.8rem",
    "border-radius": "1.6rem"
}, [
    createRueElement(Image, [gameImgSrc], {
        width: "100%",
        "aspect-ratio": "16 / 9"
    }, [])
])
```

This would make the compiler more stable because it would stop caring about constructor shapes.

Without this helper, the compiler either needs:

- a registry of constructor types and argument rules, or
- stricter runtime constructor conventions.

The cleaner long-term answer is a small runtime helper.

### 8. Keep JavaScript Statements Before The Tree

Method 3 still needs normal JavaScript setup lines:

```rue
let gameTitle = gameObj?.title ?? "Empty Title"
```

Component parsing should split the body into:

- setup lines before `return new ...`
- one returned tree block

Then emit:

```js
let gameTitle = ...
return createRueElement(...)
```

This keeps the syntax useful without turning Rue into a full JavaScript parser.

### 9. Decide Whether Interface Uses Method 3

There are two possible directions:

Current interface:

```rue
Interface {
    Hero()
    new Wrapper("Text")
}
```

Potential tree interface:

```rue
Interface {
    new VStack
        gap: 2rem
        Hero()
        FeatureGrid()
}
```

Recommendation:

- Support Method 3 inside components first.
- Add Method 3 inside `Interface` only after component parsing is stable.

That keeps the first implementation smaller.

### 10. Update Error Handling

Method 3 needs clear parse errors:

- invalid indentation
- config line without a parent node
- child line at an impossible indent level
- unsupported tree expression
- missing returned tree after `return new ...`

Good errors matter because indentation-based syntax becomes frustrating when mistakes are silent.

### 11. Update Tests

The testing system would need fixtures for:

- root tree return
- nested child config
- text children
- component calls as children
- JavaScript setup before tree return
- live state inside tree config
- event handlers inside tree config
- bad indentation
- unknown/unsupported tree lines
- current syntax compatibility

The most important test is that Method 3 compiles to the same HTML as an equivalent current Rue component.

### 12. Update TextMate Grammar

Syntax highlighting will need new rules for:

- `return new Name` without parentheses
- indented Rue config under tree nodes
- nested element lines
- JavaScript setup lines before the tree
- `@state` references inside tree config and callbacks

This matters because Method 3 will look broken in the editor if the grammar still expects JavaScript object syntax.

## Compiler Complexity Impact

### Short Term

Method 3 complexifies the compiler.

Expected impact:

- More parsing state.
- Indentation tracking.
- A small tree representation.
- New JavaScript emission logic.
- More edge cases around mixed JavaScript and Rue syntax.

The current compiler can stay line-oriented because current Rue bodies are close to JavaScript object literals. Method 3 is not close enough to JavaScript to safely handle with line preparation alone.

### Long Term

Method 3 can simplify Rue if it becomes the primary component syntax.

It can eventually reduce the need for:

- optional comma recovery in component content arrays
- manual `content: [` blocks
- repeated `new UIElement({ ... })` wrappers
- noisy nested JavaScript object config

But this only happens if Rue replaces some current line-preparation logic with a small intentional parser. If Method 3 is added as another pile of conditions inside the current line compiler, the compiler will become worse.

## Runtime Complexity Impact

The runtime should become slightly more abstract.

The main issue is constructor inconsistency. Method 3 wants a single conceptual shape:

```text
Element
    config
    children
```

The current runtime has multiple constructor shapes. That is fine for JavaScript users, but it makes compiler output harder.

Best runtime change:

- Add one helper that knows how to build Rue runtime elements from `factory`, `args`, `config`, and `children`.
- Keep existing classes working.
- Let the compiler target the helper.

This adds a little runtime code but avoids compiler hardcoding.

## Language Design Impact

Method 3 makes Rue feel more like a real UI language.

Benefits:

- More readable component structure.
- Less JavaScript punctuation.
- Less `content` boilerplate.
- More natural nested UI authoring.
- Clearer difference between Rue and plain JS object config.

Costs:

- Indentation becomes meaningful.
- Syntax errors need better diagnostics.
- Formatter support becomes more important.
- The compiler needs a real tree pass.

Overall, the language becomes better if Method 3 is treated as a deliberate tree syntax.

## Recommended Final Syntax

Target syntax:

```rue
component GameCard(gameObj) {
    let gameImgSrc = gameObj?.thumb ?? null
    let gameTitle = gameObj?.title ?? "Empty Title"
    let gameTags = gameObj?.tags ?? []

    return new VStack
        padding: 0.8rem
        border-radius: 1.6rem
        gap: 0.8rem

        new Image(gameImgSrc)
            width: 100%
            aspect-ratio: 16 / 9
            border-radius: 0.8rem

        new ItemLabel(gameTitle)
        new ItemDescr(gameTags.join(", "))
}
```

Rules:

- One returned tree per component.
- JavaScript setup is allowed before the returned tree.
- Config lines belong to the nearest element at the matching indentation level.
- Child nodes must be indented below their parent.
- Current object-style Rue remains supported during transition.

## Implementation Strategy

Recommended phased plan:

1. Add captured-line objects with indentation metadata.
2. Detect `return new Name` tree syntax in component bodies.
3. Build a small tree parser for only returned UI trees.
4. Emit JavaScript for `UIElement`, `VStack`, `HStack`, `Wrapper`, `Button`, and `Image`.
5. Add a runtime `createRueElement` helper to remove constructor-specific compiler logic.
6. Add tests that compare Method 3 output against current syntax output.
7. Add Method 3 support to `Interface` only after component support is stable.
8. Update README, sandbox examples, and syntax highlighting.

## Final Decision

Method 3 is worth pursuing.

It makes Rue better for authors and gives the language a stronger identity. It does not make the compiler simpler immediately. It makes the compiler more complex unless the implementation introduces a small tree parser and avoids cramming the feature into the current line-preparation path.

The right tradeoff is to accept a little more compiler structure in exchange for a much cleaner Rue authoring model.

