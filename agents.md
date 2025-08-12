# fte.js templates: guide for AI agents

This document teaches an AI agent how to write and maintain fte.js templates across HTML/JS/TS/Markdown and generic code-generation scenarios.

## Core concepts

- A template is a text file that can embed JavaScript control flow and expressions using special delimiters.
- Supported file kinds: `.nhtml` (HTML), `.njs` (JavaScript), `.nts` (TypeScript), `.nmd` (Markdown). The surrounding text is the host language.
- Inline usage: tagged template literal `fte` in JS/TS code: `const s = fte`...``.

## Delimiters and structure

- Code blocks: `<# ... #>`
  - Trimmed variant removes surrounding whitespace/newlines: `<#- ... -#>`
  - Use for statements (`if/for/const`), declarations, helper code. Do not output text here unless you `write` to a buffer.

- Expressions:
  - Unescaped (insert as-is): `#{ expr }`
  - Escaped for HTML (entity-escape): `!{ expr }`

- Directives: `<#@ name (optional, comma-separated, quoted params) #>`
  - Common: `extend`, `context`, `alias`, `requireAs`, `deindent`, `includeMainChunk`, `useHash`, toggles `noContent`/`noSlots`/`noBlocks`/`noPartial`/`noOptions`, return mode `promise`/`callback`.
  - Examples: `<#@ context 'data' #>`, `<#@ extend 'base.nhtml' #>`, `<#@ requireAs('templ','alias') #>`

- Blocks and slots (composition):
  - Define: `<# block 'name' : #> ... <# end #>` (or trimmed `<#- ... -#>`)
  - Render inside text via `#{ content('name', optionalContext) }`
  - `slot` behaves the same structurally.

- Comments: `<* any text here *>` (ignored by the engine)

- EJS-style tags (optional compatibility):
  - `<% code %>`, `<%_ code _%>`, `<%- expr %>` (unescaped), `<%= expr %>` (escaped), `<%# comment %>`

## Authoring rules for agents

1) Pick file kind by target host language:
   - HTML → `.nhtml`; JS → `.njs`; TS → `.nts`; Markdown → `.nmd`. This enables correct syntax highlighting and formatting.

2) Prefer expressions for small insertions, code blocks for flow/control:
   - Good: `Hello, #{user.name}!`
   - Good: `<# for (const item of list) { #> ... <# } #>`
   - Avoid heavy logic inside `#{}`; compute first in a `<# ... #>` block.

3) Whitespace control with trimmed blocks:
   - Use `<#- ... -#>` around control statements when newlines must not leak in output.

4) Inheritance/composition:
   - Parent templates must call `#{ content() }` or `#{ content('area') }`.
   - Child templates can override blocks or supply slot content.

5) Partials and aliases:
   - Render partials with `#{ partial(ctx, 'name') }`. Use `<#@ requireAs('path','alias') #>` to import by alias.

6) Directives validation:
   - `extend`/`context` require 1 param.
   - `requireAs` requires 2 params.
   - `deindent` accepts 0 or 1 numeric param.
   - Flags like `noContent` must not have params.

7) Prefer runtime helpers:
   - Use `partial(obj, name)` to include other templates.
   - Use `content(blockName, ctx?)` to render declared blocks.
   - Use `slot(name, value?)` to collect/render named slots; repeated values are deduplicated.
   - For multi-file generation use `chunkStart(name)`/`chunkEnd()` with `<#@ chunks 'main' #>` in the root template.

See detailed runtime reference in `USAGE.md`. Keep `USAGE.md` in sync from the upstream project using `npm run docs:sync-usage`.

## Minimal scaffolds

### HTML page (`.nhtml`)
```html
<#@ context 'data' #>
<!doctype html>
<html>
  <head>
    <title>#{ data.title }</title>
  </head>
  <body>
    <#- if (data.items?.length) { -#>
      <ul>
        <#- for (const it of data.items) { -#>
          <li>!{ it }</li>
        <#- } -#>
      </ul>
    <#- } else { -#>
      <p>No items</p>
    <#- } -#>
  </body>
  </html>
```

### TypeScript class (`.nts`)
```ts
<#@ context 'm' #>
export class #{ m.name } {
  <# for (const f of m.fields) { #>
  #{ f.access ?? 'public' } #{ f.name }: #{ f.type };
  <# } #>
}
```

### Server API (`.njs`)
```js
<#@ context 'api' #>
export default function handler(req, res) {
  <# if (api.auth) { #>
  // auth
  <# } #>
  res.json({ ok: true, route: '#{ api.name }' });
}
```

## Formatting model (used by LSP)

- Template segments (`<# ... #>`, blocks/slots) are indented using JS/TS bracket logic plus template levels.
- Text segments are formatted using Prettier with a host-specific parser inferred from file extension.
- Trimmed forms `<#-` and `-#>` suppress adjacent whitespace.

## Common pitfalls

- Do not embed heavy expressions inside `#{}`; move logic to `<# ... #>`.
- Ensure each `<# block 'name' : #>` has a matching `<# end #>`.
- Use `!{}` only for HTML contexts; in code generation prefer `#{}`.

