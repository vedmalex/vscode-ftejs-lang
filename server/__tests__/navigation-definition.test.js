const { Parser } = require('../out/parser.js');

describe('Navigation Definition Fix', () => {
  
  function mockDoc(text) {
    return {
      getText: () => text,
      offsetAt: (position) => {
        const lines = text.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line; i++) {
          offset += lines[i].length + 1; // +1 for newline
        }
        return offset + position.character;
      },
      positionAt: (offset) => {
        const lines = text.split('\n');
        let currentOffset = 0;
        for (let line = 0; line < lines.length; line++) {
          if (currentOffset + lines[line].length >= offset) {
            return { line, character: offset - currentOffset };
          }
          currentOffset += lines[line].length + 1; // +1 for newline
        }
        return { line: lines.length - 1, character: lines[lines.length - 1].length };
      }
    };
  }

  // This will be the extracted clean function that we'll create
  function resolveDefinition(doc, text, offset, ast) {
    // We'll implement this function by extracting logic from server.ts
    const winStart = Math.max(0, offset - 200);
    const winEnd = Math.min(text.length, offset + 200);
    const around = text.slice(winStart, winEnd);
    
    // Check if cursor is on block name inside content('block_name') string literal
    // Use global search to find all matches and pick the right one based on cursor position
    const contentRegex = /content\(\s*(["'`])([^"'`]+)\1/g;
    let match;
    
    while ((match = contentRegex.exec(around)) !== null) {
      const blockName = match[2];
      const contentStart = match.index;
      const quoteStart = winStart + contentStart + match[0].indexOf(match[1]) + 1;
      const quoteEnd = quoteStart + blockName.length;
      
      // Check if our offset falls within this match's quote range
      if (offset >= quoteStart && offset <= quoteEnd) {
        // Use AST-based search instead of RegExp
        if (ast?.blocks?.[blockName]) {
          const block = ast.blocks[blockName];
          if (block.declPos !== undefined) {
            const position = doc.positionAt(block.declPos);
            return {
              uri: 'file:///test.nhtml',
              range: {
                start: position,
                end: { line: position.line, character: position.character + 10 }
              }
            };
          }
        }
        break;
      }
    }
    return null;
  }

  test('should navigate to correct block by name (not always first)', () => {
    const inputText = `<# block 'header' : #>
  <h1>Header</h1>
<# end #>
<# block 'content' : #>
  <p>Content</p>
<# end #>
<# block 'footer' : #>
  <p>Footer</p>
<# end #>

<div>
  #{content('header')}
  #{content('content')}
  #{content('footer')}
</div>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const doc = mockDoc(inputText);
    
    // Test navigation to 'content' block (second block)
    const contentCallPos = inputText.indexOf("content('content')") + "content('".length;
    const result = resolveDefinition(doc, inputText, contentCallPos, ast);
    
    expect(result).not.toBeNull();
    
    // Should point to the 'content' block declaration, not 'header'
    const contentBlockPos = inputText.indexOf("<# block 'content' : #>");
    const expectedPosition = doc.positionAt(contentBlockPos);
    expect(result.range.start.line).toBe(expectedPosition.line);
    
    // Verify it's NOT pointing to the first block ('header')
    const headerBlockPos = inputText.indexOf("<# block 'header' : #>");
    const headerPosition = doc.positionAt(headerBlockPos);
    expect(result.range.start.line).not.toBe(headerPosition.line);
  });

  test('should navigate to footer block (third block)', () => {
    const inputText = `<# block 'header' : #>
  <h1>Header</h1>
<# end #>
<# block 'content' : #>
  <p>Content</p>
<# end #>
<# block 'footer' : #>
  <p>Footer</p>
<# end #>

<div>
  #{content('footer')}
</div>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const doc = mockDoc(inputText);
    
    // Test navigation to 'footer' block (third block)
    const footerCallPos = inputText.indexOf("content('footer')") + "content('".length;
    const result = resolveDefinition(doc, inputText, footerCallPos, ast);
    
    expect(result).not.toBeNull();
    
    // Should point to the 'footer' block declaration
    const footerBlockPos = inputText.indexOf("<# block 'footer' : #>");
    const expectedPosition = doc.positionAt(footerBlockPos);
    expect(result.range.start.line).toBe(expectedPosition.line);
    
    // Verify it's NOT pointing to the first block ('header')
    const headerBlockPos = inputText.indexOf("<# block 'header' : #>");
    const headerPosition = doc.positionAt(headerBlockPos);
    expect(result.range.start.line).not.toBe(headerPosition.line);
  });

  test('should not navigate from content() without block name', () => {
    const inputText = `<# block 'header' : #>
  <h1>Header</h1>
<# end #>

<div>
  #{content()}
</div>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const doc = mockDoc(inputText);
    
    // Test that navigation from content() (without name) doesn't work
    const contentCallPos = inputText.indexOf("content()") + "content".length;
    const result = resolveDefinition(doc, inputText, contentCallPos, ast);
    
    expect(result).toBeNull();
  });
});