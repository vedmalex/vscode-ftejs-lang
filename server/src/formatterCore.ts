export type FormatItem = { type: string; start: string; end: string; content: string };
export type FormatSettings = { format?: { textFormatter?: boolean; codeFormatter?: boolean; keepBlankLines?: number } };

interface TokenGroup {
  directives: any[];
  content: any[];
}

function groupTokensForReordering(tokens: any[]): TokenGroup {
  const directives: any[] = [];
  const content: any[] = [];
  
  for (const token of tokens) {
    if (token.type === 'directive') {
      directives.push(token);
    } else {
      content.push(token);
    }
  }
  
  return { directives, content };
}

function normalizeStructuralTag(token: any): string {
  const rawToken = (token.start || '') + (token.content || '') + (token.end || '');
  
  // Normalize structural tags to remove trimming
  if (token.type === 'blockStart' || token.type === 'slotStart' || token.type === 'blockEnd' || token.type === 'slotEnd') {
    // Handle various patterns:
    // <#- block 'name' : -#> -> <# block 'name' : #>
    // <#- end -#> -> <# end #>
    let normalized = rawToken;
    
    // Fix opening: <#- or <#-anything -> <# 
    normalized = normalized.replace(/^<#-/, '<# ');
    
    // Fix closing: anything-#> -> #>
    normalized = normalized.replace(/-#>$/, ' #>');
    
    // Clean up extra spaces
    normalized = normalized.replace(/\s+/g, ' ').replace(/\s+#>$/, ' #>');
    
    return normalized;
  }
  
  // Handle code tokens that contain structural commands (like <#-block without space)
  if (token.type === 'code') {
    const content = token.content || '';
    const start = token.start || '';
    const end = token.end || '';
    
    // Check if this is a structural command
    if (content.match(/^\s*block\s+/) || content.match(/^\s*slot\s+/) || content.match(/^\s*end\s*$/)) {
      // Normalize trimmed delimiters and spacing
      let normalizedStart = start.replace(/^<#-/, '<# ');
      let normalizedEnd = end.replace(/-#>$/, ' #>');
      
      // Normalize spacing within content (ensure space before colon)
      let normalizedContent = content.replace(/:\s*$/, ' :').replace(/\s+/g, ' ');
      
      return normalizedStart + normalizedContent + normalizedEnd;
    }
  }
  
  return rawToken;
}

function getHtmlPrettierOpts(indentSize: number, prettierConfigCache: Record<string, any>, filePath?: string) {
  try {
    const key = (filePath || 'default') + ':html';
    if (prettierConfigCache[key]) return prettierConfigCache[key];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prettier: any = require('prettier');
    const resolveSync = (prettier as any).resolveConfigSync;
    const cfg = resolveSync && filePath ? resolveSync(filePath) : {};
    const merged = { ...(cfg || {}), parser: 'html', tabWidth: indentSize, htmlWhitespaceSensitivity: 'css' };
    prettierConfigCache[key] = merged;
    return merged;
  } catch {
    return { parser: 'html', tabWidth: indentSize, htmlWhitespaceSensitivity: 'css' } as any;
  }
}

function getJsPrettierOpts(indentSize: number, defaultLang: string, prettierConfigCache: Record<string, any>, filePath?: string) {
  try {
    const key = (filePath || 'default') + ':code:' + defaultLang;
    if (prettierConfigCache[key]) return prettierConfigCache[key];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prettier: any = require('prettier');
    const resolveSync = (prettier as any).resolveConfigSync;
    const cfg = resolveSync && filePath ? resolveSync(filePath) : {};
    const parser = defaultLang === 'typescript' ? 'typescript' : 'babel';
    const merged = { ...(cfg || {}), parser, tabWidth: indentSize };
    prettierConfigCache[key] = merged;
    return merged;
  } catch {
    return { parser: defaultLang === 'typescript' ? 'typescript' : 'babel', tabWidth: indentSize } as any;
  }
}

export function formatWithSourceWalking(
  originalText: string,
  ast: any,
  options: { indentSize: number; defaultLang: string; settings?: FormatSettings; uri?: string; prettierConfigCache?: Record<string, any> }
): string {
  const indentSize = options.indentSize;
  const defaultLang = options.defaultLang;
  const settings = options.settings;
  const filePath = options.uri?.startsWith('file:') ? options.uri.replace(/^file:\/\//, '') : undefined;
  const prettierCache = options.prettierConfigCache || {};

  const tokens: any[] = Array.isArray(ast?.tokens) ? ast.tokens : [];
  if (!tokens.length) return originalText;

  const result: string[] = [];
  let textBuffer = '';

  const flushTextChunk = () => {
    if (!textBuffer) return;
    
    let formattedText = textBuffer;
    try {
      if (settings?.format?.textFormatter) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const prettier: any = require('prettier');
        const opts = getHtmlPrettierOpts(indentSize, prettierCache, filePath);
        formattedText = prettier.format(textBuffer, opts).trim();
      }
    } catch {
      // Keep raw if formatting fails
      formattedText = textBuffer;
    }
    
    // Apply blank line limits if configured
    const keepLimit = settings?.format?.keepBlankLines ?? -1;
    if (keepLimit >= 0) {
      const lines = formattedText.split(/\r?\n/);
      let blank = 0;
      const filteredLines: string[] = [];
      for (const line of lines) {
        if (line.trim().length === 0) {
          blank += 1;
          if (blank <= keepLimit) filteredLines.push(line);
        } else {
          blank = 0;
          filteredLines.push(line);
        }
      }
      formattedText = filteredLines.join('\n');
    }
    
    result.push(formattedText);
    textBuffer = '';
  };

  const formatCodeContent = (start: string, content: string, end: string): string => {
    if (settings?.format?.codeFormatter === false) {
      return start + content + end;
    }
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prettier: any = require('prettier');
      const opts = getJsPrettierOpts(indentSize, defaultLang, prettierCache, filePath);
      const formatted = prettier.format(content, opts).trim();
      return start + formatted + end;
    } catch {
      return start + content + end;
    }
  };

  // Group tokens: directives first, then content
  const { directives, content } = groupTokensForReordering(tokens);
  
  // Process directives first (place at top with no indentation)
  for (let i = 0; i < directives.length; i++) {
    const directive = directives[i];
    const rawToken = (directive.start || '') + (directive.content || '') + (directive.end || '');
    result.push(rawToken);
    // Always add newline after directive except if it's the last one and no content follows
    if (i < directives.length - 1 || content.length > 0) {
      result.push('\n');
    }
  }
  
  // Main algorithm: iterate through content tokens in order
  for (const token of content) {
    const rawToken = (token.start || '') + (token.content || '') + (token.end || '');
    
    switch (token.type) {
      case 'text':
        // Handle text tokens carefully
        if (token.content.trim() === '' && token.eol) {
          // Empty text token with eol = newline only, flush current buffer and add newline
          flushTextChunk();
          result.push('\n');
        } else if (token.content.trim() === '' && !token.eol) {
          // Empty text token without eol = skip (it's just spacing between tokens)
          // Do nothing
        } else {
          // Non-empty text token = accumulate for formatting
          textBuffer += rawToken;
          if (token.eol) textBuffer += '\n';
        }
        break;
        
      case 'expression':
        // Accumulate expressions with text for contextual formatting
        textBuffer += rawToken;
        if (token.eol) textBuffer += '\n';
        break;
        
      case 'code':
        // Flush accumulated text, then check if this is a structural command that needs normalization
        flushTextChunk();
        const content = token.content || '';
        if (content.match(/^\s*block\s+/) || content.match(/^\s*slot\s+/) || content.match(/^\s*end\s*$/)) {
          // This is a structural command, normalize it
          result.push(normalizeStructuralTag(token));
        } else {
          // Regular code, format normally
          const formattedCode = formatCodeContent(token.start || '<#', token.content || '', token.end || '#>');
          result.push(formattedCode);
        }
        if (token.eol) result.push('\n');
        break;
        
      case 'blockStart':
      case 'slotStart':
        // Flush text, then normalize structural tags (remove trimming)
        flushTextChunk();
        result.push(normalizeStructuralTag(token)); // Normalize: <#- block -> <# block
        if (token.eol) result.push('\n');
        break;
        
      case 'blockEnd':
      case 'slotEnd':
        // Flush text, then normalize end tags (remove trimming)
        flushTextChunk();
        result.push(normalizeStructuralTag(token)); // Normalize: <#- end -> <# end
        if (token.eol) result.push('\n');
        break;
        
      default:
        // Flush text, then preserve unknown tokens as-is
        flushTextChunk();
        result.push(rawToken);
        if (token.eol) result.push('\n');
        break;
    }
  }
  
  // Flush any remaining text
  flushTextChunk();
  
  return result.join('');
}

export function formatSegments(
  items: FormatItem[],
  uri: string,
  indentSize: number,
  defaultLang: string,
  settings: FormatSettings | undefined,
  prettierConfigCache: Record<string, any>
): string {
  const filePath = uri.startsWith('file:') ? uri.replace(/^file:\/\//, '') : undefined;
  const keepLimit = settings?.format?.keepBlankLines ?? -1;
  const limitBlankLines = (s: string) => {
    if (keepLimit < 0) return s;
    const lines = s.split(/\r?\n/);
    let blank = 0; const out: string[] = [];
    for (const ln of lines) {
      if (ln.trim().length === 0) { blank += 1; if (blank <= keepLimit) out.push(ln); }
      else { blank = 0; out.push(ln); }
    }
    return out.join('\n');
  };
  const formatJsInside = (start: string, content: string, end: string) => {
    if (settings?.format?.codeFormatter === false) return start + content + end;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prettier: any = require('prettier');
      const opts = getJsPrettierOpts(indentSize, defaultLang, prettierConfigCache, filePath);
      // Only format plain <# ... #> code; expressions are handled as text
      const pretty: string = prettier.format(content, opts);
      return start + pretty.trim() + end;
    } catch {
      return start + content + end;
    }
  };
  let out = '';
  let textBuffer = '';
  const flushText = () => {
    if (!textBuffer) return;
    out += limitBlankLines(textBuffer);
    textBuffer = '';
  };
  for (const it of items as any[]) {
    const t = it as any;
    const raw = (t.start || '') + (t.content || '') + (t.end || '');
    if (t.type === 'text') {
      textBuffer += raw;
      if (t.eol) textBuffer += '\n';
      continue;
    }
    if (t.type === 'expr' || t.type === 'expression' || t.type === 'uexpression') {
      // Treat #{...}/!{...} as part of text; do not invoke Prettier here
      const rawExpr = (t.start || '#{') + (t.content || '') + (t.end || '}');
      textBuffer += rawExpr;
      if (t.eol) textBuffer += '\n';
      continue;
    }
    // non-text token: flush text buffer first
    flushText();
    if (t.type === 'code') {
      // Preserve structural tags and directives exactly; format only plain code tags
      const s = String(t.start || '');
      const isDirective = s.startsWith('<#@');
      const isStructural = /<#-?\s*(block|slot|end)\b/.test(s) || /:\s*-?\s*#>/.test(s);
      if (isDirective || isStructural) {
        out += raw;
      } else {
        out += formatJsInside(t.start || '<#', t.content || '', t.end || '#>');
      }
      if (t.eol) out += '\n';
      continue;
    }
    // any other token types: output raw in order
    out += raw;
    if (t.eol) out += '\n';
  }
  flushText();
  return out;
}


