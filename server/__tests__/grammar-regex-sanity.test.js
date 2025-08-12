const fs = require('fs');
const path = require('path');

describe('template-html grammar regex sanity', () => {
  const abs = path.join(__dirname, '..', '..', 'syntaxes', 'template-html.tmLanguage.json');
  const grammar = JSON.parse(fs.readFileSync(abs, 'utf8'));

  test('does not contain fragile negative-lookahead opener rule', () => {
    const src = JSON.stringify(grammar);
    const fragile = '(?:<#-(?!\\s*(?:block|slot)\\b)|<#(?!\\s*(?:block|slot|@|end\\s*#>)|\\{))';
    expect(src.includes(fragile)).toBe(false);
  });

  test('contains simple generic code rule for <#-? ... -?#>', () => {
    const repo = grammar.repository['template-expressions'];
    const patterns = repo?.patterns || [];
    const hasGeneric = patterns.some((p) => typeof p?.begin === 'string' && p.begin === '<#-?' && typeof p?.end === 'string' && p.end === '-?#>');
    expect(hasGeneric).toBe(true);
  });

  test('has single block and single slot pattern entries', () => {
    const repo = grammar.repository['template-expressions'];
    const patterns = repo?.patterns || [];
    const blocks = patterns.filter((p) => p?.name === 'meta.block.template');
    const slots = patterns.filter((p) => p?.name === 'meta.slot.template');
    expect(blocks.length).toBe(1);
    expect(slots.length).toBe(1);
  });
});


