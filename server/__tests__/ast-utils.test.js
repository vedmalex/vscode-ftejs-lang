const { computeOpenBlocksFromAst, buildEndTagFor } = require('../out/astUtils.js');

describe('AST utilities', () => {
  test('computeOpenBlocksFromAst respects trim markers and names', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, start: '<#- block \"a\" : -#>', end: '-#>', name: 'a' },
      { type: 'text', pos: 10, start: '', end: '', content: 'x' },
      { type: 'slotStart', pos: 11, start: '<# slot \"s\" : #>', end: '#>', slotName: 's' },
    ];
    const stack = computeOpenBlocksFromAst(nodes, 100);
    expect(stack).toHaveLength(2);
    expect(stack[0]).toMatchObject({ name: 'a', trimmedOpen: true, trimmedClose: true });
    expect(stack[1]).toMatchObject({ name: 's', trimmedOpen: false, trimmedClose: false });
    expect(buildEndTagFor(stack[0])).toBe('<#- end -#>');
    expect(buildEndTagFor(stack[1])).toBe('<# end #>');
  });

  test('handles adjacent closing/opening tags #>#<#', () => {
    const nodes = [
      { type: 'code', pos: 0, start: '<#', end: '#>', content: 'if(true)' },
      { type: 'code', pos: 15, start: '<#', end: '#>', content: '}' },
    ];
    const stack = computeOpenBlocksFromAst(nodes, 100);
    expect(stack).toHaveLength(0); // No blocks open, just code
  });
});


