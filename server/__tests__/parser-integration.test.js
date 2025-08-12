const { Parser } = require('../out/parser.js');

describe('Local parser integration', () => {
  test('handles adjacent closing/opening tags #>#<#', () => {
    const text = '<#  if(!context.filesDb || context.filesDb === context.dbUrl){ #>#<# } #>FILES_URL=#{context.filesDb??""}';
    const ast = Parser.parse(text);
    
    expect(ast.main).toBeDefined();
    expect(ast.main.length).toBeGreaterThan(0);
    
    // Should detect code blocks and expressions correctly
    const codeNodes = ast.main.filter(n => n.type === 'code');
    const exprNodes = ast.main.filter(n => n.type === 'expression');
    const textNodes = ast.main.filter(n => n.type === 'text');
    
    expect(codeNodes.length).toBe(2); // Two code blocks
    expect(exprNodes.length).toBe(1); // One expression
    expect(textNodes.length).toBeGreaterThan(0); // Some text
  });

  test('handles complex .njs template with trim markers', () => {
    const text = '<#- if (context.SCREENS > 2) {#>\ncontent here\n<#- }#>';
    const ast = Parser.parse(text);
    
    expect(ast.main).toBeDefined();
    const codeNodes = ast.main.filter(n => n.type === 'code');
    expect(codeNodes.length).toBe(2);
    
    // Check trim markers are preserved
    expect(codeNodes[0].start).toBe('<#-');
    expect(codeNodes[1].start).toBe('<#-');
  });

  test('detects blocks and slots correctly', () => {
    const text = '<# block "test" : #>\ncontent\n<# end #>\n<# slot "myslot" : #>\nslot content\n<# end #>';
    const ast = Parser.parse(text);
    
    expect(ast.blocks).toBeDefined();
    expect(ast.blocks.test).toBeDefined();
    expect(ast.slots).toBeDefined();
    expect(ast.slots.myslot).toBeDefined();
  });

  test('handles expressions correctly', () => {
    const text = 'Text #{variable} more text !{htmlVar} end';
    const ast = Parser.parse(text);
    
    const exprNodes = ast.main.filter(n => n.type === 'expression');
    expect(exprNodes.length).toBe(2);
    expect(exprNodes[0].content.trim()).toBe('variable');
    expect(exprNodes[1].content.trim()).toBe('htmlVar');
  });

  test('handles directives', () => {
    const text = '<#@ extend "base.nhtml" #>\n<#@ context "data" #>';
    const ast = Parser.parse(text);
    
    // Main should contain minimal items since directives don't add to main
    expect(ast.main).toBeDefined();
  });
});
