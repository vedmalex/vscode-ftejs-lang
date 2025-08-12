# MUST_HAVE (fte-js-template)

Non-negotiable items to complete before wider release/adoption.

1) Formatter correctness and guardrails
- [x] Honor workspace/user Prettier configuration
- [x] Option to disable text-segment formatting (fallback to indentation only) **UPDATED (2025-08-11)**: Text formatter now enabled by default with proper HTML whitespace sensitivity.
- [x] Preserve blank lines and avoid formatting inside Markdown code fences
- [x] Never introduce extra output characters: strictly separate formatting of template code and template text; avoid injecting newlines/spaces into generated output; follow `agents.md` rules
- [x] **NEW (2025-08-12)**: Structural tags must start on new lines - `<# block/slot/directive/end` tags automatically get newline prefix when inline with text to improve readability and consistency
- [x] **NEW (2025-08-12)**: Block isolation formatting - `<# block/slot` and `<# end #>` tags must be alone on their lines with visual separation (blank lines) to clearly delineate block boundaries

 - Strict separation of formatting responsibilities (NEW):
   - [x] Template instructions vs template text MUST be formatted separately.
   - Template instruction lines:
     1. [x] If a construct has trimming markers at start/end (per `triming.md`) or implicitly trims surrounding whitespace, this MUST be visually indicated in the editor (decorations or color on trimmed whitespace) so the user sees affected spaces.
     2. [ ] When formatting a block that has a left trim at the start, the opening tag MAY be placed at the start of a new line.
     3. [ ] When formatting a block that has a right trim at the end, the closing tag MAY be placed on its own line at the start.
     4. [x] The inner content of template instructions MUST be formatted according to the embedded language rules (JS/TS/HTML/Markdown), keeping delimiters intact.
   - [x] Template text (final output): MUST be formatted according to the target language rules configured for the region, without altering semantic output; if formatting would change output (e.g., inject newlines), it MUST be skipped.
   - [x] Expressions inside `#{...}` and `!{...}` should be treated as part of the resulting text, not formatted as separate JS code.
    - Code/Text dual extraction and preview parity (NEW):
      - [ ] Before formatting, the system MUST build two synchronized views from AST tokens:
        - [ ] Template Code View: source language (HTML/MD/TSX/...) where template instructions are masked using host-language comments and interpolations become host-appropriate placeholders (e.g., comments for `<# ... #>`, string/text placeholders for `#{...}`/`!{...}`).
        - [ ] Instruction Code View: executable instruction stream where all text segments are converted to string literals and concatenations; preserves evaluation boundaries for insertions.
      - [ ] Both views MUST preserve character spans mapping back to the original template (source map) for diagnostics, selection sync, and preview hovers.
      - [ ] The formatter MUST operate separately on each view (host-language formatter for Code View; minimal normalization for Instruction View) and reconcile changes without altering emitted output semantics.
      - [ ] Preview (code/template/chunks) MUST reuse the same transformation logic to ensure parity between editing and preview.
      - [ ] Provide language adapters for comment styles and string literal styles per host language: HTML/Markdown (`<!-- -->`), JS/TS (`//`, `/* */`), CSS (`/* */`), etc.
  - [ ] Directive lines (`<#@ ... #>`) should be automatically placed at the top of the template or block, with no indentation.
    - Decision (2025-08-12): This requirement is cancelled. Directives are preserved in their original positions and indentation; formatter no longer reorders them.
   - [x] When formatting, do not add a newline before a `<# ... #>` tag if it's already at the beginning of a line.
   - [x] The content inside `<# block ... #>` should not have an additional indent, as the final indent is determined by the insertion point.

2) Syntax highlighting stability (TODO)
- Improve bracket/token scopes to avoid breaking bracket matching and ensure consistent highlighting of template delimiters
- Give explicit bracket scopes to template delimiters: `<#`, `#>`, `#{`, `!{`, `<*`, `*>`, `<%`, `%>`
- Align `beginCaptures`/`endCaptures` to `punctuation.definition.bracket.*` across all grammars
- Ensure correct `contentName` for embedded languages (JS/TS/HTML/Markdown)
- Add basic highlight/bracket-matching snapshots

3) Trimmed whitespace visualizer
- [x] Client-side decorators to highlight whitespace removed by `<#-` and `-#>` so users can see the effect before running the template
- [x] Toggle command `ftejs.toggleTrimVisualizer` with debounced updates; subtle, theme-friendly appearance

4) Critical bugs must be resolved (ongoing)
- [x] Maintain `BUGS.md` and keep fixing issues affecting block detection, delimiter pairing, inheritance visibility, and HTML formatting interaction

 - Template inheritance and block naming (NEW):
   - Blocks in child templates MAY override parent blocks or introduce new ones.
   - If a child declares a block whose name exists in parent: the UI MUST indicate that the block is overridden (override state).
   - If a child declares a block name that does not exist in parent, and the inheritance chain requires that block to exist, this MUST be a diagnostic error for the current template.
   - Provide navigation from child block to corresponding parent block definition; if missing, surface an actionable diagnostic.
   - [x] Implemented parent navigation from block/slot name using AST of parent.
   - [x] Add diagnostic when parent expected but not found. **IMPLEMENTED (2025-08-11)**: Added Information-level diagnostics for child blocks not found in parent templates.

