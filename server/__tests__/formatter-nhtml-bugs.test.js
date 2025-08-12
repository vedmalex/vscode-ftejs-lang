const { formatSegments } = require('../out/formatterCore.js');
const { Parser } = require('../out/parser.js');

describe('formatter .nhtml guardrails', () => {
  test('does not change directive content or path strings (full text equality)', () => {
    const uri = 'file:///test.nhtml';
    const before = "<#@ extend 'views/template.nhtml' #>\n<section>  #{partial(context, 'panel')}</section>";
    const ast = Parser.parse(before, { indent: 2 });
    const items = ast.tokens || [];
    const out = formatSegments(items, uri, 2, 'html', { format: { codeFormatter: true, keepBlankLines: 1 } }, {});
    expect(out).toBe(before);
  });
});


