# BUGS

- [x] content() go-to-definition triggered and navigated to first block when multiple blocks present — should be disabled entirely (content is an insertion point).
- [x] Go-to-definition did not navigate to parent/other file when block declared in another template — fixed to resolve via AST using extend chain.
- [x] Trimming hints suggested for structural tags `<# block ... #>`, `<# slot ... #>`, `<# end #>` — disabled for structural tags.
- [x] Auto-close on type used trimmed end tags depending on opener — normalized to always insert `<# end #>`.
- [x] `<#- block` and `<#- slot` not normalized — formatter now forces non-trimmed openers via AST segments.
- [x] Unused imports/functions in `server/src/server.ts` — removed unused `prettier` import and references.
- [x] **NEW (2025-08-12)**: Navigation on `content()` function call worked incorrectly - FIXED: disabled content() navigation per MUST_HAVE.md point 13, only block name inside content('block_name') should navigate.
- [x] **NEW (2025-08-12)**: Unused functions in server.ts (getPrettierOpts, getCodePrettierOpts, limitBlankLines) - REMOVED for cleaner code.
- [x] **NEW (2025-08-12)**: Missing diagnostics for non-existent parent templates and invalid block references - ADDED comprehensive validation.
- [x] **NEW (2025-08-12)**: Poor error logging made debugging server crashes difficult - ENHANCED with structured logging system with levels and file output.
- [x] **NEW (2025-08-12)**: External parser dependency issues affecting reliability - EMBEDDED parser directly into extension, removed fte.js-parser external dependency.
- [x] **NEW (2025-08-12)**: Convert to template command lacked UX polish - ENHANCED with name validation, overwrite confirmation, and better error handling.

## REVIEW_SPEC.md Compliance Updates (2025-08-11):
- [x] **CRITICAL COMPLIANCE**: Text formatter enablement - activated textFormatter by default with htmlWhitespaceSensitivity: 'css' for proper HTML formatting without collapsing to single lines
- [x] **CRITICAL COMPLIANCE**: Directive reordering implementation - directives (<#@...#>) are now automatically moved to the top of templates/blocks during formatting with proper line separation  
- [x] **CRITICAL COMPLIANCE**: Structural tag normalization - <#- block and <#- slot trimmed variants are normalized to <# block and <# slot during formatting to maintain consistency
- [x] **CRITICAL COMPLIANCE**: Parent block validation diagnostics - added Information-level diagnostics when child templates declare blocks that don't exist in parent templates, helping identify new vs override blocks

NEW (2025-08-11):
- [x] Despite successful navigation between files when selecting content("block_name"), if the block is located in the current file, the cursor does not move to it. Fixed: on-definition now jumps to the opener of the target block in the same file.
- [x] Fix suggestions for blocks with trimming (<#- or -#>) are shown on hover but no action to modify is provided. Yellow underline as warning could also be added. Implemented: warnings + Code Actions to apply '<#-' and '-#>'.
- [x] Errors for incorrect block naming and other constructs are not displayed, although this was working before and is currently broken. Implemented: invalid block/slot name diagnostics.
- [x] **CRITICAL (2025-08-11)**: Template formatting completely destroyed block and directive declarations - FIXED: Replaced unstable formatSegments algorithm with new formatWithSourceWalking that preserves all AST structure.
- [x] **CRITICAL (2025-08-11)**: HTML formatting collapsed all content to single line losing readability - FIXED: Added htmlWhitespaceSensitivity: 'css' option to Prettier configuration.
- [x] **CRITICAL (2025-08-11)**: Navigation from content('name') always led to first block instead of named block - FIXED: Replaced RegExp-based search with AST-based lookup using ast.blocks[blockName].
- [ ] Template formatting for .nhtml files converts them to a string, which is incorrect. Example: was @/Users/vedmalex/work/fte2/demo/complexSample/views/template.nhtml became @/Users/vedmalex/work/fte2/demo/complexSample/views/template copy.nhtml
  Note: Not reproducible in tests; added guard test to ensure directives/paths remain intact and no FS operations occur during formatting.
- [ ] Template formatting incorrectly renames files. Example: was @/Users/vedmalex/work/fte2/demo/generators/server/Application.Config/profileControl.njs became @/Users/vedmalex/work/fte2/demo/generators/server/Application.Config/profileControl copy.njs
  Note: LSP formatting returns only TextEdits; no rename logic present. Need concrete repro to investigate external cause.
- [ ] Syntax highlighting is lost for specific lines (7,8,9) in @/Users/vedmalex/work/fte2/demo/complexSample/views/index.nhtml
- [ ] Bracket pair highlighting (`<# #>`) is lost for specific lines (7,8,9) in @/Users/vedmalex/work/fte2/demo/complexSample/views/index.nhtml
- [ ] Incorrect syntax highlighting and lost bracket pairs in @/Users/vedmalex/work/fte2/demo/generators/server/Application.Config/app.dotenv.njs
  - Root cause: block/slot scopes included only `source.js` but not template constructs, so nested directives weren't recognized. Fixed by making block/slot include `$self` recursively across all template grammars.

Tests completed (2025-08-11):
- [x] Added comprehensive E2E tests for formatter bugs (panel-bug, html-bug, dotenv-bug)
- [x] Added tests for navigation definition with correct block targeting
- [x] Added tests for structural tags skip logic in diagnostics
- [x] All tests use strict .toBe() assertions following new testing strategy
- [x] Added tests for go-to-definition disabling on `content()` and cross-file navigation from block name.
- [x] Added tests for no trimming hints on structural tags.
- [x] Added tests ensuring formatter normalizes `<#- block`/`slot` openers.
- [x] **NEW**: Add tests for parent template validation diagnostics.
- [x] **NEW**: Add tests for enhanced logging system.
- [x] **NEW**: Add tests for embedded parser functionality.
- [x] **NEW**: Add tests for enhanced convert-to-template command.