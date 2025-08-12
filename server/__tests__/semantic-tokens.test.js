describe('semantic tokens', () => {
  test('cover delimiters and keywords', () => {
    const { buildSemanticTokensFromText } = require('../out/semanticTokens.js');
    const sample = [
      "<#@ context 'data' #>",
      "<# block 'main' : #>",
      "  #{ data.title }",
      "<# end #>"
    ].join('\n');
    const tokens = buildSemanticTokensFromText(sample);
    expect(Array.isArray(tokens)).toBe(true);
    const types = new Set(tokens.map(t => t.type));
    expect(types.has('operator')).toBe(true);
    // blockStart should mark 'block' keyword
    expect(types.has('keyword') || types.has('macro')).toBe(true);
  });
});
