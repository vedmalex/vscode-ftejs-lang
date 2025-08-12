const { formatWithSourceWalking } = require('../out/formatterCore');
const { Parser } = require('../out/parser');

describe('Directive placement (preserve as-is)', () => {
  it('should preserve directive positions and indentation', () => {
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

    // Expect exact match since we do not reorder
    expect(result).toBe(input);
  });

  it('should preserve mixed content with directives in-place', () => {
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

    expect(result).toBe(input);
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
    expect(result).toBe(input);
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
    
    // Should preserve all directives exactly as-is
    expect(result).toBe(input);
  });
});