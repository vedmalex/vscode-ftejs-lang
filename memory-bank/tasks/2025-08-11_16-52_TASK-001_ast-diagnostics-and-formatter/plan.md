# plan

1. AST integration for diagnostics
   1.1 Parse to nodes; compute pairs; collect declarations/uses
   1.2 Replace regex checks with AST walks
2. Definition provider
   2.1 Resolve partial alias/path using workspace roots
   2.2 Block override navigation parent<->child
3. Formatter improvements (.njs)
   3.1 Respect left/right trim placement (rules 2,3)
   3.2 Keep text intact; limit blank lines
4. Tests
   4.1 Add LSP unit tests for diagnostics/definition/formatting