5) Structural trimming policy
- [x] Do not suggest trimming hints for structural tags: `<# block ... #>`, `<# slot ... #>`, `<# end #>`
- [x] Normalize `<#- block|slot` openers to `<# block|slot` during formatting using AST segments **IMPLEMENTED (2025-08-11)**: Structural tags with trimming are normalized during formatting.
- [x] Always insert `<# end #>` for auto-close
- [ ] Document trimming behavior and rationale in README

6) Tests and CI
- [x] Unit tests for formatter guardrails and AST helpers
- [x] Diagnostics tests: unmatched end; duplicate blocks; unknown content('name'); unresolved partial
- [x] Grammar smoke tests for key delimiters and scopes across grammars
- [x] **NEW**: Strict E2E tests for critical formatter bugs with .toBe() assertions
- [x] **NEW**: Navigation definition tests with precise targeting
- [x] **NEW**: Structural tags diagnostics tests
- [x] **NEW**: Test-driven development approach for all critical fixes
- [ ] Unit tests for LSP (completion/hover/definition/formatting)
- [ ] E2E smoke tests with sample templates using `vscode-test`
- [x] CI workflow: build/package; [ ] extend with tests

7) Settings and docs
- [x] Expose user settings: `ftejs.format.textFormatter`, `ftejs.format.keepBlankLines`, `ftejs.features.ejsTags`, `ftejs.docs.usagePath`
- [ ] Update `README.md` with examples and troubleshooting for formatter, chunks, and slots
- [x] Parser auto-load by default via dependency; configurable `ftejs.parserPath` override
- [ ] Synchronize `agents.md` with `USAGE.md`
- [ ] Update `BUGS.md` according to new requirements and fixes

8) Convert file to template (context menu/command)
- [x] Implement command
- [x] Provide a command "Create template from this file" for registered host types that copies/renames the current file to the respective template extension and opens it:
  - `.ts`/`.tsx` → `.nts`
  - `.js`/`.jsx` → `.njs`
  - `.md` → `.nmd`
  - `.html`/`.htm` → `.nhtml`
- [x] After conversion, optionally insert minimal template scaffold and set language mode.
- [x] Enhanced UX: file name validation, overwrite confirmation, explorer integration.

9) Docs-driven IntelliSense
- [x] Build hovers and completion docs from `USAGE.md` (functions and directives)
- [x] Watch and hot-reload docs when `USAGE.md` changes

10) Name-aware completions and diagnostics
- [x] Suggest declared `block`/`slot` names in `content('...')`/`slot('...')`
- [x] Validate unknown `content('name')` and duplicated block names within a file

11) Partial navigation and validation
- [x] Resolve `requireAs` aliases and go-to-definition from `partial(..., 'aliasOrPath')`
- [x] Warn when `partial` refers to missing alias/template

12) Parser and AST (NEW)
- [x] All operations related to syntax analysis, validation, formatting, and navigation MUST be performed through `fte.js-parser` and its AST, not using heuristic regular expressions.
- [x] The parser should be embedded directly into the extension for reliability to avoid dependency issues.
- [x] For finding opening and closing pairs, MUST use @server/src/parser.ts and MUST avoid using regexp due to high probability of losing highlighting. No fallbacks to regular expressions are needed.
- [x] **NEW**: Formatter MUST use ast.tokens stream for reliable token-order processing
- [x] **NEW**: Navigation MUST use ast.blocks[blockName] for direct access instead of RegExp search

13) Navigation (NEW)
- [x] Navigation on `content()` should not work, as it is a data insertion point, not a definition reference. However, clicking on the block name inside `content('block_name')` should navigate to the definition of that block.

14) Diagnostics (NEW)
- [x] The system should highlight structural errors in the block structure (e.g., unclosed blocks).
- [x] An error should be displayed if a template references a non-existent parent template or tries to use a block that is not in the parent chain.
 - [x] Template linter should show error/warning counts like other language linters and work similarly to linters for other programming languages.
 - [ ] Support for external linters that check template type files (njs -> js, ts -> nts, etc.).
 - [x] Directive `<#@ lang = c# #>` to specify template language, with instructions language (`<#` and `#>`, `#{` and `}` etc.) remaining unchanged.

15) Stability and Debugging (NEW)
- [x] Server crashes often occur. A logging system needs to be implemented for debugging that will log errors to a file and/or console.
- [x] Remove all unused functions from `server.ts` code for cleanliness and performance.

16) Dependency Management (NEW)
- [x] The `fte.js-parser` should be installed with the extension by default, so that the user does not need a global installation.

17) Code Quality and Performance (NEW)
- [ ] External linter support for template type files (njs -> js, ts -> nts, etc.) needs implementation
- [ ] Performance optimization required for large template files
- [ ] Security validation needed for user input in template expressions