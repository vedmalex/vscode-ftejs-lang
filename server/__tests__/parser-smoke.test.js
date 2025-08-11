const fs = require('fs');

test('USAGE.md exists and has sections', () => {
  const md = fs.readFileSync(require('path').join(__dirname, '..', '..', 'USAGE.md'), 'utf8');
  expect(md).toMatch(/###\s+partial/);
  expect(md).toMatch(/###\s+extend/);
});
