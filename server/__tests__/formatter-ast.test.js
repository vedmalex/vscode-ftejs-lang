const { mockPrettier } = require('./testSetup.js');
mockPrettier();
const { formatSegments } = require('../out/formatterCore.js');

function runFormat({ uri = 'file:///test.nhtml', indentSize = 2, lang = 'html', settings = { format: { textFormatter: false, codeFormatter: true, keepBlankLines: -1 } } } = {}) {
  const items = [
    { type: 'text', start: '', end: '', content: 'Hello ' },
    { type: 'expr', start: '#{', end: '}', content: " 'world' " },
    { type: 'text', start: '', end: '', content: '\n' },
    { type: 'code', start: '<#', end: '#>', content: ' if (true){ console.log( 1+  2 ); } ' },
    { type: 'text', start: '', end: '', content: '\n  Text block should stay  unchanged   \n' },
  ];
  return formatSegments(items, uri, indentSize, lang, settings, {});
}

describe('Formatter guardrails (AST-based)', () => {
  test('does not change text output segments', () => {
    const res = runFormat();
    expect(res).toContain('  Text block should stay  unchanged   ');
  });

  test('formats inner JS of code/expr segments only', () => {
    const res = runFormat();
    expect(res).toMatch(/#\{\s*'world'\s*\}/);
    expect(res).toMatch(/<#\s*if \(true\)\{ console\.log\( 1 \+ 2 \); \}\s*#>/);
  });

  test('handles trim markers without injecting extra characters', () => {
    const items = [
      { type: 'code', start: '<#- block "test" : -#>', end: '', content: '' },
      { type: 'text', start: '', end: '', content: 'content' },
      { type: 'code', start: '<#- end -#>', end: '', content: '' }
    ];
    const out = formatSegments(items, 'file:///test.njs', 2, 'babel', { format: { codeFormatter: true, textFormatter: false } }, {});
    expect(out).toContain('<#- block "test" : -#>');
    expect(out).toContain('<#- end -#>');
    expect(out).toContain('content');
  });

  test('handles .njs formatting with complex template code', () => {
    const items = [
      { type: 'code', start: '<#-', end: '#>', content: ' if (context.SCREENS > 2) {' },
      { type: 'text', start: '', end: '', content: 'content here' },
      { type: 'code', start: '<#-', end: '#>', content: ' }' }
    ];
    const out = formatSegments(items, 'file:///app.njs', 2, 'babel', { format: { codeFormatter: true, textFormatter: false } }, {});
    expect(out).toContain('if (context.SCREENS > 2) {');
    expect(out).toContain('content here');
    expect(out).toContain('}');
  });

  test('handles adjacent closing/opening tags #>#<#', () => {
    const items = [
      { type: 'code', start: '<#', end: '#>', content: ' if(!context.filesDb) ' },
      { type: 'code', start: '<#', end: '#>', content: ' } ' },
      { type: 'text', start: '', end: '', content: 'FILES_URL=' },
      { type: 'expr', start: '#{', end: '}', content: 'context.filesDb??""' }
    ];
    const out = formatSegments(items, 'file:///config.njs', 2, 'babel', { format: { codeFormatter: true, textFormatter: false } }, {});
    expect(out).toContain('if(!context.filesDb)');
    expect(out).toContain('FILES_URL=');
    expect(out).toContain('context.filesDb');
  });

  test('optional blank line limiting applies when configured', () => {
    const settings = { format: { textFormatter: false, codeFormatter: true, keepBlankLines: 1 } };
    const items = [
      { type: 'text', start: '', end: '', content: 'A\n\n\nB\n' }
    ];
    const out = formatSegments(items, 'file:///a.nhtml', 2, 'html', settings, {});
    expect(out).not.toMatch(/\n\n\n+/);
  });
});


