// Test that expression blocks #{} and !{} preserve their original indentation
// These are text insertion points, not code blocks, so their indentation should not change

jest.mock('prettier', () => ({
  format: (src) => src.replace(/\s+/g, ' ').trim(),
  resolveConfigSync: () => ({})
}));

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Expression Block Indentation Preservation', () => {
  const formatOptions = {
    indentSize: 2,
    defaultLang: 'html',
    settings: { 
      format: { 
        textFormatter: false,
        codeFormatter: true,
        keepBlankLines: -1
      } 
    }
  };

  test('should preserve indentation of #{} expressions in text', () => {
    const input = `<div>
    <p>Hello #{user.name}!</p>
      <span>Age: #{user.age}</span>
</div>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    console.log('SIMPLE INPUT:', JSON.stringify(input));
    console.log('SIMPLE RESULT:', JSON.stringify(result));
    
    // Expression blocks should maintain their original indentation within text
    expect(result).toContain('    <p>Hello #{user.name}!</p>');
    expect(result).toContain('      <span>Age: #{user.age}</span>');
    // Check that expressions keep their context (indentation is preserved)
    expect(result.indexOf('#{user.name}!')).toBe(result.indexOf('    <p>Hello #{user.name}!</p>') + '    <p>Hello '.length);
  });

  test('should preserve indentation of !{} expressions in text', () => {
    const input = `<ul>
  <li>Item: !{item.name}</li>
    <li>Description: !{item.desc}</li>
</ul>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Unescaped expressions should also preserve indentation
    expect(result).toContain('  <li>Item: !{item.name}</li>');
    expect(result).toContain('    <li>Description: !{item.desc}</li>');
  });

  test('should preserve complex nested expressions with indentation', () => {
    const input = `<div class="container">
  <h1>Welcome</h1>
    <p>Today is #{new Date().toLocaleDateString()}</p>
      <div>User: #{user ? user.name : 'Guest'}</div>
        <small>!{formatTime(Date.now())}</small>
</div>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    console.log('COMPLEX INPUT:', JSON.stringify(input));
    console.log('COMPLEX RESULT:', JSON.stringify(result));
    
    // All expressions should keep their original indentation
    expect(result).toContain('  <h1>Welcome</h1>');
    expect(result).toContain('    <p>Today is #{new Date().toLocaleDateString()}</p>');
    expect(result).toContain('      <div>User: #{user ? user.name : \'Guest\'}</div>');
    expect(result).toContain('        <small>!{formatTime(Date.now())}</small>');
  });

  test('should handle mixed code blocks and expressions correctly', () => {
    const input = `<# var user = context.user #>
<div>
  <p>Hello #{user.name}!</p>
  <# if (user.isAdmin) { #>
    <span class="admin">Admin: #{user.role}</span>
  <# } #>
</div>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Code blocks may be formatted, but expressions in text should preserve indentation
    expect(result).toContain('  <p>Hello #{user.name}!</p>');
    expect(result).toContain('    <span class="admin">Admin: #{user.role}</span>');
  });

  test('should not modify expressions that are part of HTML attributes', () => {
    const input = `<div class="user-#{user.id}" 
     data-name="#{user.name}"
       title="User: #{user.displayName}">
  Content
</div>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Expressions in attributes should maintain the attribute's indentation
    expect(result).toContain('class="user-#{user.id}"');
    expect(result).toContain('data-name="#{user.name}"');
    expect(result).toContain('title="User: #{user.displayName}"');
  });

  test('should handle multi-line expressions preserving line breaks', () => {
    const input = `<div>
    <p>#{
      user.firstName + ' ' + 
      user.lastName
    }</p>
</div>`;
    
    const ast = Parser.parse(input, { indent: 2 });
    const result = formatWithSourceWalking(input, ast, {
      ...formatOptions,
      uri: 'file:///test.nhtml'
    });
    
    // Multi-line expressions should preserve their structure
    expect(result).toContain('    <p>#{');
    expect(result).toContain('user.firstName');
    expect(result).toContain('user.lastName');
    expect(result).toContain('    }</p>');
  });

  describe('With Text Formatter Enabled', () => {
    const textFormatterOptions = {
      indentSize: 2,
      defaultLang: 'html',
      settings: { 
        format: { 
          textFormatter: true, // Enable text formatting with Prettier
          codeFormatter: true,
          keepBlankLines: -1
        } 
      }
    };

    test('should preserve expression indentation even with text formatter', () => {
      const input = `<div>
    <p>Hello #{user.name}!</p>
      <span>Age: #{user.age}</span>
        <small>!{getRole(user.id)}</small>
</div>`;
      
      const ast = Parser.parse(input, { indent: 2 });
      const result = formatWithSourceWalking(input, ast, {
        ...textFormatterOptions,
        uri: 'file:///test.nhtml'
      });
      
      console.log('TEXT FORMATTER INPUT:', JSON.stringify(input));
      console.log('TEXT FORMATTER RESULT:', JSON.stringify(result));
      
      // With text formatter, HTML structure might change, but expressions should stay inline
      expect(result).toContain('#{user.name}');
      expect(result).toContain('#{user.age}');
      expect(result).toContain('!{getRole(user.id)}');
      
      // Expressions should not be moved to separate lines or lose context
      const userNameMatch = result.match(/Hello #{user\.name}!/);
      const userAgeMatch = result.match(/Age: #{user\.age}/);
      expect(userNameMatch).toBeTruthy();
      expect(userAgeMatch).toBeTruthy();
    });

    test('should handle expressions in complex HTML with text formatting', () => {
      const input = `<div class="user-card">
  <h3>#{user.title}</h3>
    <p>Welcome, #{user.firstName} #{user.lastName}!</p>
      <div class="meta">Joined: #{formatDate(user.joinDate)}</div>
</div>`;
      
      const ast = Parser.parse(input, { indent: 2 });
      const result = formatWithSourceWalking(input, ast, {
        ...textFormatterOptions,
        uri: 'file:///test.nhtml'
      });
      
      console.log('COMPLEX TEXT INPUT:', JSON.stringify(input));
      console.log('COMPLEX TEXT RESULT:', JSON.stringify(result));
      
      // All expressions should remain inline with their text content
      expect(result).toContain('#{user.title}');
      expect(result).toContain('#{user.firstName} #{user.lastName}');
      expect(result).toContain('#{formatDate(user.joinDate)}');
      
      // Expressions should not be on separate lines
      expect(result).not.toMatch(/\n\s*#{/); // No expression starting on new line after whitespace
    });
  });
});