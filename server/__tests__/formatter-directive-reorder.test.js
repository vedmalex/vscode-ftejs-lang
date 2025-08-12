const { formatWithSourceWalking } = require('../out/formatterCore');
const { Parser } = require('../out/parser');

describe('Directive Reordering', () => {
  it('should move directives to the top of template', () => {
    const input = `<div>Content</div>
<#@ context 'data' #>
<p>More content</p>
<#@ extend 'base.nhtml' #>`;
    
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
    
    // Directives should be at the top
    const lines = result.split('\n');
    expect(lines[0]).toBe("<#@ context 'data' #>");
    expect(lines[1]).toBe("<#@ extend 'base.nhtml' #>");
    // Content should follow
    expect(result).toContain('<div>Content</div>');
    expect(result).toContain('<p>More content</p>');
  });

  it('should handle mixed content with directives', () => {
    const input = `<h1>Title</h1>
<#@ context 'data' #>
<# if (data.showHeader) { #>
<header>Header</header>
<# } #>
<#@ requireAs('util.njs', 'util') #>
<main>Main content</main>`;
    
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
    
    // Should start with directives
    expect(result.startsWith("<#@ context 'data' #>")).toBe(true);
    expect(result).toContain("<#@ requireAs('util.njs', 'util') #>");
    
    // Content should be preserved
    expect(result).toContain('<h1>Title</h1>');
    expect(result).toContain('<# if (data.showHeader) { #>');
    expect(result).toContain('<main>Main content</main>');
  });

  it('should handle template with no directives', () => {
    const input = `<div>Just content</div>
<# if (condition) { #>
<p>Conditional content</p>
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
    
    // Should preserve structure without changes
    expect(result).toContain('<div>Just content</div>');
    expect(result).toContain('<# if (condition) { #>');
    expect(result).toContain('<p>Conditional content</p>');
  });

  it('should handle directive-only template', () => {
    const input = `<#@ context 'data' #>
<#@ extend 'base.nhtml' #>
<#@ requireAs('util.njs', 'util') #>`;
    
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
    
    // Should preserve all directives
    expect(result).toContain("<#@ context 'data' #>");
    expect(result).toContain("<#@ extend 'base.nhtml' #>");
    expect(result).toContain("<#@ requireAs('util.njs', 'util') #>");
  });
});