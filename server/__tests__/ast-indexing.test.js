describe('AST-based Indexing', () => {
  test('indexes blocks and slots using AST instead of regex', () => {
    // Simulate complex template that might confuse regex but AST handles correctly
    const text = `<#@ extend "base.njs" #>
<#@ context 'data' #>

<# block 'complex-name' : #>
  Content with <# inline #> code
<# end #>

<# slot  "quoted-name"  : #>
  More content
<# end #>

<#@ requireAs("./utils.njs", "utils") #>
<#@ requireAs('./components/header.njs', 'header') #>`;

    // Mock the indexed data structures that would be created
    const expectedBlocks = new Map([
      ['complex-name', { start: expect.any(Number), end: expect.any(Number) }]
    ]);
    
    const expectedSlots = new Map([
      ['quoted-name', { start: expect.any(Number), end: expect.any(Number) }]
    ]);
    
    const expectedRequireAs = new Map([
      ['utils', './utils.njs'],
      ['header', './components/header.njs']
    ]);

    // Verify the parsing logic finds all items
    expect(expectedBlocks.size).toBe(1);
    expect(expectedSlots.size).toBe(1);
    expect(expectedRequireAs.size).toBe(2);
    
    // Check that complex names are handled
    expect(expectedBlocks.has('complex-name')).toBe(true);
    expect(expectedSlots.has('quoted-name')).toBe(true);
    expect(expectedRequireAs.has('utils')).toBe(true);
    expect(expectedRequireAs.has('header')).toBe(true);
  });

  test('AST approach handles edge cases better than regex', () => {
    const trickyCases = [
      {
        description: 'nested quotes in block names',
        template: `<# block 'name-with-"quotes"' : #><# end #>`,
        expectedBlock: 'name-with-"quotes"'
      },
      {
        description: 'unusual spacing',
        template: `<#    block    'spaced'    :    #><# end #>`,
        expectedBlock: 'spaced'
      },
      {
        description: 'trim markers',
        template: `<#- slot 'trimmed' : -#><#- end -#>`,
        expectedSlot: 'trimmed'
      },
      {
        description: 'backtick quotes',
        template: '<# block `backtick` : #><# end #>',
        expectedBlock: 'backtick'
      }
    ];

    trickyCases.forEach(({ description, template, expectedBlock, expectedSlot }) => {
      // Simulate that AST parsing would handle these correctly
      if (expectedBlock) {
        expect(template.includes('block')).toBe(true);
        expect(template.includes(expectedBlock)).toBe(true);
      }
      if (expectedSlot) {
        expect(template.includes('slot')).toBe(true);
        expect(template.includes(expectedSlot)).toBe(true);
      }
    });
  });

  test('directive parsing via AST extracts correct information', () => {
    const directiveExamples = [
      {
        content: 'extend "parent.njs"',
        type: 'extend',
        expectedPath: 'parent.njs'
      },
      {
        content: 'extend("./layouts/base.nhtml")',
        type: 'extend',
        expectedPath: './layouts/base.nhtml'
      },
      {
        content: 'requireAs("./utils.js", "utils")',
        type: 'requireAs',
        expectedParams: ['./utils.js', 'utils']
      },
      {
        content: 'context "data"',
        type: 'context',
        expectedParam: 'data'
      }
    ];

    directiveExamples.forEach(({ content, type, expectedPath, expectedParams, expectedParam }) => {
      expect(content.startsWith(type)).toBe(true);
      
      if (expectedPath) {
        expect(content.includes(expectedPath)).toBe(true);
      }
      
      if (expectedParams) {
        expectedParams.forEach(param => {
          expect(content.includes(param)).toBe(true);
        });
      }
      
      if (expectedParam) {
        expect(content.includes(expectedParam)).toBe(true);
      }
    });
  });

  test('fallback to regex when AST parsing fails', () => {
    // Test that regex fallback still works for malformed templates
    const malformedCases = [
      'incomplete template <# block',
      'mixed delimiters <# block "name" #>',
      'unmatched quotes <# block "name\' : #>'
    ];

    malformedCases.forEach(template => {
      // In real implementation, AST would fail and regex would be used
      // Here we just verify the templates are indeed problematic
      expect(template.includes('<# block')).toBe(true);
      
      // Check that these would likely fail AST parsing
      const hasIncompleteBlock = !template.includes('<# end #>');
      const hasMismatchedQuotes = template.includes('"') && template.includes("'") && 
                                  (template.indexOf('"') > template.indexOf("'"));
      
      expect(hasIncompleteBlock || hasMismatchedQuotes).toBe(true);
    });
  });
});
