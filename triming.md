# Trimming rules in fte.js parser

This document mirrors the current behavior of `fte.js-parser` (see `packages/fte.js-parser/src/index.ts`). It is a normative description for the extension and docs.

## Template block kinds

- Directive: `<#@ ... #>` or `<#@ ... -#>`
- Code: `<# ... #>` and trimmed variant `<#- ... -#>`
- Expression (escaped): `#{ ... }`
- Expression (unescaped): `!{ ... }`
- Comment: `<* ... *>`
- Block start: `<# block 'name' : #>` and trimmed `<#- block 'name' : -#>`
- Slot start: `<# slot 'name' : #>` and trimmed `<#- slot 'name' : -#>`
- Block end: `<# end #>`, `<#- end #>`, `<# end -#>`, `<#- end -#>`
- EJS-like tags:
  - Scriptlet: `<% ... %>`
  - Output escaped: `<%= ... %>`
  - Output unescaped: `<%- ... %>`
  - Comment: `<%# ... %>`
  - Left-trim variant: `<%_ ... %>`
  - Right-trim newline: `<% ... -%>`
  - Right-trim whitespace: `<% ... _%>`

## Trimming semantics

Unless noted, trimming for a construct only affects adjacent text (outside the construct), not content inside the construct itself.

- Directive `<#@ ... #>`
  - Trims: remove leading and trailing blank lines around the directive (equivalent to `trimStartLines()` and `trimEndLines()`).

- Block/Slot start `<# block ... : #>` / `<# slot ... : #>` and their trimmed variants
  - Trims: remove leading and trailing blank lines around the start tag.

- Block end `<# end #>` and its trimmed variants
  - Trims: remove leading blank lines before the end tag and trailing blank lines after.

- Code block `<# ... #>`
  - Default: no implicit trimming of surrounding whitespace.
  - Trimmed markers `<#-` (left) and `-#>` (right):
    - `<#-` removes all contiguous whitespace (spaces, tabs, newlines) immediately preceding the tag.
    - `-#>` removes all contiguous whitespace (spaces, tabs, newlines) immediately following the tag.

- Expressions `#{ ... }` and `!{ ... }`
  - No implicit trimming of surrounding whitespace performed by the parser.

- Comments `<* ... *>`
  - Trims: remove leading and trailing blank lines around the comment.

- EJS-like tags:
  - `<%_ ... %>`: removes whitespace to the left of the tag (spaces/tabs), not newlines.
  - `<% ... _%>`: removes whitespace to the right of the tag (spaces/tabs), not newlines.
  - `<% ... -%>`: removes one trailing line break after the tag.
  - `<%# ... %>`: comment; its content is dropped; no output. Surrounding whitespace is not implicitly trimmed unless combined with `_%>` or `-%>` on the end.

## Notes

- The parser recognizes `block`/`slot` boundaries strictly by tokens shown above. Mixing spaces or changing punctuation breaks recognition.
- For multi-line text regions, repeated empty text items are coalesced; completely empty segments are represented as `empty` and may be dropped during post-processing.
- The extension visualizes `<#-` and `-#>` trimming with an optional toggle command `ftejs.toggleTrimVisualizer`.
