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
