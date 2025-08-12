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
  - [x] Root cause: block/slot scopes included only `source.js` but not template constructs, so nested directives weren't recognized. Fixed by making block/slot include `$self` recursively across all template grammars.
  - [x] Additional: VS Code bracket configuration had conflicting pairs mixing trimmed and non-trimmed open/close variants causing loss of bracket pairing on some lines. Simplified `language-configuration.json` to only declare canonical `<# ... #>` and `<#- ... -#>` pairs for stability.

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
 
NEW (2025-08-12):
- [x] Incorrect scope `unexpected-closing-bracket` for `<#-` at start of code block in `.nhtml` led to lost highlighting and bracket pairing. Root cause: fragile negative-lookahead regex in `template-html.tmLanguage.json` and duplicated block/slot rules causing precedence issues. Fix: removed fragile rule, deduplicated block/slot patterns, and added simple generic `<#-?` ... `-?#>` rule placed last. Added tests `grammar-regex-sanity.test.js` to prevent regression.
- [ ] **NEW (2025-08-12)**: Cross-file validation missing for unknown aliases in `partial` or unresolvable paths - TODO comment found in server.ts:861
- [x] **NEW (2025-08-12)**: Форматирование увеличивает количество строк после блочных конструкций `<# block/slot 'main' : #>` и `<# end #>` - ИСПРАВЛЕНО: обновлена логика `ensureBlockSeparation` и `ensureNewlineSuffix` для точной проверки существующих переводов строк; форматировщик больше не добавляет лишние пустые строки; все 172 теста проходят
- [x] **NEW (2025-08-12)**: Потеря пробела между соседними выражениями в тексте при защите плейсхолдерами (например, `#{user.firstName} #{user.lastName}` становилось без пробела). Исправлено: в `formatWithSourceWalking` сохраняются пробельные текстовые токены без `eol`, что предотвращает склейку выражений. Покрыто тестом `formatter-expression-indent.test.js` (complex HTML).
- [x] **NEW (2025-08-12)**: Блоки вставки текста `#{...}` и `!{...}` меняют отступы при форматировании - expression блоки должны сохранять свой исходный indent, так как они являются частью текстового контента, а не кода
- [x] **NEW (2025-08-12)**: Formatter increases blank lines after structural tags `<# block/slot '...' : #>` and `<# end #>`. Extra blank line(s) appear after normalization. Action: ensure `ensureBlockSeparation`, `ensureNewlineSuffix`, and `ensureBlockEndSeparation` are idempotent and content-aware; add regression tests for consecutive structural tags and mixed text. FIXED: Improved text token handling to skip adjacent structural whitespace and made blockStart/blockEnd logic idempotent with proper separation analysis.
- [x] **NEW (2025-08-12)**: Formatter добавляет лишние пустые строки после `<# end #>` при форматировании - форматтер добавляет визуальное разделение там где оно не нужно, делая код менее компактным. Нужно сделать добавление пустых строк более селективным и идемпотентным. FIXED: Improved blockEnd logic to analyze existing separation in token stream before adding new blank lines, making the formatter truly idempotent. All 75 formatter tests now pass.