const fs = require('fs');
const path = require('path');

describe('template-html grammar nested patterns', () => {
  test('block/slot patterns include $self and template-expressions', () => {
    const abs = path.join(__dirname, '..', '..', 'syntaxes', 'template-html.tmLanguage.json');
    const grammar = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const repo = grammar.repository['template-expressions'];
    const patterns = repo.patterns || [];
    const names = new Set(['meta.block.template', 'meta.slot.template']);
    const blocks = patterns.filter((p) => names.has(p.name));
    expect(blocks.length).toBeGreaterThan(0);
    for (const p of blocks) {
      const incs = (p.patterns || []).map((i) => i.include).filter(Boolean);
      expect(incs).toContain('$self');
      expect(incs).toContain('#template-expressions');
    }
  });
});


