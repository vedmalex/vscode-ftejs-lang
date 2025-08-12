// Shared test setup utilities to eliminate duplication

// Mock prettier setup - used broadly across formatter tests
function mockPrettier() {
  jest.mock('prettier', () => ({
    format: (src) => src
      // emulate typical Prettier spacing around plus operator used in tests
      .replace(/\s*\+\s*/g, ' + ')
      // normalize general whitespace
      .replace(/\s+/g, ' ')
      .trim(),
    resolveConfigSync: () => ({})
  }));
}

// Default format settings - used in 15+ test files
const DEFAULT_FORMAT_SETTINGS = {
  format: { 
    textFormatter: true, 
    codeFormatter: true, 
    keepBlankLines: -1 
  }
};

const DEFAULT_TEST_SETTINGS = {
  format: { 
    textFormatter: false, 
    codeFormatter: true, 
    keepBlankLines: 1 
  }
};

// Shared parse and format helper
function parseAndFormat(Parser, formatFunction, input, options = {}) {
  const defaultOptions = {
    indentSize: 2,
    defaultLang: 'html',
    uri: 'file:///test.nhtml',
    settings: DEFAULT_FORMAT_SETTINGS
  };
  const opts = { ...defaultOptions, ...options };
  const ast = Parser.parse(input, { indent: opts.indentSize });
  return formatFunction(input, ast, opts);
}

module.exports = {
  mockPrettier,
  DEFAULT_FORMAT_SETTINGS,
  DEFAULT_TEST_SETTINGS,
  parseAndFormat,
};