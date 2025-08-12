const { computeOpenBlocksFromAst, buildEndTagFor } = require('../out/astUtils.js');

describe('On-type end tag generation', () => {
  test('builds end tag with correct trim markers from AST', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, start: '<#- block "a" : -#>', end: '-#>', name: 'a' },
      { type: 'slotStart', pos: 10, start: '<# slot "s" : #>', end: '#>', slotName: 's' }
    ];
    const stack = computeOpenBlocksFromAst(nodes, 100);
    const last = stack[stack.length - 1];
    expect(buildEndTagFor(last)).toBe('<# end #>');
  });

  test('works with complex .njs pairing like adjacent tags', () => {
    // Simulate the pattern: <# if(...) { #>#<# } #>
    const nodes = [
      { type: 'code', pos: 0, start: '<#', end: '#>', content: ' if(context.SCREENS > 2) { ' },
      { type: 'code', pos: 32, start: '<#', end: '#>', content: ' } ' }
    ];
    const stack = computeOpenBlocksFromAst(nodes, 100);
    expect(stack).toHaveLength(0); // No unclosed blocks
  });
});


