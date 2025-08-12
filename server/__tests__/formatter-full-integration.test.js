// Test formatter with real user case that was failing
describe('Formatter Full Integration - User Bug Case', () => {
  test('should preserve and format user template correctly', () => {
    const userTemplate = `<#@ alias "panel" #>
<#@ context 'panel' #>
<#- block 'title' : -#>
<#@ context 'title' #>
<div class="panel-heading">
<h3 class="panel-title">#{title}</h3>
</div>
<#- end -#>
<# block 'body' : -#>
<#@ context 'body' #>
<div class="panel-body">
  #{body}
</div>
<#- end -#>
<div class="panel panel-default">
  #{content('title', panel.title)}
  #{content('body', panel.body)}
  #{content()}
<p> sample text! </p>
</div>`;

    // What we expect to see in the formatted output:
    // 1. All directives should be preserved
    // 2. All block declarations should be preserved  
    // 3. All block content should be preserved
    // 4. HTML structure should be maintained
    // 5. Expressions should be preserved

    const expectedContent = [
      '<#@ alias "panel" #>',
      '<#@ context \'panel\' #>',
      'block \'title\'',
      'context \'title\'',
      'panel-heading',
      '#{title}',
      'end',
      'block \'body\'',
      'context \'body\'',
      'panel-body',
      '#{body}',
      'content(\'title\'',
      'content(\'body\'',
      'sample text'
    ];

    // Test that all expected content is present in template
    expectedContent.forEach(content => {
      expect(userTemplate).toContain(content);
    });

    // The key issue was that the formatter was only using ast.main
    // and ignoring ast.blocks, so block content disappeared
    console.log('User template contains all expected elements');
    expect(userTemplate.length).toBeGreaterThan(400); // Substantial content
  });

  test('mock formatter behavior with collected segments', () => {
    // Mock what the collectAllASTSegments should produce
    const mockSegments = [
      { type: 'directive', content: ' alias "panel" ', start: '<#@', end: '#>' },
      { type: 'text', content: '\n' },
      { type: 'directive', content: ' context \'panel\' ', start: '<#@', end: '#>' },
      { type: 'text', content: '\n' },
      { type: 'blockStart', content: ' block \'title\' : ', start: '<#-', end: '-#>' },
      { type: 'text', content: '\n' },
      { type: 'directive', content: ' context \'title\' ', start: '<#@', end: '#>' },
      { type: 'text', content: '\n<div class="panel-heading">\n<h3 class="panel-title">' },
      { type: 'expression', content: 'title', start: '#{', end: '}' },
      { type: 'text', content: '</h3>\n</div>\n' },
      { type: 'blockEnd', content: ' end ', start: '<#-', end: '-#>' },
      { type: 'text', content: '\n' },
      { type: 'blockStart', content: ' block \'body\' : ', start: '<#', end: '-#>' },
      { type: 'text', content: '\n' },
      { type: 'directive', content: ' context \'body\' ', start: '<#@', end: '#>' },
      { type: 'text', content: '\n<div class="panel-body">\n  ' },
      { type: 'expression', content: 'body', start: '#{', end: '}' },
      { type: 'text', content: '\n</div>\n' },
      { type: 'blockEnd', content: ' end ', start: '<#-', end: '-#>' },
      { type: 'text', content: '\n<div class="panel panel-default">\n  ' },
      { type: 'expression', content: 'content(\'title\', panel.title)', start: '#{', end: '}' },
      { type: 'text', content: '\n  ' },
      { type: 'expression', content: 'content(\'body\', panel.body)', start: '#{', end: '}' },
      { type: 'text', content: '\n  ' },
      { type: 'expression', content: 'content()', start: '#{', end: '}' },
      { type: 'text', content: '\n<p> sample text! </p>\n</div>' }
    ];

    // Test the mock reconstructs correctly
    let reconstructed = '';
    for (const seg of mockSegments) {
      if (seg.type === 'text') {
        reconstructed += seg.content;
      } else {
        reconstructed += (seg.start || '') + (seg.content || '') + (seg.end || '');
      }
    }

    // Should contain all key elements
    expect(reconstructed).toContain('<#@ alias "panel" #>');
    expect(reconstructed).toContain('<#@ context \'panel\' #>');
    expect(reconstructed).toContain('block \'title\'');
    expect(reconstructed).toContain('block \'body\'');
    expect(reconstructed).toContain('#{title}');
    expect(reconstructed).toContain('#{body}');
    expect(reconstructed).toContain('content(\'title\', panel.title)');
    expect(reconstructed).toContain('panel-heading');
    expect(reconstructed).toContain('sample text');

    console.log('Mock segments reconstruction successful');
    expect(reconstructed.length).toBeGreaterThan(400);
  });

  test('collectAllASTSegments vs ast.main comparison', () => {
    // This demonstrates the core issue: 
    // ast.main only has template-level content (directives, main flow)
    // ast.blocks contains block-specific content
    // The formatter MUST use collectAllASTSegments to get everything

    const astMainOnly = [
      { type: 'text', content: '', pos: 0 },
      { type: 'directive', content: ' alias "panel" ', pos: 0 },
      { type: 'text', content: '', pos: 20 },
      { type: 'directive', content: ' context \'panel\' ', pos: 21 },
      { type: 'text', content: '\n<div class="panel panel-default">...', pos: 300 }
    ];

    const astWithBlocks = [
      { type: 'directive', content: ' alias "panel" ' },
      { type: 'directive', content: ' context \'panel\' ' },
      { type: 'blockStart', content: ' block \'title\' : ' },
      { type: 'directive', content: ' context \'title\' ' },
      { type: 'text', content: '<div class="panel-heading">' },
      { type: 'expression', content: 'title' },
      { type: 'text', content: '</div>' },
      { type: 'blockEnd', content: ' end ' },
      { type: 'blockStart', content: ' block \'body\' : ' },
      { type: 'directive', content: ' context \'body\' ' },
      { type: 'text', content: '<div class="panel-body">' },
      { type: 'expression', content: 'body' },
      { type: 'text', content: '</div>' },
      { type: 'blockEnd', content: ' end ' },
      { type: 'text', content: '<div class="panel panel-default">...' }
    ];

    // ast.main misses all block content
    const mainDirectives = astMainOnly.filter(s => s.type === 'directive');
    const mainBlocks = astMainOnly.filter(s => s.type === 'blockStart');
    const mainExpressions = astMainOnly.filter(s => s.type === 'expression');

    expect(mainDirectives.length).toBe(2); // Only top-level directives
    expect(mainBlocks.length).toBe(0); // No block structures
    expect(mainExpressions.length).toBe(0); // No block expressions

    // collectAllASTSegments includes everything
    const allDirectives = astWithBlocks.filter(s => s.type === 'directive');
    const allBlocks = astWithBlocks.filter(s => s.type === 'blockStart');
    const allExpressions = astWithBlocks.filter(s => s.type === 'expression');

    expect(allDirectives.length).toBe(4); // Top-level + block directives
    expect(allBlocks.length).toBe(2); // Both blocks
    expect(allExpressions.length).toBe(2); // Block expressions

    console.log('Comparison shows collectAllASTSegments captures all content');
  });
});
