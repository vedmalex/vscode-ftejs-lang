// Regression: formatter should not keep increasing blank lines after structural tags

jest.mock('prettier', () => ({
  format: (src) => src.replace(/\s+/g, ' ').trim(),
  resolveConfigSync: () => ({})
}));

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter Idempotence - Structural Separation', () => {
  const formatOptions = {
    indentSize: 2,
    defaultLang: 'html',
    settings: {
      format: {
        textFormatter: false,
        codeFormatter: true,
        keepBlankLines: -1,
      },
    },
    uri: 'file:///test.nhtml',
  };

  function runFormatOnce(text) {
    const ast = Parser.parse(text, { indent: 2 });
    return formatWithSourceWalking(text, ast, formatOptions);
  }

  test('single block with surrounding text remains stable after reformat', () => {
    const input = `Intro text\n\n<# block 'main' #>\n  Hello\n<# end #>\n\nOutro text`;
    const once = runFormatOnce(input);
    const twice = runFormatOnce(once);
    expect(twice).toBe(once);

    // Line count should not grow after second format
    expect(twice.split('\n').length).toBe(once.split('\n').length);
  });

  test('consecutive blocks separation is stable across repeated runs', () => {
    const input = `<# block 'first' #>\n  A\n<# end #>\n<# block 'second' #>\n  B\n<# end #>`;
    const once = runFormatOnce(input);
    const twice = runFormatOnce(once);
    expect(twice).toBe(once);
    expect(twice.split('\n').length).toBe(once.split('\n').length);
  });

  test('inline block normalization does not keep adding blank lines', () => {
    const input = `Text<# block 'inline' #>Content<# end #>More`;
    const once = runFormatOnce(input);
    const twice = runFormatOnce(once);
    expect(twice).toBe(once);
    expect(twice.split('\n').length).toBe(once.split('\n').length);
  });
});
