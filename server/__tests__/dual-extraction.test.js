const { Parser } = require('../out/parser.js');
const { extractTemplateCodeView, extractInstructionCodeView } = require('../out/formatterCore.js');

describe('Dual Extraction Views', () => {
  const sample = [
    "<#@ context 'data' #>\n",
    "<div>\n",
    "  Hello #{ data.name }!\n",
    "</div>\n",
    "<# if (data.ok) { #>OK<# } #>\n",
  ].join('');

  test('Template Code View masks instructions and keeps placeholders for expressions', () => {
    const ast = Parser.parse(sample, { indent: 2 });
    const { code } = extractTemplateCodeView(sample, ast, { hostLanguage: 'html' });
    expect(code).toMatch(/<!--\s*<#@ context 'data' #>\s*-->/);
    expect(code).toMatch(/Hello \⟦expr\⟧!/);
    // Code instructions are commented separately around text content
    expect(code).toMatch(/<!--\s*<# if \(data\.ok\) \{ #>\s*-->\s*OK\s*<!--\s*<# \} #>\s*-->/);
  });

  test('Instruction Code View converts text to strings and preserves inner code', () => {
    const ast = Parser.parse(sample, { indent: 2 });
    const { code } = extractInstructionCodeView(sample, ast, { hostLanguage: 'javascript' });
    // directive represented as comment in instruction stream
    expect(code).toMatch(/\/\* <#@ context 'data' #> \*\//);
    // expressions preserved as evaluable code
    expect(code).toMatch(/\(data\.name\)/);
    // control flow preserved; text becomes string literal within block
    expect(code).toMatch(/if \(data\.ok\) \{[\s\S]*?"OK"[\s\S]*?\}/);
  });
});
