const { Parser } = require('./server/out/parser.js');

const input = `<p>Welcome, #{user.firstName} #{user.lastName}!</p>`;
const ast = Parser.parse(input, { indent: 2 });

console.log('INPUT:', JSON.stringify(input));
console.log('\nTOKENS:');
ast.tokens.forEach((token, i) => {
  console.log(`${i}: ${token.type} = ${JSON.stringify(token.content)} (start: ${JSON.stringify(token.start)}, end: ${JSON.stringify(token.end)}, eol: ${token.eol})`);
});