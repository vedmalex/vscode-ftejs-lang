const fs = require('fs');

describe('TextMate delimiters presence (smoke)', () => {
  const root = require('path').join(__dirname, '..', '..');
  const html = JSON.parse(fs.readFileSync(root + '/syntaxes/template-html.tmLanguage.json', 'utf8'));
  const js = JSON.parse(fs.readFileSync(root + '/syntaxes/template-js.tmLanguage.json', 'utf8'));
  const ts = JSON.parse(fs.readFileSync(root + '/syntaxes/template-typescript.tmLanguage.json', 'utf8'));
  const md = JSON.parse(fs.readFileSync(root + '/syntaxes/template-markdown.tmLanguage.json', 'utf8'));

  const grammars = [html, js, ts, md];

  test('has explicit bracket scopes for key delimiters', () => {
    const requiredScopes = [
      'punctuation.definition.bracket.template.directive.begin',
      'punctuation.definition.bracket.template.directive.end',
      'punctuation.definition.bracket.template.expression.begin',
      'punctuation.definition.bracket.template.expression.end',
      'punctuation.definition.bracket.template.block.begin',
      'punctuation.definition.bracket.template.block.end'
    ];
    for (const g of grammars) {
      const src = JSON.stringify(g);
      for (const s of requiredScopes) {
        expect(src.includes(s)).toBe(true);
      }
    }
  });

  function containsString(obj, needle) {
    if (obj == null) return false;
    if (typeof obj === 'string') return obj.includes(needle);
    if (Array.isArray(obj)) return obj.some((v) => containsString(v, needle));
    if (typeof obj === 'object') return Object.values(obj).some((v) => containsString(v, needle));
    return false;
  }

  test('defines begin/end for core delimiters across grammars', () => {
    for (const g of grammars) {
      expect(containsString(g, '<#')).toBe(true);
      expect(containsString(g, '#>')).toBe(true);
      expect(containsString(g, '#{')).toBe(true);
      expect(containsString(g, '!{')).toBe(true);
      expect(containsString(g, '<\\*')).toBe(true);
      expect(containsString(g, '\\*>')).toBe(true);
      // EJS delimiters
      expect(containsString(g, '<%')).toBe(true);
      expect(containsString(g, '%>')).toBe(true);
    }
  });

  test('all MUST_HAVE delimiters have proper bracket scopes', () => {
    // MUST_HAVE.md requires: `<#`, `#>`, `#{`, `!{`, `<*`, `*>`, `<%`, `%>`
    const mustHaveScopes = [
      'punctuation.definition.bracket.template.expression.begin',
      'punctuation.definition.bracket.template.expression.end',
      'punctuation.definition.bracket.template.block.begin',
      'punctuation.definition.bracket.template.block.end',
      'punctuation.definition.bracket.template.comment.begin',
      'punctuation.definition.bracket.template.comment.end'
    ];
    
    for (const g of grammars) {
      const src = JSON.stringify(g);
      for (const scope of mustHaveScopes) {
        expect(src.includes(scope)).toBe(true);
      }
    }
  });

  test('block and slot patterns use consistent naming', () => {
    for (const g of grammars) {
      const src = JSON.stringify(g);
      // Check that block/slot entity names are consistent
      if (src.includes('entity.name.tag.block.template')) {
        expect(src.includes('entity.name.tag.slot.template')).toBe(true);
      }
    }
  });
});


