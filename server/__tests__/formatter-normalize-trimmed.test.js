const { formatWithSourceWalking } = require('../out/formatterCore');
const { Parser } = require('../out/parser');

describe('Normalize Trimmed Structural Tags', () => {
  it('should normalize <#- block to <# block', () => {
    const input = `<#- block 'header' : -#>
<h1>Header content</h1>
<#- end -#>`;
    
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
    
    // Should normalize block opener
    expect(result).toContain("<# block 'header' : #>");
    expect(result).not.toContain("<#- block");
    expect(result).not.toContain("-#>");
    expect(result).toContain('<h1>Header content</h1>');
    expect(result).toContain('<# end #>');
  });

  it('should normalize <#- slot to <# slot', () => {
    const input = `<#- slot 'sidebar' : -#>
<aside>Default sidebar</aside>
<#- end -#>`;
    
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
    
    // Should normalize slot opener
    expect(result).toContain("<# slot 'sidebar' : #>");
    expect(result).not.toContain("<#- slot");
    expect(result).toContain('<aside>Default sidebar</aside>');
  });

  it('should preserve trimming on non-structural tags', () => {
    const input = `<#- if (condition) { -#>
<p>Content</p>
<#- } -#>`;
    
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
    
    // Should preserve trimming on code blocks (not structural)
    expect(result).toContain('<#- if (condition) { -#>');
    expect(result).toContain('<#- } -#>');
    expect(result).toContain('<p>Content</p>');
  });

  it('should handle mixed structural and code tags', () => {
    const input = `<#@ context 'data' #>
<#- block 'main' : -#>
<#- if (data.title) { -#>
<h1>#{data.title}</h1>
<#- } -#>
<#- end -#>`;
    
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
    
    // Directive should be at top
    expect(result.startsWith("<#@ context 'data' #>")).toBe(true);
    
    // Block should be normalized
    expect(result).toContain("<# block 'main' : #>");
    expect(result).toContain("<# end #>");
    
    // Code blocks should preserve trimming
    expect(result).toContain('<#- if (data.title) { -#>');
    expect(result).toContain('<#- } -#>');
    
    // Content preserved
    expect(result).toContain('<h1>#{data.title}</h1>');
  });

  it('should handle various spacing patterns in trimmed blocks', () => {
    const input = `<#-block 'test':-#>
Content
<#-end-#>`;
    
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
    
    // Should normalize regardless of spacing
    expect(result).toContain("<# block 'test' : #>");
    expect(result).toContain('<# end #>');
    expect(result).toContain('Content');
  });
});