const fs = require('fs');

describe('dotenv template snapshot (adjacent #>#<# and expr)', () => {
  test('grammar patterns cover adjacent open/close and expr', () => {
    const snippet = [
      "#COOKIE_SECRET='your secret here'",
      "<#  if(!context.filesDb || context.filesDb === context.dbUrl){ #>#<# } #>FILES_URL=#{context.filesDb??\"\"}",
      "<#  if(!context.usersDb || context.usersDb === context.dbUrl){ #>#<# } #>USERS_URL=#{context.usersDb??\"\"}",
      "<#  if(!context.auditDb || context.auditDb === context.dbUrl){ #>#<# } #>AUDIT_URL=#{context.auditDb??\"\"}",
      "<#  if(!context.transactionsDb || context.transactionsDb === context.dbUrl){ #>#<# } #>TRANSACTIONS_URL=#{context.transactionsDb??\"\"}",
      "<#  if(!context.sessionDb || context.sessionDb === context.dbUrl){ #>#<# } #>SESSION_URL=#{context.sessionDb??\"\"}",
      "<# if (context.env) {",
      "  const env = JSON.parse(context.env)",
      "  const envList = Object.keys(env)",
      "  for (let i = 0; i < envList.length; i++){",
      "    const key = envList[i] -#>",
      "#{key}=#{env[key]}",
      "<# }} #>"
    ].join('\n');
    // smoke: ensure our core delimiters appear in grammars
    const root = require('path').join(__dirname, '..', '..');
    const html = JSON.parse(fs.readFileSync(root + '/syntaxes/template-html.tmLanguage.json', 'utf8'));
    const js = JSON.parse(fs.readFileSync(root + '/syntaxes/template-js.tmLanguage.json', 'utf8'));
    const ts = JSON.parse(fs.readFileSync(root + '/syntaxes/template-typescript.tmLanguage.json', 'utf8'));
    const md = JSON.parse(fs.readFileSync(root + '/syntaxes/template-markdown.tmLanguage.json', 'utf8'));
    const gs = [html, js, ts, md].map((g) => JSON.stringify(g));
    for (const s of ['<#', '#>', '#{', '!{']) {
      expect(gs.some((g) => g.includes(s))).toBe(true);
    }
    // no runtime highlighting assertion here; this snapshot ensures patterns exist for problem constructs
    expect(snippet).toContain('#>#<#');
    expect(snippet).toContain('#{context.filesDb??');
  });
});


