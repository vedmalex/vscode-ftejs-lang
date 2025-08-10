# Priorities (fte-js-template)

Ordered list of improvements based on analysis of USAGE.md and agents.md.

## P0 — Must ship next
- Dynamic docs for hovers/completions from USAGE.md
  - Parse `USAGE.md` to build a map of functions (`partial`, `content`, `slot`, `chunkStart`, `chunkEnd`) and directives with titles + descriptions + examples
  - Serve these as hover markdown and completion `detail/documentation`
  - Auto-refresh on USAGE.md changes (file watcher)
- Block/slot name IntelliSense
  - Completion for declared block/slot names inside `content('...')` and `slot('...')`
  - Diagnostics for unknown `content('name')` (when no such block exists in current/parent template)
- Partial/alias navigation
  - Go to definition from `partial(obj, 'aliasOrPath')` to the template (resolve via `requireAs` aliases and local relative paths)
- Formatter hardening
  - Respect workspace/user Prettier config when available
  - Option to disable Prettier formatting of text segments per user setting
  - Preserve significant blank lines; avoid formatting inside Markdown code fences

## P1 — Important
- Workspace indexing
  - Index `.nhtml/.njs/.nts/.nmd` to build a symbol/reference graph: blocks, slots, aliases, `requireAs`
  - Cross-file references for `content('name')`/`slot('name')` and `partial(..., 'alias')`
- Code actions
  - Convert heavy `#{ ... }` expression into: `<# const v = ... #>#{ v }`
  - Wrap selection with trimmed blocks `<#- ... -#>`
  - Generate scaffolds: block, slot, chunkStart/chunkEnd pairs with names
- Rich codelens
  - Show references count above `block`/`slot` declarations and chunk starts
- Settings surface
  - `ftejs.format.textFormatter`: `prettier` | `none`
  - `ftejs.format.keepBlankLines`: number
  - `ftejs.features.ejsTags`: boolean
  - `ftejs.docs.usagePath`: override path to USAGE.md

## P2 — Nice to have
- Multi-language text formatting
  - Allow language override per region via a directive or fenced marker (e.g., `<!-- lang:go -->`)
- Live preview for chunks
  - Command to run current template with sample context and show multi-file chunk result tree
- Template generators
  - Commands to scaffold common templates (HTML page, TS class, RA CRUD pieces) using `agents.md` patterns
- Performance & telemetry
  - Lazy parsing, debounce formatting/diagnostics, opt-in telemetry for feature usage (no PII)

## P3 — Maintenance
- Unit tests for LSP features (completions, hovers, formatting)
- E2E smoke tests using `vscode-test`
- CI: add actions for lint/build/test and package on tags
