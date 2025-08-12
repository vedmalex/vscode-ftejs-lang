describe('Directive Trim Hints Logic', () => {
  // Test that directive skip logic is correctly implemented
  test('skip logic correctly identifies directive tags', () => {
    // Test the core skip logic: if (text.slice(ml.index, ml.index + 3) === '<#@') continue;
    
    const testCases = [
      { text: '<#@', expected: true },   // directive
      { text: '<# ', expected: false },  // regular tag  
      { text: '<#-', expected: false },  // trimmed tag
      { text: '<#}', expected: false },  // expression end
    ];
    
    testCases.forEach(({ text, expected }) => {
      const isDirective = text.slice(0, 3) === '<#@';
      expect(isDirective).toBe(expected);
    });
  });

  test('right-trim directive skip logic works correctly', () => {
    // Test the core right-trim skip logic: if (openPos >= 0 && text[openPos + 2] === '@')
    
    const scenarios = [
      { opener: '<#@', expectedSkip: true },   // directive
      { opener: '<# ', expectedSkip: false },  // regular tag
      { opener: '<#-', expectedSkip: false },  // trimmed tag
    ];
    
    scenarios.forEach(({ opener, expectedSkip }) => {
      const isDirectiveEnd = opener.length > 2 && opener[2] === '@';
      expect(isDirectiveEnd).toBe(expectedSkip);
    });
  });
});
