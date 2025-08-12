# Priorities (fte-js-template)

Ordered list of improvements based on analysis of USAGE.md and agents.md.

## P0 — Must ship next (partial DONE)
- Continuous bug fixing (ongoing; never marked complete)
  - Always keep fixing issues listed in `BUGS.md`
  - Prioritize regressions affecting block detection, delimiter pairing, and formatting
- Dynamic docs for hovers/completions from USAGE.md (DONE hovers, DONE completions)
- Block/slot name IntelliSense (DONE)
- Diagnostics: unknown content('name'), duplicate blocks/slots (DONE)
- Partial validation: unresolved alias/path warning (DONE)
- Formatter hardening (in progress):
  - Respect Prettier config (DONE)
  - Option to disable text formatting (DONE)
  - Preserve blank lines (DONE)
  - Avoid injecting newlines/spaces into text output (TODO)

## P1 — Important (in progress)
- Workspace indexing (DONE) and cross-file references:
  - content('name') and slot('name') refs (DONE)
  - partial() refs and definition across files (DONE refs, DONE definition)
- Code actions (in progress):
  - Close open blocks / remove unmatched end (DONE)
  - Wrap selection `<#- ... -#>` / `<# ... #>` (DONE)
  - Extract heavy `#{...}` to const (DONE)
  - Transform selection → block/slot/partial with prompts (DONE)
- Settings surface (DONE)

- Syntax highlighting stability (TODO)
  - Give explicit bracket scopes to template delimiters: `<#`, `#>`, `#{`, `!{`, `<*`, `*>`, `<%`, `%>`
  - Align `beginCaptures`/`endCaptures` to `punctuation.definition.bracket.*` across all grammars
  - Ensure correct `contentName` for embedded languages (JS/TS/HTML/Markdown)
  - Add basic highlight/bracket-matching snapshots

- Trimmed whitespace visualizer (TODO)
  - Decorations for whitespace removed by `<#-` and `-#>`
  - Toggle command `ftejs.toggleTrimVisualizer`
  - Debounced updates on editor and document changes
  - Subtle, theme-friendly appearance

## P2 — Nice to have (in progress)
- Live preview for chunks (static + live) (DONE)
- Multi-language text formatting (override per region via directive or marker) (TODO)
- Template generators based on agents.md (HTML/TS) (DONE)

## P3 — Maintenance (in progress)
- Unit tests for LSP basics (TODO)
- E2E smoke tests using vscode-test (TODO)
- CI: build/test/package on tags (CI build/package DONE; tests to extend)

## New MUST-HAVE items from review
- Formatter: strictly separate formatting of template code vs template text; never introduce extra output characters; follow agents.md rules (TODO)
- Syntax highlighting: stabilize bracket matching and delimiter scopes; reduce conflicts in TextMate patterns; add highlight tests (TODO)
