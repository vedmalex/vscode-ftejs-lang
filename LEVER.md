# LEVER - Reuse Opportunities

## Critical Duplication Analysis Results

### 1. AST Traversal Patterns (High Priority)
**Found 15+ identical patterns** in server.ts:
```typescript
if (ast && Array.isArray(ast.main)) {
  for (const node of ast.main as any[]) {
    // processing logic varies
  }
}
```
- **Locations**: server.ts:157, 184, 531, 585, 640, 756, 937 + semanticTokens.ts:25
- **Impact**: Code duplication, maintenance burden
- **Solution**: Extract `walkAstNodes(ast, callback)` utility

### 2. Template Path Resolution (High Priority) 
**4x duplicate variant creation**:
```typescript
const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
```
- **Locations**: server.ts:560, 680, 1192 + diagnosticsCore.ts:71
- **Impact**: Extension list changes require 4 updates
- **Solution**: Extract `getTemplatePathVariants(basePath)` utility

### 3. Test Setup Duplication (Medium Priority)
**5 test files** with identical Prettier mock:
```javascript
jest.mock('prettier', () => ({
  format: (src) => src.replace(/\s+/g, ' ').trim(),
  resolveConfigSync: () => ({})
}));
```
- **Files**: formatter-html-bug, formatter-ast, formatter-indent, formatter-dotenv-bug, formatter-panel-bug
- **Impact**: Mock changes require 5 updates  
- **Solution**: Extract shared test setup module

### 4. Parser Usage Patterns (Medium Priority)
**83 instances** of `Parser.parse()` across 40+ test functions
**40 instances** of formatter functions in tests
- **Pattern**: Repetitive setup of parse → format → assert cycles
- **Solution**: Extract test helper `parseAndFormat(input, options)`

### 5. Format Settings Structure (Low Priority)
**Repeated configuration objects**:
```typescript
{ 
  format: { 
    textFormatter: true, 
    codeFormatter: true, 
    keepBlankLines: -1 
  } 
}
```
- **Locations**: 15+ test files and server.ts
- **Solution**: Extract default settings constants

## Leverage Existing Patterns
- [x] [LEV-001] Extract `walkAstNodes(ast, callback)` utility from 15+ duplicate AST traversals
- [x] [LEV-002] Create `parseAndFormat(input, options)` test helper from 83 Parser.parse calls
- [x] [LEV-003] Centralize template extension logic into `getTemplatePathVariants(basePath)`

## Eliminate Duplicates  
- [x] [DUP-001] Extract shared Prettier test mock setup module (affects 5 test files)
- [x] [DUP-002] Consolidate AST blocks iteration patterns (15+ locations)
- [x] [DUP-003] Extract default format settings constants (15+ test files)
- [x] [DUP-004] Unify file extension mapping logic between client and server

## Reduce Complexity
- [x] [COMP-001] Split server.ts (1400+ lines) → completion.ts, diagnostics.ts, navigation.ts modules (definition/references delegated)
- [ ] [COMP-002] Extract AST utilities from server.ts into dedicated astHelpers.ts module
- [x] [COMP-003] Create testHelpers.ts module for shared test patterns

## Applied LEVER ✅

### Major Refactoring Completed (2025-08-12)
- [x] **[LEV-001]** Extracted `walkAstNodes(ast, callback)` utility - eliminated 15+ duplicate AST traversal patterns
- [x] **[LEV-002]** Created `getTemplatePathVariants(basePath)` helper - eliminated 4x path variant duplication  
- [x] **[DUP-001]** Extracted shared test setup module (`testSetup.js`) - eliminated 5x Prettier mock duplication
- [x] **[DUP-002]** Created `parseAndFormat(Parser, formatFunction, input, options)` test helper
- [x] **[DUP-003]** Extracted `DEFAULT_FORMAT_SETTINGS` constants - eliminated 15+ setting object duplication
 - [x] **[DUP-004]** Introduced `shared/template-extensions.js` consumed by both client and server; server `getTemplatePathVariants` now defers to shared mapping; client watcher, convert-to-template, and live preview now use shared lists
 - [x] **[COMP-003]** Consolidated test helpers: `server/__tests__/testSetup.js` now provides `mockPrettier`, `parseAndFormat`, and default settings; updated tests to reuse helpers; all tests pass
 - [x] **[COMP-001]** Completed navigation split: `onCompletion`, `onHover`, `onDefinition`, `onReferences` now fully delegated to `navigation.ts`

### Previous Achievements
- [x] Successfully leveraged existing LocalParser instead of external fte.js-parser dependency
- [x] Reused existing AST patterns from parser.ts in navigation and completion features  
- [x] Eliminated duplicate Prettier import cleanup - removed unused functions from server.ts
- [x] Reduced complexity by consolidating logging system into structured levels and file output

### Refactoring Impact
**Code Reduction:**
- server.ts: -50 lines of duplicate AST traversals
- diagnosticsCore.ts: -3 lines of path variants
- All tests: Ready for shared setup integration; shared extension mapping ensures parity and reduces future regressions

**Maintainability:**
- Template extensions changes now need 1 update instead of 4
- AST processing changes now need 1 update instead of 15+
- Test mock changes now need 1 update instead of 5

**Validation:** ✅ All 150 tests pass, 37 test suites, build successful

## Next Development Plan (2025-08-12)

- [x] [COMP-005] Delegate code actions to `server/src/codeActions.ts`
- [ ] [COMP-004] Delegate document formatting handler to `server/src/formatting.ts`
- [ ] [COMP-006] Extract signature help provider to `server/src/signatureHelp.ts`
- [ ] [COMP-007] Extract `ftejs/extractViews` request handling to `server/src/extraction.ts`
- [ ] [COMP-008] Extract workspace indexing to `server/src/indexer.ts` with clear APIs (indexWorkspace, indexText)
- [ ] [LEV-010] Centralize server settings defaults into `server/src/config.ts` and reuse in tests
- [ ] [DUP-010] Sweep remaining unused imports and inline helpers from `server/src/server.ts`
- [ ] [PERF-001] Debounce diagnostics and indexing for big files; throttle on rapid changes
- [ ] [PERF-002] Cache parse results per document version to avoid redundant parsing across features
- [ ] [TEST-001] Add unit tests for `buildCodeActions` (unknown block, trim hints, wrap/refactor)
- [ ] [TEST-002] Add tests for formatting delegation (idempotence, newline enforcement, dotenv cases)
- [ ] [DOC-001] Update `USAGE.md` references and developer docs to reflect new modules
