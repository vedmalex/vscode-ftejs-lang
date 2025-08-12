const fs = require('fs');
const path = require('path');

describe('language-configuration.json bracket pairs', () => {
  const root = path.join(__dirname, '..', '..');
  const cfgPath = path.join(root, 'language-configuration.json');
  test('uses only canonical template bracket pairs', () => {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(Array.isArray(cfg.brackets)).toBe(true);
    const pairs = cfg.brackets.map((p) => Array.isArray(p) ? p.join('::') : String(p));

    // Must include canonical pairs
    expect(pairs).toContain('<#::#>');
    expect(pairs).toContain('<#-::-#>');

    // Must not include conflicting/mismatched pairs
    expect(pairs).not.toContain('<#::-#>');
    expect(pairs).not.toContain('<#-::#>');

    // Must not include pseudo-structural openers as bracket tokens
    expect(pairs.some((p) => p.startsWith('<# block'))).toBe(false);
    expect(pairs.some((p) => p.startsWith('<#- block'))).toBe(false);
    expect(pairs.some((p) => p.startsWith('<# slot'))).toBe(false);
    expect(pairs.some((p) => p.startsWith('<#- slot'))).toBe(false);
  });
});