## Runtime helpers: quick reference (synced from USAGE.md)

- `partial(obj, name)`
  - Resolves aliases defined via `requireAs` automatically.
  - Returns a string in normal mode; in chunks mode it may merge child chunks and return an empty string.
  - Example:
  
  ```njs
  <#@ requireAs ('codeblock.njs','codeblock') #>
  #{partial(context.main, 'codeblock')}
  #{partial({ title: 'Hello' }, 'header.njs')}
  ```

- `content(blockName, ctx?)`
  - Renders a named block of the current (or parent when using `extend`) template.
  - If `ctx` is omitted, some templates default to the local context.
  - Missing blocks render as empty string.
  - Example:
  
  ```njs
  <# block 'view' : #>
  <div>View block content</div>
  <# end #>
  #{content('view', context)}
  ```

- `slot(name, content?)`
  - Collects values (deduplicated) when called as `slot(name, value)`.
  - Renders a slot when called as `#{slot(name)}`; expands to `#{partial(context[name] || [], name)}` at runtime.
  - Example:
  
  ```njs
  <#- if (f.type === 'JSON') { -#>
    <#- slot('additional-imports', 'JSONField') #>
  <#- } else { -#>
    <#- slot('additional-imports', 'TextField') #>
  <#- } -#>
  import {
    #{content('base-imports')}
    #{slot('additional-imports')}
  } from 'react-admin'
  ```

## Chunks model

- Activate with `<#@ chunks '$$$main$$$' #>` in the root template.
- Behavior (from `MainTemplate.njs`):
  - In chunks mode, wrapper overrides `partial` to merge child chunk arrays into the result.
  - `chunkStart(name)` switches output to the named chunk; `chunkEnd()` returns to the main buffer.
  - Result shape by default: `{ name: string, content: string | string[] }[]`; with `useHash`: `{ [name]: string | string[] }`.
  - `includeMainChunk` controls inclusion of the main chunk; `deindent` applies `options.applyDeindent` to chunk contents.

Example:

```njs
<#@ chunks "$$$main$$$" #>

<#- chunkStart('src/index.js'); -#>
// entry
console.log('Hello');
<# chunkEnd(); -#>

<#- chunkStart('src/util.js'); -#>
export const sum = (a, b) => a + b
<# chunkEnd(); -#>
```

Interaction of `partial` and chunks:

- If a partial returns a chunk array, it gets merged into the current result and returns an empty string.
- If a partial returns a string, it is inserted into the current chunk as usual.

```njs
// Will merge chunks if child returns chunk array; otherwise inserts string
#{partial(context.child, 'child-template')}
```

## `options` object in templates

Available in `script(context, _content, partial, slot, options)`:

- `escapeIt(text: string): string` — HTML-escape helper.
- `applyIndent(str: string | string[], indent: number | string): string | string[]` — indent each line.
- `applyDeindent(str: string | string[], numChars: number | string): string | string[]` — remove leading indentation.
- Optional sourcemap fields: `sourceMap`, `inline`, `sourceRoot`, `sourceFile`.

Examples:

```njs
// Escaped vs raw output
#{options.escapeIt(context.title)}
!{context.rawHtml}

// Indent a multi-line block by 2 spaces
#{options.applyIndent(content('view', context), '  ')}

// Deindent chunk content when returning
<#@ deindent #>
<#- chunkStart('file.txt'); -#>
Line 1
  Line 2
<# chunkEnd(); -#>
```

## Directives (parser-recognized)

- `extend 'parent.njs'` — set parent template for block inheritance.
- `context 'ctx'` — rename the `context` parameter for `script`/blocks.
- `alias 'name1' 'name2'` — register alternative template names.
- `requireAs ('path/to.tpl','localAlias')` — ensure dependency and bind alias for `partial`.
- `deindent(2?)` — apply `options.applyDeindent` on return (number optional).
- `chunks 'main'` — enable chunked generation; related flags: `includeMainChunk`, `useHash`.
- Disable flags: `noContent`, `noSlots`, `noBlocks`, `noPartial`, `noOptions` (only `noContent` impacts current generation).
- Return mode markers: `promise`, `callback` (recognized by parser; not used by current `MainTemplate.*`).

## Structural tags (non-directives)

- `block`: `<# block 'name' : #> ... <# end #>`
- `slot` (block form): `<# slot 'name' : #> ... <# end #>`
- `end`: closes block/slot sections

## Common patterns

- Collecting imports via slots:

```njs
<#- slot('import-from-react-admin-show','Show') #>
<#- slot('import-from-react-admin-show','EditButton') #>
import {
  #{slot('import-from-react-admin-show')}
} from 'react-admin'
```

- Conditional slot selection:

```njs
<#-
const type = (f.type == 'Number' ? 'Text' : f.type) + 'Field'
if (f.type === 'JSON') {
  slot('import-from-ra-ui-components-show', `${type}`)
} else {
  slot('import-from-react-admin-show', `${type}`)
}
-#>
```
