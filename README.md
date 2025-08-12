# fte-js-template (VS Code extension)

Language support for fte.js templates: syntax highlighting, IntelliSense (LSP), and a language-aware formatter for HTML/JS/TS/Markdown and code-generation templates.

### Features
- **Languages**: `template-html` (`.nhtml`), `template-js` (`.njs`), `template-typescript` (`.nts`), `template-markdown` (`.nmd`) + inline templates in JS/TS via tagged template `fte`
- **Embedded JS blocks**: `#{ ... }`, `<# ... #>` with trim modifiers, directives `<#@ ... #>`, and EJS-style tags `<% %>`, `<%= %>`, `<%- %>`, `<%# %>` (supports `-%>`/`_%>` trims)
- **Template comments**: `<* ... *>`
- Bracket/auto-close pairs for common template delimiters

> For AI agents: see `agents.md` for a concise guide on how to author fte.js templates programmatically.

### Install
- From VS Code Marketplace (after publish)
- Or manually build and install a `.vsix`:
  - `npm i -g @vscode/vsce`
  - `vsce package`
  - In VS Code: Extensions view → … → Install from VSIX

### File associations & inline usage
- Create files with extensions: `.nhtml`, `.njs`, `.nts`, `.nmd`
- Inline in JS/TS:
```ts
const html = fte`<div>
  <# if (cond) { #>
    #{ value }
  <# } #>
</div>`
```

### Examples

#### Basic Template Structure
```html
<!-- page.nhtml -->
<#@ context 'data' #>
<!DOCTYPE html>
<html>
  <head>
    <title>#{data.title}</title>
  </head>
  <body>
    <# block 'content' : #>
      <p>Default content</p>
    <# end #>
  </body>
</html>
```

#### Template Inheritance
```html
<!-- base.nhtml -->
<#@ context 'data' #>
<!DOCTYPE html>
<html>
  <body>
    <# block 'header' : #>
      <h1>Default Header</h1>
    <# end #>
    <# block 'content' : #>
      <p>Default content</p>
    <# end #>
  </body>
</html>
```

```html
<!-- child.nhtml -->
<#@ extend "base.nhtml" #>
<#@ context 'data' #>

<# block 'header' : #>
  <h1>#{data.title}</h1>
<# end #>

<# block 'content' : #>
  <#- for (const item of data.items) { #>
    <div class="item">#{item.name}</div>
  <#- } #>
<# end #>
```

#### Trim Markers and Code Generation
```typescript
<!-- api.nts -->
<#@ context 'schema' #>
<#- for (const model of schema.models) { -#>
export interface #{model.name} {
  <#- for (const field of model.fields) { -#>
  #{field.name}: #{field.type};
  <#- } -#>
}

<#- } -#>
```

#### Partials and Components
```html
<!-- button.njs -->
<#@ context 'props' #>
<button class="btn #{props.variant || 'primary'}" 
        #{props.disabled ? 'disabled' : ''}>
  #{props.text}
</button>
```

```html
<!-- Usage -->
<#@ requireAs("./button.njs", "btn") #>
<div>
  #{partial(context, 'btn', { text: 'Click me', variant: 'success' })}
</div>
```

### LSP capabilities
- Completions for directives, `content`/`partial`, snippets for `block/slot` with auto `end`
- Hover, diagnostics (parse/structure/directives), go-to-definition/references for blocks
- Formatting:
  - Strict separation of concerns: template instructions and template text are formatted separately.
  - Template text uses Prettier with host parser (HTML/Markdown/JS/TS) and never changes semantic output; if formatting would inject/remove whitespace, it is skipped.
  - Template instructions keep delimiters intact; inner code/expressions are formatted by JS/TS rules.
  - On-type: auto insert `<# end #>` matching trim markers; code actions: close open blocks, remove unmatched end.

### Commands
- Scaffolds: Insert Block, Insert Slot, Insert chunkStart/chunkEnd
- Partials: Create Partial and Insert Call
- Generators: Generate .nhtml Page, Generate .nts Class
- Preview: Preview Chunks (static), Preview Chunks (Live)

### Configuration
- `ftejs.parserPath` (string, optional): absolute path to local `fte.js-parser` when developing locally. If empty, the server attempts to resolve the npm package `fte.js-parser` automatically. The extension depends on `fte.js-parser` and installs it by default.
- `ftejs.format.textFormatter` (boolean): enable formatting of non-template text regions (default true).
- `ftejs.format.keepBlankLines` (number): max consecutive blank lines to keep in output; use -1 to disable limiting.
- `ftejs.format.codeFormatter` (boolean): enable indentation and inner formatting inside template instructions.

### Formatting model
- Template instruction segments (`<# ... #>`, `#{...}`, `!{...}`, `block/slot/end`):
  - Delimiters preserved; only inner content is formatted (JS/TS/EJS rules) where applicable.
  - Trim markers `<#-` and `-#>` are respected; on-type and code actions keep them in sync.
