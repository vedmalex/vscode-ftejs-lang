# fte-js-template (VS Code extension)

Syntax highlighting for fte.js templates in HTML, JS/TS and Markdown files.

### Features
- **Languages**: `template-html` (`.nhtml`), `template-js` (`.njs`), `template-typescript` (`.nts`), `template-markdown` (`.nmd`) + inline templates in JS/TS via tagged template `fte`
- **Embedded JS blocks**: `#{ ... }`, `<# ... #>` with trim modifiers, directives `<#@ ... #>`
- **Template comments**: `<* ... *>`
- Bracket/auto-close pairs for common template delimiters

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

### Known limitations
- Only syntax highlighting + brackets. No IntelliSense or formatting.
- Embedded JavaScript is tokenized as JS/TS; template-specific logic beyond delimiters isn't analyzed.

### Development
- Press F5 to launch VS Code Extension Host.
- Edit grammars under `syntaxes/` and `language-configuration.json`.
- Quick reload: Cmd/Ctrl+R in the Extension Host window.

### Release
- Bump `version` in `package.json`.
- Update `CHANGELOG.md`.
- Create a Git tag, CI will package and publish.

### Publishing (CI)
- This repo uses GitHub Actions to package and publish on tag push (e.g. `v1.2.3`).
- Required secrets:
  - `VSCE_PAT`: VS Code Marketplace Personal Access Token (Azure DevOps). See VS Code docs.
  - Optional: `OVSX_TOKEN` for Open VSX publishing.

### License
MIT