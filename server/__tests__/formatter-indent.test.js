const { mockPrettier } = require('./testSetup.js');
mockPrettier();
const { formatSegments } = require('../out/formatterCore.js');

describe('Formatter indentation for template code', () => {
  test('indents template code between block start and end', () => {
    const items = [
      { type: 'code', start: "<# block 'name' : #>", end: '', content: '' },
      { type: 'text', start: '', end: '', content: '\n' },
      { type: 'code', start: '<#', end: '#>', content: ' if(true){console.log(1+2);}' },
      { type: 'text', start: '', end: '', content: '\n' },
      { type: 'code', start: '<# end #>', end: '', content: ''},
    ];
    const out = formatSegments(items, 'file:///a.nhtml', 2, 'html', { format: { codeFormatter: true, textFormatter: false } }, {});
    expect(out).toContain("<# block 'name' : #>");
    expect(out).toContain("<#if(true){console.log(1 + 2);}#>");
    expect(out).toContain("<# end #>");
  });
});