- Template text segments (final output):
  - Prettier with host parser inferred from file extension:
    - `.nhtml` → `html`
    - `.nmd` → `markdown`
    - `.nts` → `typescript`
    - `.njs` (default) → `babel`
  - Guardrails: if formatting would change number of lines or inject trailing spaces, original text is kept.

### Development
- Press F5 to launch VS Code Extension Host.
- Edit grammars under `syntaxes/` and `language-configuration.json`.
- Quick reload: Cmd/Ctrl+R in the Extension Host window.
- Workspaces: this repo uses npm workspaces for `client/` and `server/`. Build both with `npm run compile`.
- Parser: the extension bundles `fte.js-parser` (resolved from npm). For local development of parser, set `ftejs.parserPath` to your local build.

### Debugging
- Client (extension): F5 → Extension Host. Тестируйте команды/подсветку в новом окне.
- Server (LSP): сервер стартует с `--inspect=6009`. Подключитесь Attach to Node Process (порт 6009) для отладки.
- Логи LSP: Output → fte.js Language Server.
- Тесты: `npm test` (Jest smoke‑tests в `server/`).

### Documentation for users and agents
- Runtime usage and API: `USAGE.md` (synced from the main fte2 project). Update with `npm run docs:sync-usage` (set `FTE2_USAGE` if needed).
- AI authoring guide: `agents.md`.

### Publishing
- Package VSIX:
  - `npm run compile`
  - `npx vsce package --no-yarn` → `.vsix` в корне
- Publish to VS Code Marketplace:
  - Получите `VSCE_PAT` и выполните `vsce login`
  - `npm run publish:vsce`
- Publish to Open VSX: `npm run publish:openvsx` (требуется `OVSX_TOKEN`)

### CI
- GitHub Actions workflow `.github/workflows/ci.yml` билдит проект и собирает VSIX на каждый push/PR в `main`.

### Release
- Bump `version` in `package.json`.
- Update `CHANGELOG.md`.
- Create a Git tag, CI will package and publish.

### Injections into other languages
- This repo uses GitHub Actions to package and publish on tag push (e.g. `v1.2.3`).
- Required secrets:
  - `VSCE_PAT`: VS Code Marketplace Personal Access Token (Azure DevOps). See VS Code docs.
  - Optional: `OVSX_TOKEN` for Open VSX publishing.

The extension injects template delimiters into Python/Swift/Ruby/Go/PHP files to highlight `#{}`, `<# #>`, EJS tags and comments inside strings or code where applicable.

### Troubleshooting

#### Syntax Highlighting Issues
- **Problem**: Template delimiters not highlighted in `.njs/.nhtml` files
- **Solution**: Check file extension is correct and VS Code recognized the language. Command Palette → "Change Language Mode" → select appropriate template language.

#### LSP Features Not Working
- **Problem**: No completion, hover, or formatting in template files
- **Solution**: 
  1. Check VS Code output: View → Output → select "fte.js Language Server"
  2. Ensure language server started correctly
  3. Try restarting: Command Palette → "Developer: Reload Window"

#### Formatting Issues
- **Problem**: Template not formatting correctly or breaking content
- **Solution**:
  1. Check `ftejs.format.textFormatter` setting (disable if problematic)
  2. Verify Prettier configuration is valid for your file type
  3. Use trim markers `<#-` `-#>` to control whitespace output
  4. Disable code formatting with `ftejs.format.codeFormatter: false` if needed

#### Block/Slot Navigation
- **Problem**: "Go to Definition" not working for `content('blockName')`
- **Solution**:
  1. Ensure block name exactly matches (case-sensitive)
  2. Check for typos in block declarations: `<# block 'name' : #>`
  3. For inherited blocks, verify parent template path in `<#@ extend "..." #>`

#### Template Inheritance
- **Problem**: Child template not finding parent blocks
- **Solution**:
  1. Verify relative path in `<#@ extend "path/to/parent.nhtml" #>` is correct
  2. Check parent template exists and has proper block declarations
  3. Ensure both parent and child have correct file extensions

#### Performance Issues
- **Problem**: Editor slow with large template files
- **Solution**:
  1. Disable trim visualizer: Command Palette → "fte.js: Toggle Trim Visualizer"
  2. Consider splitting large templates into smaller partials
  3. Use `ftejs.format.keepBlankLines` to limit blank line processing

#### Command Not Found
- **Problem**: Template scaffolding commands not available
- **Solution**:
  1. Ensure extension is activated (should auto-activate on template files)
  2. Check Command Palette shows commands starting with "fte.js:"
  3. Try reloading window: Command Palette → "Developer: Reload Window"

#### Parser Errors
- **Problem**: Red squiggles on valid template syntax
- **Solution**:
  1. Check for unmatched delimiters: every `<#` should have `#>`
  2. Verify block/slot declarations have proper syntax: `<# block 'name' : #>`
  3. Ensure `<# end #>` tags match opening blocks
  4. Check directive syntax: `<#@ directiveName param #>`

### Getting Help
- [GitHub Issues](https://github.com/grainjs-proj/fte-js-lang/issues) for bug reports and feature requests
- Check `USAGE.md` for detailed template syntax reference
- See `agents.md` for AI-assisted template authoring

### License
MIT