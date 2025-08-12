describe('Content Completion Logic', () => {
  test('matches content() function call arguments correctly', () => {
    const testCases = [
      { 
        text: 'content("',
        expected: true,
        description: 'double quotes' 
      },
      { 
        text: "content('",
        expected: true,
        description: 'single quotes'
      },
      { 
        text: 'content(`',
        expected: true,
        description: 'backticks'
      },
      { 
        text: 'content( "partial',
        expected: true,
        description: 'with spaces'
      },
      { 
        text: 'slot("name',
        expected: true,
        description: 'slot function'
      },
      { 
        text: 'partial("name',
        expected: false,
        description: 'different function'
      },
      { 
        text: 'content(variable',
        expected: false,
        description: 'non-string argument'
      }
    ];

    testCases.forEach(({ text, expected, description }) => {
      const regex = /content\(\s*(["'`])([^"'`]*)$|slot\(\s*(["'`])([^"'`]*)$/;
      const match = text.match(regex);
      expect(!!match).toBe(expected);
    });
  });

  test('completion context recognition works correctly', () => {
    const scenarios = [
      {
        prefix: '#{content("block',
        shouldTrigger: true,
        description: 'inside expression'
      },
      {
        prefix: '<# const x = content("block',
        shouldTrigger: true,
        description: 'inside code block'
      },
      {
        prefix: '#{slot(\'name',
        shouldTrigger: true,
        description: 'slot completion'
      },
      {
        prefix: 'some text content("block',
        shouldTrigger: true,
        description: 'anywhere in text'
      }
    ];

    scenarios.forEach(({ prefix, shouldTrigger, description }) => {
      // Simulate the prefix check logic from server.ts
      const isInExpression = /#\{\s*[\w$]*$/.test(prefix);
      const hasArgPrefix = /content\(\s*(["'`])([^"'`]*)$|slot\(\s*(["'`])([^"'`]*)$/.test(prefix);
      
      const shouldComplete = isInExpression || hasArgPrefix;
      expect(shouldComplete).toBe(shouldTrigger);
    });
  });

  test('block collection logic covers all sources', () => {
    // Mock data structures that would be populated
    const mockFileIndex = new Map([
      ['file:///project/template1.njs', { 
        blocks: new Map([['header', {}], ['footer', {}]]) 
      }],
      ['file:///project/template2.njs', { 
        blocks: new Map([['sidebar', {}], ['content', {}]]) 
      }]
    ]);

    const mockLocalBlocks = { 'main': {}, 'intro': {} };
    const mockParentBlocks = { 'base-header': {}, 'base-footer': {} };

    // Simulate the collection logic
    const seen = new Set();
    
    // Local blocks
    for (const k of Object.keys(mockLocalBlocks)) seen.add(k);
    
    // Parent blocks  
    for (const k of Object.keys(mockParentBlocks)) seen.add(k);
    
    // Project blocks
    for (const [, info] of mockFileIndex) {
      for (const k of info.blocks.keys()) seen.add(k);
    }

    // Should have collected all unique block names
    const expected = ['main', 'intro', 'base-header', 'base-footer', 'header', 'footer', 'sidebar', 'content'];
    const collected = Array.from(seen).sort();
    
    expect(collected).toEqual(expected.sort());
    expect(collected).toHaveLength(8); // All unique blocks
  });
});
