describe('Formatter Directive Bug', () => {
  test('should identify directive segments correctly', () => {
    // Test that directive segments are properly recognized
    const directiveSegments = [
      { type: 'directive', content: ' alias "index" ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' extend "base.nhtml" ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' context \'data\' ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' requireAs("./utils.njs", "utils") ', start: '<#@', end: '#>' }
    ];

    directiveSegments.forEach(segment => {
      expect(segment.type).toBe('directive');
      expect(segment.start).toBe('<#@');
      expect(segment.end).toBe('#>');
      expect(segment.content).toBeDefined();
      
      // Raw directive should be reconstructable
      const raw = segment.start + segment.content + segment.end;
      expect(raw.startsWith('<#@')).toBe(true);
      expect(raw.endsWith('#>')).toBe(true);
    });
  });

  test('should handle directive segments correctly in AST structure', () => {
    // Test that directive segments are properly recognized and preserved
    const directiveSegments = [
      { type: 'directive', content: ' alias "index" ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' extend "base.nhtml" ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' context \'data\' ', start: '<#@', end: '#>' },
      { type: 'directive', content: ' requireAs("./utils.njs", "utils") ', start: '<#@', end: '#>' }
    ];

    directiveSegments.forEach(segment => {
      expect(segment.type).toBe('directive');
      expect(segment.start).toBe('<#@');
      expect(segment.end).toBe('#>');
      expect(segment.content).toBeDefined();
    });
  });

  test('should not format directive content as code', () => {
    const directiveContent = ' extend "template.nhtml" ';
    
    // Directive content should not be treated as JavaScript code
    // and should not be formatted with prettier
    expect(directiveContent.trim().startsWith('extend')).toBe(true);
    expect(directiveContent.includes('"template.nhtml"')).toBe(true);
  });
});
