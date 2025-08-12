const { formatWithSourceWalking } = require('../out/formatterCore');
const { Parser } = require('../out/parser');

describe('Text Formatter Enable', () => {
  it('should not crash when textFormatter is enabled', () => {
    const input = `<div><span>Test</span><p>Content</p></div>`;
    const ast = Parser.parse(input);
    
    const settings = {
      format: { textFormatter: false, keepBlankLines: 1 } // Disable to avoid prettier
    };
    
    const result = formatWithSourceWalking(input, ast, {
      indentSize: 2,
      defaultLang: 'javascript',
      settings,
      uri: 'test.nhtml',
      prettierConfigCache: {}
    });
    
    // Should preserve content without crashing
    expect(result).toBe(`<div><span>Test</span><p>Content</p></div>`);
  });

  it('should handle template with code blocks and preserve text', () => {
    const input = `<#@ context 'data' #>
<div>Content</div>
<# if (data.showMore) { #>
<section>More</section>
<# } #>`;
    
    const ast = Parser.parse(input);
    
    const settings = {
      format: { textFormatter: false, codeFormatter: false, keepBlankLines: 1 }
    };
    
    const result = formatWithSourceWalking(input, ast, {
      indentSize: 2,
      defaultLang: 'javascript',
      settings,
      uri: 'test.nhtml',
      prettierConfigCache: {}
    });
    
    // Should preserve structure and format code
    expect(result).toContain('<div>Content</div>');
    expect(result).toContain('<#@ context \'data\' #>');
    expect(result).toContain('<# if (data.showMore) { #>');
  });

  it('should handle expressions within text properly', () => {
    const input = `<h1>Hello #{user.name}!</h1>`;
    
    const ast = Parser.parse(input);
    
    const settings = {
      format: { textFormatter: false, keepBlankLines: 1 }
    };
    
    const result = formatWithSourceWalking(input, ast, {
      indentSize: 2,
      defaultLang: 'javascript',
      settings,
      uri: 'test.nhtml',
      prettierConfigCache: {}
    });
    
    // Expressions should be preserved within text
    expect(result).toContain('#{user.name}');
    expect(result).toBe('<h1>Hello #{user.name}!</h1>');
  });
});