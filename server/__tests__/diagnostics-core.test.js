const { computeDiagnosticsFromText } = require('../out/diagnosticsCore.js');

describe('Diagnostics core', () => {
  test('detects unmatched end', () => {
    const txt = "<# end #>";
    const diags = computeDiagnosticsFromText(txt);
    expect(diags.some(d => /Unmatched end/.test(d.message) && d.severity === 'error')).toBe(true);
  });

  test('detects duplicate blocks', () => {
    const txt = "<# block 'a' : #>\n<# end #>\n<# block 'a' : #>\n<# end #>";
    const diags = computeDiagnosticsFromText(txt);
    expect(diags.some(d => /Duplicate block declaration: a/.test(d.message))).toBe(true);
  });

  test('detects blocks with unusual spacing and quotes', () => {
    const txt = '<#  -  block  "test"  :  -  #>\n<#  end  #>\n<#   block  `test`  :   #>\n<#  -  end - #>';
    const diags = computeDiagnosticsFromText(txt);
    expect(diags.some(d => /Duplicate block declaration: test/.test(d.message))).toBe(true);
  });

  test('warns on unknown content name', () => {
    const txt = "#{content('missing')}";
    const diags = computeDiagnosticsFromText(txt);
    expect(diags.some(d => /Unknown block name: missing/.test(d.message))).toBe(true);
  });

  test('warns on unresolved partial', () => {
    const txt = "#{partial(ctx, 'not/exists')}";
    const diags = computeDiagnosticsFromText(txt, ['/tmp']);
    expect(diags.some(d => /Unresolved partial: not\/exists/.test(d.message))).toBe(true);
  });
});


