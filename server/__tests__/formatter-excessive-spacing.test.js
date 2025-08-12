// Test for excessive spacing after end tags
const { mockPrettier } = require('./testSetup.js');
mockPrettier();

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter Excessive Spacing', () => {
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

  function format(text) {
    const ast = Parser.parse(text, { indent: 2 });
    return formatWithSourceWalking(text, ast, formatOptions);
  }

  test('should not add extra spacing after end tag when followed by text', () => {
    const input = `<# block 'main' #>
Content
<# end #>
More text`;
    
    const result = format(input);
    
    // Should have exactly one blank line after end tag, not more
    expect(result).toBe(`<# block 'main' #>
Content
<# end #>

More text`);
    
    // Check that there's exactly one blank line (two newlines total)
    const lines = result.split('\n');
    const endIndex = lines.findIndex(line => line.includes('<# end #>'));
    const textIndex = lines.findIndex((line, idx) => idx > endIndex && line.trim() === 'More text');
    
    // Should be exactly one empty line between end tag and text
    expect(textIndex - endIndex).toBe(2); // end tag line + 1 empty line + text line
  });

  test('should be idempotent - no extra spacing on repeated formatting', () => {
    const input = `Text
<# block 'main' #>
Content  
<# end #>
More text`;
    
    const once = format(input);
    const twice = format(once);
    const thrice = format(twice);
    
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
    
    // Line count should remain stable
    expect(twice.split('\n').length).toBe(once.split('\n').length);
    expect(thrice.split('\n').length).toBe(once.split('\n').length);
  });

  test('should handle inline blocks correctly without extra spacing', () => {
    const input = `Text<# block 'inline' #>Content<# end #>More`;
    
    const once = format(input);
    const twice = format(once);
    
    expect(twice).toBe(once);
    
    // Should normalize to proper structure but be idempotent
    expect(twice.split('\n').length).toBe(once.split('\n').length);
  });

  test('consecutive blocks should not accumulate extra spacing', () => {
    const input = `<# block 'first' #>
A
<# end #>
<# block 'second' #>
B  
<# end #>`;
    
    const once = format(input);
    const twice = format(once);
    const thrice = format(twice);
    
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
    
    // Should maintain stable line count
    expect(twice.split('\n').length).toBe(once.split('\n').length);
    expect(thrice.split('\n').length).toBe(once.split('\n').length);
  });
});