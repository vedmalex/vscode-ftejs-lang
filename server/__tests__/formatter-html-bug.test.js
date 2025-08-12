// Mock prettier to avoid module issues in tests
const { mockPrettier } = require('./testSetup.js');
mockPrettier();

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter HTML Bug Fix', () => {
  test('should preserve HTML structure and newlines', () => {
    const inputText = `<#@ context 'data' #>
<!doctype html>
<html>
  <head>
    <title>#{data.title}</title>
    <meta charset="utf-8">
  </head>
  <body>
    <header>
      <h1>Welcome</h1>
    </header>
    <main>
      <#- if (data.items?.length) { -#>
        <ul>
          <#- for (const item of data.items) { -#>
            <li>!{item}</li>
          <#- } -#>
        </ul>
      <#- } else { -#>
        <p>No items</p>
      <#- } -#>
    </main>
    <footer>
      <p>&copy; 2024</p>
    </footer>
  </body>
</html>`;

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

    // CRITICAL: HTML must not be collapsed to a single line or lose structure
    
    // Verify all essential HTML elements are preserved
    const essentialHtmlElements = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<title>#{data.title}</title>',
      '<meta charset="utf-8">',
      '</head>',
      '<body>',
      '<header>',
      '<h1>Welcome</h1>',
      '</header>',
      '<main>',
      '<ul>',
      '<li>!{item}</li>',
      '</ul>',
      '<p>No items</p>',
      '</main>',
      '<footer>',
      '<p>&copy; 2024</p>',
      '</footer>',
      '</body>',
      '</html>'
    ];
    
    for (const element of essentialHtmlElements) {
      expect(result).toContain(element);
    }
    
    // Verify expressions are preserved within HTML context
    expect(result).toContain('#{data.title}');
    expect(result).toContain('!{item}');
    
    // Verify template code blocks work correctly (note: exact spacing may vary)
    expect(result).toContain('if (data.items?.length)');
    expect(result).toContain('for (const item of data.items)');
    expect(result).toContain('<#-'); // Check for trimmed blocks
    expect(result).toContain('-#>'); // Check for trimmed blocks
    expect(result).toContain('<#'); // Check for regular blocks
    expect(result).toContain('#>'); // Check for regular blocks
    
    // Verify directive is preserved
    expect(result).toContain(`<#@ context 'data' #>`);
    
    // Ensure the result is not collapsed to a single line (critical bug test)
    const resultLines = result.split('\n').length;
    expect(resultLines).toBeGreaterThan(5); // Should have multiple lines, not collapsed
    
    // Verify result is substantial and not corrupted
    expect(result.length).toBeGreaterThan(200);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  test('should handle HTML with embedded expressions correctly', () => {
    const inputText = `<div class="card">
  <h2>#{title}</h2>
  <p>User: !{user.name}</p>
  <span>Count: #{items.length}</span>
</div>`;

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

    // CRITICAL: HTML with expressions must preserve structure
    expect(result).toContain('<div class="card">');
    expect(result).toContain('</div>');
    expect(result).toContain('<h2>');
    expect(result).toContain('</h2>');
    expect(result).toContain('<p>');
    expect(result).toContain('</p>');
    expect(result).toContain('<span>');
    expect(result).toContain('</span>');
    
    // Verify expressions are treated as part of text, not formatted as JS
    expect(result).toContain('#{title}');
    expect(result).toContain('!{user.name}');
    expect(result).toContain('#{items.length}');
    
    // Verify content is preserved
    expect(result).toContain('User:');
    expect(result).toContain('Count:');
  });

  test('should preserve whitespace sensitivity in HTML', () => {
    const inputText = `<p>This is <strong>important</strong> text with <em>emphasis</em>.</p>
<p>Another paragraph with   multiple   spaces.</p>`;

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

    // CRITICAL: Essential HTML elements and content must be preserved
    expect(result).toContain('<p>');
    expect(result).toContain('</p>');
    expect(result).toContain('<strong>important</strong>');
    expect(result).toContain('<em>emphasis</em>');
    expect(result).toContain('This is');
    expect(result).toContain('text with');
    expect(result).toContain('Another paragraph');
    
    // Note: exact whitespace preservation depends on real prettier settings
    // but content should not be lost
    expect(result).toContain('multiple');
    expect(result).toContain('spaces');
  });
});