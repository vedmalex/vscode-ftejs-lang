describe('EJS Trimming Edge Cases', () => {
  test('identifies EJS trim markers correctly', () => {
    const text = `  <%_ code() _%>  
    <% content -%>
      content here  
    <%- expression() %>`;

    // Test EJS left-trim patterns: <%_ and <%-
    const leftTrimMatches = [...text.matchAll(/<%[-_]/g)];
    expect(leftTrimMatches).toHaveLength(2); // <%_ and <%-

    // Test EJS right-trim patterns: _%> and -%>
    const rightTrimMatches = [...text.matchAll(/[-_]%>/g)];
    expect(rightTrimMatches).toHaveLength(2); // _%> and -%>

    // Verify the trim patterns are correctly identified
    const leftTrimPositions = leftTrimMatches.map(m => ({
      position: m.index,
      marker: m[0]
    }));

    const rightTrimPositions = rightTrimMatches.map(m => ({
      position: m.index,
      marker: m[0]
    }));

    expect(leftTrimPositions[0].marker).toBe('<%_');
    expect(leftTrimPositions[1].marker).toBe('<%-');
    expect(rightTrimPositions[0].marker).toBe('_%>');
    expect(rightTrimPositions[1].marker).toBe('-%>');
  });

  test('handles mixed fte.js and EJS trim markers', () => {
    const text = `<#- block 'header' : -#>
    <%_ if (condition) { _%>
      <# content #>
    <%- } -%>
  <#- end -#>`;

    // FTE trim markers
    const fteLeftTrims = [...text.matchAll(/<#-/g)];
    const fteRightTrims = [...text.matchAll(/-#>/g)];

    // EJS trim markers  
    const ejsLeftTrims = [...text.matchAll(/<%[-_]/g)];
    const ejsRightTrims = [...text.matchAll(/[-_]%>/g)];

    expect(fteLeftTrims).toHaveLength(2); // <#- block and <#- end
    expect(fteRightTrims).toHaveLength(2); // -#> from block and end
    expect(ejsLeftTrims).toHaveLength(2); // <%_ and <%-
    expect(ejsRightTrims).toHaveLength(2); // _%> and -%>
  });

  test('validates EJS trim syntax combinations', () => {
    // Valid combinations according to EJS spec
    const validPatterns = [
      '<%_ code() _%>',  // underscore trim on both sides
      '<% code() -%>',   // dash trim on right only
      '<%- code() %>',   // dash trim on left only
      '<%= expr _%>',    // expression with underscore right trim
      '<%# comment -%>', // comment with dash right trim
    ];

    validPatterns.forEach(pattern => {
      const hasLeftTrim = /<%[-_]/.test(pattern);
      const hasRightTrim = /[-_]%>/.test(pattern);
      
      // At least one should be true for these test patterns
      expect(hasLeftTrim || hasRightTrim).toBe(true);
    });
  });

  test('avoids false positives with non-trim EJS', () => {
    const text = `<% regular %>
    <%= expression %>
    <%# comment %>`;

    // Should not match any trim patterns
    const leftTrims = [...text.matchAll(/<%[-_]/g)];
    const rightTrims = [...text.matchAll(/[-_]%>/g)];

    expect(leftTrims).toHaveLength(0);
    expect(rightTrims).toHaveLength(0);
  });
});
