const { Parser } = require('../out/parser');

describe('Parent Block Validation Logic', () => {
  it('should identify blocks declared in child template', () => {
    const input = `<#@ extend 'parent.nhtml' #>
<# block 'sidebar' : #>
<aside>New sidebar</aside>
<# end #>

<# block 'header' : #>
<h1>Override header</h1>
<# end #>`;
    
    const ast = Parser.parse(input);
    
    // Should parse blocks correctly
    expect(ast.blocks).toBeDefined();
    expect(Object.keys(ast.blocks)).toContain('sidebar');
    expect(Object.keys(ast.blocks)).toContain('header');
    
    // Should detect extend directive
    const extendDirective = ast.main.find(node => 
      node.type === 'directive' && 
      node.content && 
      node.content.includes('extend')
    );
    expect(extendDirective).toBeDefined();
  });

  it('should parse block positions for diagnostics', () => {
    const input = `<# block 'test' : #>
Content
<# end #>`;
    
    const ast = Parser.parse(input);
    
    expect(ast.blocks).toBeDefined();
    expect(ast.blocks['test']).toBeDefined();
    expect(ast.blocks['test'].declPos).toBeDefined();
    expect(typeof ast.blocks['test'].declPos).toBe('number');
  });

  it('should handle templates without extend directive', () => {
    const input = `<#@ context 'data' #>
<# block 'main' : #>
<p>Main content</p>
<# end #>`;
    
    const ast = Parser.parse(input);
    
    // Should not find extend directive
    const extendDirective = ast.main.find(node => 
      node.type === 'directive' && 
      node.content && 
      node.content.includes('extend')
    );
    expect(extendDirective).toBeUndefined();
    
    // Should still parse blocks
    expect(ast.blocks).toBeDefined();
    expect(Object.keys(ast.blocks)).toContain('main');
  });

  it('should handle complex extend directive patterns', () => {
    const patterns = [
      `<#@ extend 'base.nhtml' #>`,
      `<#@ extend "base.nhtml" #>`,
      `<#@extend 'base.nhtml'#>`,
      `<#@ extend './layouts/base.nhtml' #>`
    ];
    
    patterns.forEach(pattern => {
      const input = `${pattern}
<# block 'test' : #>
<p>Test</p>
<# end #>`;
      
      const ast = Parser.parse(input);
      
      const extendDirective = ast.main.find(node => 
        node.type === 'directive' && 
        node.content && 
        node.content.includes('extend')
      );
      expect(extendDirective).toBeDefined();
    });
  });
});