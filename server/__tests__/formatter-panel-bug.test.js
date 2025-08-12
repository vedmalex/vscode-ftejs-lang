// Mock prettier to avoid module issues in tests  
const { mockPrettier } = require('./testSetup.js');
mockPrettier();

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter Panel Bug Fix', () => {
  test('should preserve blocks and directives in panel alias example', () => {
    const inputText = `<#@ alias "index" #>
<#@ extend 'template.nhtml' #>
<section>
  #{partial(context, 'panel')}
</section>
<section>
  <# var extra = { title: 'Another panel!!!', body:'extra content'}#>
  #{partial(extra, 'panel')}
</section>`;

    // Parse with actual parser
    const ast = Parser.parse(inputText, { indent: 2 });
    expect(ast).toBeDefined();
    expect(ast.tokens).toBeDefined();
    expect(ast.tokens.length).toBeGreaterThan(0);

    // Format with new algorithm
    const result = formatWithSourceWalking(inputText, ast, {
      indentSize: 2,
      defaultLang: 'html',
      settings: { 
        format: { 
          textFormatter: true,
          codeFormatter: true,
          keepBlankLines: -1
        } 
      },
      uri: 'file:///test.nhtml',
      prettierConfigCache: {}
    });

    // CRITICAL: All essential content must be preserved
    // Note: exact formatting may vary with real prettier, but structure must be intact
    
    // Verify specific directives are preserved
    expect(result).toContain('<#@ alias "index" #>');
    expect(result).toContain(`<#@ extend 'template.nhtml' #>`);
    
    // Verify HTML structure is preserved
    expect(result).toContain('<section>');
    expect(result).toContain('</section>');
    
    // Verify expressions are preserved
    expect(result).toContain('#{partial(context, \'panel\')}');
    expect(result).toContain('#{partial(extra, \'panel\')}');
    
    // Verify code blocks are preserved
    expect(result).toContain('var extra = {');
    
    // CRITICAL: The most important fix - ensure no content is completely lost
    // Check that result is not empty or corrupted
    expect(result.length).toBeGreaterThan(100);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    
    // Verify structural integrity - must contain all major elements
    const expectedElements = [
      '<#@ alias "index" #>',
      '<#@ extend \'template.nhtml\' #>',
      '<section>',
      '#{partial(context, \'panel\')}',
      '</section>',
      '<#',
      'var extra = {',
      'title: \'Another panel!!!\'',
      '#{partial(extra, \'panel\')}'
    ];
    
    for (const element of expectedElements) {
      expect(result).toContain(element);
    }
  });

  test('should handle block definitions without corruption', () => {
    const inputText = `<#@ context 'data' #>
<# block 'header' : #>
  <h1>#{data.title}</h1>
<# end #>
<# block 'content' : #>
  <p>#{data.body}</p>
<# end #>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const result = formatWithSourceWalking(inputText, ast, {
      indentSize: 2,
      defaultLang: 'html',
      settings: { 
        format: { 
          textFormatter: true,
          codeFormatter: true,
          keepBlankLines: -1
        } 
      },
      uri: 'file:///test.nhtml',
      prettierConfigCache: {}
    });

    // CRITICAL: Blocks must not be deleted or corrupted
    expect(result).toContain(`<# block 'header' : #>`);
    expect(result).toContain(`<# block 'content' : #>`);
    expect(result).toContain('<# end #>');
    
    // Verify directive is preserved
    expect(result).toContain(`<#@ context 'data' #>`);
    
    // Verify expressions in blocks are preserved  
    expect(result).toContain('#{data.title}');
    expect(result).toContain('#{data.body}');
    
    // Verify HTML content is preserved
    expect(result).toContain('<h1>');
    expect(result).toContain('</h1>');
    expect(result).toContain('<p>');
    expect(result).toContain('</p>');
    
    // Verify no critical content is lost
    expect(result.length).toBeGreaterThan(50);
    
    // Count the number of blocks and ends - must match
    const blockStarts = (result.match(/<# block/g) || []).length;
    const blockEnds = (result.match(/<# end #>/g) || []).length;
    expect(blockStarts).toBe(2);
    expect(blockEnds).toBe(2);
  });
});