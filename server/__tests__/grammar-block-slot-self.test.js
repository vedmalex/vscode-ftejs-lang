const fs = require('fs');
const path = require('path');

function loadGrammar(relPath) {
  const abs = path.join(__dirname, '..', '..', relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function findRepositoryPatterns(grammar) {
  return grammar?.repository?.['template-expressions']?.patterns || [];
}

function hasSelfInclude(pattern) {
  if (!pattern || !Array.isArray(pattern.patterns)) return false;
  return pattern.patterns.some((p) => typeof p?.include === 'string' && p.include === '$self');
}

describe('block/slot patterns include $self recursively', () => {
  const grammars = [
    ['syntaxes/template-js.tmLanguage.json', ['meta.block.template', 'meta.slot.template']],
    ['syntaxes/template-html.tmLanguage.json', ['meta.block.template', 'meta.slot.template']],
    ['syntaxes/template-typescript.tmLanguage.json', ['meta.block.template', 'meta.slot.template']],
    ['syntaxes/template-markdown.tmLanguage.json', ['meta.block.template', 'meta.slot.template']],
  ];

  test.each(grammars)('%s has $self include inside block/slot', (rel, kinds) => {
    const grammar = loadGrammar(rel);
    const repoPatterns = findRepositoryPatterns(grammar);
    const blockLike = repoPatterns.filter((p) => kinds.includes(p.name));
    expect(blockLike.length).toBeGreaterThan(0);
    for (const p of blockLike) {
      expect(hasSelfInclude(p)).toBe(true);
    }
  });
});


