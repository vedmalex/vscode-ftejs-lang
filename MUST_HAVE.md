# MUST_HAVE (fte-js-template)

Non-negotiable items to complete before wider release/adoption.

1) Docs-driven IntelliSense
- Build hovers and completion docs from `USAGE.md` (functions and directives)
- Watch and hot-reload docs when `USAGE.md` changes

2) Name-aware completions and diagnostics
- Suggest declared `block`/`slot` names in `content('...')`/`slot('...')`
- Validate unknown `content('name')` and duplicated block names within a file

3) Partial navigation and validation
- Resolve `requireAs` aliases and go-to-definition from `partial(..., 'aliasOrPath')`
- Warn when `partial` refers to missing alias/template

4) Formatter guardrails
- Honor workspace/user Prettier configuration
- Option to disable text-segment formatting (fallback to indentation only)
- Preserve blank lines and avoid formatting inside Markdown code fences

5) Settings and docs
- Expose user settings: `ftejs.format.textFormatter`, `ftejs.format.keepBlankLines`, `ftejs.features.ejsTags`, `ftejs.docs.usagePath`
- Update `README.md` with examples and troubleshooting for formatter, chunks, and slots

6) Tests and CI
- Unit tests for LSP (completion/hover/definition/formatting)
- E2E smoke tests with sample templates
- CI workflow for lint/build/test and vsix packaging
