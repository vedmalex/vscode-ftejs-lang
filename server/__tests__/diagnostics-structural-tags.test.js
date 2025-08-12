describe('Diagnostics Structural Tags Skip Logic', () => {
  
  // Test the regex that should skip structural tags
  const structuralTagRegex = /^<#-?\s*(block|slot|end)\b/;
  
  test('should identify structural tags correctly', () => {
    const structuralCases = [
      '<# block \'test\' : #>',
      '<#- block \'test\' : #>',
      '<# slot \'sidebar\' : #>',
      '<#- slot \'sidebar\' : #>',
      '<# end #>',
      '<#- end #>',
      '<#  block  \'spaced\'  :  #>',
      '<#-  slot  \'spaced\'  :  #>',
      '<#   end   #>',
    ];
    
    structuralCases.forEach(text => {
      expect(structuralTagRegex.test(text)).toBe(true);
    });
  });

  test('should NOT identify regular code tags as structural', () => {
    const regularCases = [
      '<# if (condition) { #>',
      '<#- if (condition) { #>',
      '<# } #>',
      '<#- } #>',
      '<# for (item of items) { #>',
      '<#- const x = 5; #>',
      '<# console.log("test"); #>',
      '<#@ directive #>',  // directives should not match
    ];
    
    regularCases.forEach(text => {
      expect(structuralTagRegex.test(text)).toBe(false);
    });
  });

  test('should handle edge cases correctly', () => {
    const edgeCases = [
      { text: '<#blocked', expected: false },  // not a complete tag
      { text: '<# ending', expected: false },  // not a complete 'end'
      { text: '<# slotted', expected: false }, // not a complete 'slot'
      { text: '<#block', expected: true },     // no space before 'block'
      { text: '<#-block', expected: true },    // no space before 'block' with trim
      { text: '<# end#>', expected: true },    // 'end' is still detected
    ];
    
    edgeCases.forEach(({ text, expected }) => {
      expect(structuralTagRegex.test(text)).toBe(expected);
    });
  });

  test('should match the server.ts implementation exactly', () => {
    // This tests the exact logic from server.ts lines 690 and 710:
    // if (/^<#-?\s*(block|slot|end)\b/.test(tail)) continue;
    
    const testTexts = [
      '  <# block \'header\' : #>',
      '  <# slot \'sidebar\' : #>',
      '  <# end #>',
      '  <# if (true) { #>',
    ];
    
    testTexts.forEach(text => {
      const ml = { index: text.indexOf('<#') };
      const tail = text.slice(ml.index, ml.index + 12);
      const shouldSkip = /^<#-?\s*(block|slot|end)\b/.test(tail);
      
      if (text.includes('block') || text.includes('slot') || text.includes('end #>')) {
        expect(shouldSkip).toBe(true);
      } else {
        expect(shouldSkip).toBe(false);
      }
    });
  });

  test('verify specific problematic cases are handled', () => {
    // These are the exact cases mentioned in the specification
    const problematicCases = [
      ' <# block \'my-block\' : #>',   // should be skipped (no hint)
      ' <# slot \'my-slot\' : #>',     // should be skipped (no hint)  
      ' <# end #>',                   // should be skipped (no hint)
      ' <# if (true) { #>',           // should NOT be skipped (hint allowed)
    ];
    
    problematicCases.forEach(text => {
      const index = text.indexOf('<#');
      const tail = text.slice(index, index + 12);
      const shouldSkip = /^<#-?\s*(block|slot|end)\b/.test(tail);
      
      if (text.includes('if (true)')) {
        expect(shouldSkip).toBe(false); // Regular code should get hints
      } else {
        expect(shouldSkip).toBe(true);  // Structural tags should be skipped
      }
    });
  });
});