// Test block isolation formatting rule: blocks should be visually separated and alone on lines

jest.mock('prettier', () => ({
  format: (src) => src.replace(/\s+/g, ' ').trim(),
  resolveConfigSync: () => ({})
}));

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter Block Isolation', () => {
  const formatOptions = {
    indentSize: 2,
    defaultLang: 'html',
    settings: { 
      format: { 
        textFormatter: false,
        codeFormatter: true,
        keepBlankLines: -1
      } 
    }
  };

  test('should isolate block start tag on its own line', () => {
    const input = `Some text<# block 'main' #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Block start should be alone on its line with separation
    expect(result).toContain("Some text\n\n<# block 'main' #>");
    expect(result).not.toContain("Some text<# block");
  });

  test('should isolate end tag on its own line', () => {
    const input = `Content<# end #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // End tag should be alone on its line
    expect(result).toContain("Content\n<# end #>");
    expect(result).not.toContain("Content<# end #>");
  });

  test('should add blank line before block for visual separation', () => {
    const input = `Some content
<# block 'test' #>
Block content
<# end #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Should have blank line before block
    expect(result).toContain("Some content\n\n<# block 'test' #>");
  });

  test('should add blank line after block end for visual separation', () => {
    const input = `<# end #>More content`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Should have blank line after end
    expect(result).toContain("<# end #>\n\nMore content");
  });

  test('should not add extra blank lines at start of file', () => {
    const input = `<# block 'main' #>
Content
<# end #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Should not start with blank line
    expect(result.startsWith('\n')).toBe(false);
    expect(result.startsWith("<# block 'main' #>")).toBe(true);
  });

  test('should handle slot isolation same as blocks', () => {
    const input = `Content<# slot 'sidebar' #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Slot should be isolated like block
    expect(result).toContain("Content\n\n<# slot 'sidebar' #>");
    expect(result).not.toContain("Content<# slot");
  });

  test('should handle multiple consecutive end tags', () => {
    const input = `<# end #><# end #>Content`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Each end tag should have proper separation
    expect(result).toContain("<# end #>\n<# end #>\n\nContent");
  });

  test('should preserve directives without extra separation', () => {
    const input = `<#@ context 'data' #><# block 'main' #>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Directive should not have extra separation, but block should
    expect(result).toContain("<#@ context 'data' #>\n\n<# block 'main' #>");
  });

  test('should format complex template with proper block isolation', () => {
    const input = `<#@ extend 'base.nhtml' #>
Text content here<# block 'header' #><# end #>More text`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Check that blocks are properly isolated
    expect(result).toContain("Text content here\n\n<# block 'header' #>\n");
    expect(result).toContain("<# end #>\n\nMore text");
  });
});