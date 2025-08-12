describe('Upstream fte.js-parser test suite compatibility', () => {
  const { Parser, SUB } = require('../out/parser.js');

  describe('Basic Template Tags', () => {
    test('parse code tag <%', () => {
      const template = '<% const x = 1; %>';
      const result = Parser.parse(template);
      expect(result).toBeTruthy();
      expect(Array.isArray(result.main)).toBe(true);
      expect(result.main.some(t => t.type === 'code')).toBe(true);
    });

    test('parse escaped output tag <%= and unescaped <%-', () => {
      const r1 = Parser.parse('<%= value %>');
      const r2 = Parser.parse('<%- value %>');
      expect(r1.main.some(t => t.type === 'uexpression' || t.type === 'expression')).toBe(true);
      expect(r2.main.some(t => t.type === 'expression')).toBe(true);
    });

    test('parse comment tag <%#', () => {
      const r = Parser.parse('<%# This is a comment %>');
      expect(r.main.some(t => t.type === 'comments')).toBe(true);
    });
  });

  describe('Special Endings', () => {
    test('trimmed ending -%> and _%>', () => {
      const t1 = '<% if (true) { -%>\nNext';
      const t2 = '<% if (true) { _%>    Next';
      const r1 = Parser.parse(t1);
      const r2 = Parser.parse(t2);
      expect(r1).toBeTruthy();
      expect(r2).toBeTruthy();
    });
  });

  describe('Blocks and Slots', () => {
    test('block and slot definitions', () => {
      const b = Parser.parse('<# block "content": #>\nX\n<# end #>');
      const s = Parser.parse('<# slot "header": #>\nY\n<# end #>');
      expect(b.blocks['content']).toBeDefined();
      expect(s.slots['header']).toBeDefined();
    });
  });

  describe('Directives', () => {
    test('extend and context directives', () => {
      const r1 = Parser.parse('<#@ extend("layout.ftl") #>\nX');
      const r2 = Parser.parse('<#@ context("ctx") #>\nX');
      expect(r1).toBeTruthy();
      expect(r2).toBeTruthy();
    });
  });

  describe('SUB helper', () => {
    test('matches upstream SUB behavior', () => {
      const buf = 'Hello, World!';
      expect(SUB(buf, 'Hello', 0)).toBe('Hello');
      expect(SUB(buf, 'World', 7)).toBe('World');
      expect(SUB('Hello', 'Hello', 6)).toBe('');
      expect(SUB('Hello', 'HelloWorld', 0)).toBe('');
      expect(SUB('', 'test', 0)).toBe('');
      expect(SUB('Hello, 世界!', '世界', 7)).toBe('世界');
    });
  });
});
