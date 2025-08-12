// Mock prettier to avoid module issues in tests
const { mockPrettier } = require('./testSetup.js');
mockPrettier();

const { Parser } = require('../out/parser.js');
const { formatWithSourceWalking } = require('../out/formatterCore.js');

describe('Formatter Dotenv Bug Fix', () => {
  test('should preserve .env file structure and newlines', () => {
    const inputText = `<#@ context 'env' #>
# Database configuration
DB_HOST=#{env.db.host}
DB_PORT=#{env.db.port}
DB_NAME=#{env.db.name}

# API configuration
API_KEY=#{env.api.key}
API_SECRET=#{env.api.secret}

<# if (env.debug) { #>
DEBUG=true
LOG_LEVEL=debug
<# } else { #>
DEBUG=false
LOG_LEVEL=info
<# } #>

# External services
<#- for (const service of env.services) { -#>
#{service.name.toUpperCase()}_URL=#{service.url}
<#- } -#>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const result = formatWithSourceWalking(inputText, ast, {
      indentSize: 2,
      defaultLang: 'html', // Note: treating as text, not shell
      settings: { 
        format: { 
          textFormatter: true,
          codeFormatter: true,
          keepBlankLines: -1
        } 
      },
      uri: 'file:///test.env',
      prettierConfigCache: {}
    });

    // CRITICAL: Must preserve essential structure and content
    
    // Verify comments are preserved
    expect(result).toContain('# Database configuration');
    expect(result).toContain('# API configuration');
    expect(result).toContain('# External services');
    
    // Verify directive is preserved
    expect(result).toContain(`<#@ context 'env' #>`);
    
    // Verify environment variables are preserved
    expect(result).toContain('DB_HOST=#{env.db.host}');
    expect(result).toContain('DB_PORT=#{env.db.port}');
    expect(result).toContain('DB_NAME=#{env.db.name}');
    expect(result).toContain('API_KEY=#{env.api.key}');
    expect(result).toContain('API_SECRET=#{env.api.secret}');
    
    // Verify template logic is preserved (note: exact spacing may vary)
    expect(result).toContain('if (env.debug)');
    expect(result).toContain('} else {');
    expect(result).toContain('for (const service of env.services)');
    expect(result).toContain('<#'); // Check for blocks
    expect(result).toContain('#>'); // Check for blocks
    expect(result).toContain('<#-'); // Check for trimmed blocks
    expect(result).toContain('-#>'); // Check for trimmed blocks
    
    // Verify conditional content is preserved
    expect(result).toContain('DEBUG=true');
    expect(result).toContain('DEBUG=false');
    expect(result).toContain('LOG_LEVEL=debug');
    expect(result).toContain('LOG_LEVEL=info');
    
    // Verify expressions are preserved
    expect(result).toContain('#{service.name.toUpperCase()}_URL=#{service.url}');
    
    // Ensure content is not lost or corrupted
    expect(result.length).toBeGreaterThan(300);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    
    // Verify result has multiple lines (not collapsed)
    const resultLines = result.split('\n').length;
    expect(resultLines).toBeGreaterThanOrEqual(15);
  });

  test('should handle simple .env template without corruption', () => {
    const inputText = `NODE_ENV=#{process.env.NODE_ENV}
PORT=#{config.port}
SECRET=#{generateSecret()}`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const result = formatWithSourceWalking(inputText, ast, {
      indentSize: 2,
      defaultLang: 'html',
      settings: { 
        format: { 
          textFormatter: true,
          codeFormatter: true,
          keepBlankLines: -1
        } 
      },
      uri: 'file:///test.env',
      prettierConfigCache: {}
    });

    // CRITICAL: Simple env files must be preserved
    
    // Verify each line is preserved
    expect(result).toContain('NODE_ENV=#{process.env.NODE_ENV}');
    expect(result).toContain('PORT=#{config.port}');
    expect(result).toContain('SECRET=#{generateSecret()}');
    
    // Verify content integrity
    expect(result.length).toBeGreaterThan(50);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  test('should preserve dotenv format with conditional blocks', () => {
    const inputText = `<#@ context 'config' #>
<# if (config.database) { #>
DATABASE_URL=#{config.database.url}
<# } #>
<# if (config.redis) { #>
REDIS_URL=#{config.redis.url}
<# } #>`;

    const ast = Parser.parse(inputText, { indent: 2 });
    const result = formatWithSourceWalking(inputText, ast, {
      indentSize: 2,
      defaultLang: 'html',
      settings: { 
        format: { 
          textFormatter: true,
          codeFormatter: true,
          keepBlankLines: -1
        } 
      },
      uri: 'file:///test.env',
      prettierConfigCache: {}
    });

    // Verify directive is preserved
    expect(result).toContain(`<#@ context 'config' #>`);
    
    // Verify conditional blocks are preserved (note: exact spacing may vary)
    expect(result).toContain('if (config.database)');
    expect(result).toContain('if (config.redis)');
    expect(result).toContain('<#'); // Check for blocks
    expect(result).toContain('#>'); // Check for blocks
    
    // Verify environment variables are preserved
    expect(result).toContain('DATABASE_URL=#{config.database.url}');
    expect(result).toContain('REDIS_URL=#{config.redis.url}');
    
    // Verify result integrity
    expect(result.length).toBeGreaterThan(80);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });
});