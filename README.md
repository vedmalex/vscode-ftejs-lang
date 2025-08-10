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

### LSP capabilities
- Completions for directives, `content`/`partial`, snippets for `block/slot` with auto `end`
- Hover, diagnostics (parse/structure/directives), go-to-definition/references for blocks
- Formatting: language-aware (Prettier for text segments, JS/TS rules for template code), on-type end insertion, code actions (close open blocks, fix unmatched end)

### Configuration
- `ftejs.parserPath` (string, optional): absolute path to local `fte.js-parser` when developing locally. If empty, the server attempts to resolve the npm package `fte.js-parser` automatically. The extension depends on `fte.js-parser` and installs it by default.

### Formatting model
- Template segments (`<# ... #>`, `block/slot/end`) are indented using JS/TS bracket logic and template nesting levels.
- Text segments are formatted via Prettier with a host parser inferred from file extension:
  - `.nhtml` → `html`
  - `.nmd` → `markdown`
  - `.nts` → `typescript`
  - `.njs` (default) → `babel`

### Development
- Press F5 to launch VS Code Extension Host.
- Edit grammars under `syntaxes/` and `language-configuration.json`.
- Quick reload: Cmd/Ctrl+R in the Extension Host window.
- Workspaces: this repo uses npm workspaces for `client/` and `server/`. Build both with `npm run compile`.

### Documentation for users and agents
- Runtime usage and API: `USAGE.md` (synced from the main fte2 project). Update with `npm run docs:sync-usage` (set `FTE2_USAGE` if needed).
- AI authoring guide: `agents.md`.

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

### License
MIT