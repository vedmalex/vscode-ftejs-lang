const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter guards', () => {
  test('throws on suspicious URI (copy/tmp)', () => {
    const ast = { tokens: [{ type: 'text', start: '', content: 'x', end: '', eol: true }] };
    const run = () => formatWithSourceWalking('x', ast, { indentSize: 2, defaultLang: 'html', uri: 'file:///tmp/copy.nhtml' });
    expect(run).toThrow();
  });
});


