const { computePairsFromAst, computeOpenBlocksFromAst } = require('../out/astUtils.js');

describe('Complex Block Pairing', () => {
  test('handles adjacent closing/opening tokens #>#<#', () => {
    // Simulate AST nodes for: <# if (cond) { #>#<# } #>
    const nodes = [
      { type: 'code', pos: 0, start: '<#', end: '#>' },
      { type: 'code', pos: 20, start: '<#', end: '#>' },
    ];

    const pairs = computePairsFromAst(nodes);
    expect(pairs).toHaveLength(0); // These are just code blocks, not block/slot pairs
  });

  test('correctly pairs nested blocks', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, name: 'outer', start: '<#', end: '#>' },
      { type: 'blockStart', pos: 30, name: 'inner', start: '<#-', end: '-#>' },
      { type: 'end', pos: 60, start: '<#-', end: '-#>' },
      { type: 'end', pos: 80, start: '<#', end: '#>' },
    ];

    const pairs = computePairsFromAst(nodes);
    expect(pairs).toHaveLength(2);
    
    // Inner block pair
    expect(pairs[0].open.name).toBe('inner');
    expect(pairs[0].close).toBeDefined();
    
    // Outer block pair
    expect(pairs[1].open.name).toBe('outer');
    expect(pairs[1].close).toBeDefined();
  });

  test('handles unmatched blocks correctly', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, name: 'unclosed', start: '<#', end: '#>' },
      { type: 'blockStart', pos: 30, name: 'another', start: '<#', end: '#>' },
      { type: 'end', pos: 60, start: '<#', end: '#>' }, // Only closes 'another'
    ];

    const pairs = computePairsFromAst(nodes);
    expect(pairs).toHaveLength(2);
    
    // 'another' is properly closed
    expect(pairs[0].open.name).toBe('another');
    expect(pairs[0].close).toBeDefined();
    
    // 'unclosed' remains without close
    expect(pairs[1].open.name).toBe('unclosed');
    expect(pairs[1].close).toBeUndefined();
  });

  test('computeOpenBlocksFromAst works with position limits', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, name: 'first', start: '<#', end: '#>' },
      { type: 'blockStart', pos: 30, name: 'second', start: '<#-', end: '-#>' },
      { type: 'end', pos: 60, start: '<#', end: '#>' },
      { type: 'blockStart', pos: 80, name: 'third', start: '<#', end: '#>' },
    ];

    // Limit to position 50 - should only see 'first' and 'second' open
    const openBlocks = computeOpenBlocksFromAst(nodes, 50);
    expect(openBlocks).toHaveLength(2);
    expect(openBlocks[0].name).toBe('first');
    expect(openBlocks[1].name).toBe('second');
    expect(openBlocks[1].trimmedOpen).toBe(true);
    expect(openBlocks[1].trimmedClose).toBe(true);
  });

  test('correctly identifies trim markers from AST', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, name: 'trimmed', start: '<#-', end: '-#>' },
      { type: 'blockStart', pos: 30, name: 'regular', start: '<#', end: '#>' },
    ];

    const openBlocks = computeOpenBlocksFromAst(nodes);
    expect(openBlocks).toHaveLength(2);
    
    expect(openBlocks[0].trimmedOpen).toBe(true);
    expect(openBlocks[0].trimmedClose).toBe(true);
    
    expect(openBlocks[1].trimmedOpen).toBe(false);
    expect(openBlocks[1].trimmedClose).toBe(false);
  });

  test('handles mixed block and slot types', () => {
    const nodes = [
      { type: 'blockStart', pos: 0, name: 'header', start: '<#', end: '#>' },
      { type: 'slotStart', pos: 30, name: 'content', start: '<#', end: '#>' },
      { type: 'end', pos: 60, start: '<#', end: '#>' }, // closes slot
      { type: 'end', pos: 80, start: '<#', end: '#>' }, // closes block
    ];

    const pairs = computePairsFromAst(nodes);
    expect(pairs).toHaveLength(2);
    
    // Both should be properly paired
    expect(pairs[0].open.name).toBe('content');
    expect(pairs[0].close).toBeDefined();
    expect(pairs[1].open.name).toBe('header');
    expect(pairs[1].close).toBeDefined();
  });
});
