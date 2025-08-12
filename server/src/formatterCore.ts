export type FormatItem = { type: string; start: string; end: string; content: string };
export type FormatSettings = { format?: { textFormatter?: boolean; codeFormatter?: boolean; keepBlankLines?: number } };

// Note: We intentionally preserve the original token order. No reordering.

type HostLanguage = 'html' | 'markdown' | 'javascript' | 'typescript';

type DualExtractionOptions = {
  hostLanguage?: HostLanguage;
  instructionLanguage?: 'javascript' | 'typescript';
};

function getHostAdapter(host: HostLanguage | undefined) {
  const h = host || 'html';
  if (h === 'html' || h === 'markdown') {
    return { commentStart: '<!--', commentEnd: '-->', stringQuote: '"' };
  }
  // default to JS/TS style comments
  return { commentStart: '/*', commentEnd: '*/', stringQuote: '"' };
}

function escapeForStringLiteral(text: string, quote: string) {
  const q = quote || '"';
  return text
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), `\\${q}`)
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/**
 * Build Template Code View: host-language code where template instructions are masked as comments,
 * and inline expressions (#{...}/!{...}) are replaced with neutral placeholders to keep host formatting stable.
 */
export function extractTemplateCodeView(
  originalText: string,
  ast: any,
  options: DualExtractionOptions = {}
): { code: string } {
  const tokens: any[] = Array.isArray(ast?.tokens) ? ast.tokens : [];
  if (!tokens.length) return { code: originalText };
  const { commentStart, commentEnd } = getHostAdapter(options.hostLanguage || 'html');
  const PLACEHOLDER = '⟦expr⟧';
  const out: string[] = [];
  for (const t of tokens) {
    const raw = (t.start || '') + (t.content || '') + (t.end || '');
    switch (t.type) {
      case 'text': {
        out.push(raw);
        if (t.eol) out.push('\n');
        break;
      }
      case 'expression': {
        out.push(PLACEHOLDER);
        if (t.eol) out.push('\n');
        break;
      }
      case 'directive':
      case 'code':
      case 'blockStart':
      case 'blockEnd':
      case 'slotStart':
      case 'comments': {
        out.push(`${commentStart} ${raw.trim()} ${commentEnd}`);
        if (t.eol) out.push('\n');
        break;
      }
      default: {
        out.push(raw);
        if (t.eol) out.push('\n');
        break;
      }
    }
  }
  return { code: out.join('') };
}

/**
 * Build Instruction Code View: executable instruction stream where text becomes string literals
 * and instruction content remains as code (delimiters removed). This is a linearized form for analysis/preview.
 */
export function extractInstructionCodeView(
  originalText: string,
  ast: any,
  options: DualExtractionOptions = {}
): { code: string } {
  const tokens: any[] = Array.isArray(ast?.tokens) ? ast.tokens : [];
  if (!tokens.length) return { code: '' };
  const quote = getHostAdapter(
    options.hostLanguage === 'typescript' ? 'javascript' : (options.hostLanguage || 'javascript')
  ).stringQuote;
  const out: string[] = [];
  for (const t of tokens) {
    const raw = (t.start || '') + (t.content || '') + (t.end || '');
    if (t.type === 'text') {
      const text = t.content + (t.eol ? '\n' : '');
      out.push(`${quote}${escapeForStringLiteral(text || '', quote)}${quote}`);
      continue;
    }
    if (t.type === 'expression') {
      // keep only inner code for execution
      const inner = String(t.content || '').trim();
      out.push(`(${inner})`);
      continue;
    }
    if (t.type === 'code') {
      const inner = String(t.content || '').trim();
      if (inner) out.push(inner);
      continue;
    }
    if (t.type === 'directive' || t.type === 'blockStart' || t.type === 'blockEnd' || t.type === 'slotStart' || t.type === 'comments') {
      // keep as a comment marker in instruction stream
      out.push(`/* ${raw.trim()} */`);
      continue;
    }
    // fallback: include raw token
    out.push(raw);
  }
  return { code: out.join('\n') };
}

function ensureNewlinePrefix(result: string[], textBuffer: string): boolean {
  // Check if we need to add a newline before structural tags
  if (result.length === 0 && !textBuffer.trim()) return false; // At start of file
  
  // Check if there's content that doesn't end with newline
  if (textBuffer && !textBuffer.endsWith('\n')) {
    return true; // Need newline - there's text buffer content without trailing newline
  }
  
  if (result.length > 0) {
    const lastItem = result[result.length - 1];
    if (!lastItem.endsWith('\n')) {
      return true; // Need newline - last result item doesn't end with newline
    }
  }
  
  return false; // Already on new line or at start
}

function ensureNewlineSuffix(token: any, nextToken?: any): boolean {
  // Block/slot structural tags should have newline after them (be alone on line)
  if (token.type === 'blockStart' || token.type === 'slotStart' || token.type === 'blockEnd' || token.type === 'slotEnd') {
    if (token.eol) return false; // Already has newline
    
    // For block/slot start, only add newline if next token has content that needs separation
    if (token.type === 'blockStart' || token.type === 'slotStart') {
      if (nextToken && nextToken.type === 'text' && nextToken.content?.trim()) {
        return true; // Need newline before content
      }
      return false; // No content immediately following
    }
    
    // For block/slot end, don't add newline if at end of file
    if ((token.type === 'blockEnd' || token.type === 'slotEnd') && !nextToken) {
      return false;
    }
    
    // Add newline after end tag if there's content following
    if (nextToken && nextToken.type === 'text' && nextToken.content?.trim()) {
      return true;
    }
    
    return false; // Don't add unnecessary newlines
  }
  return false;
}

function ensureBlockSeparation(result: string[], textBuffer: string, token: any): boolean {
  // Add blank line before block start for visual separation (except at file start)
  if (token.type === 'blockStart' || token.type === 'slotStart') {
    const hasContent = result.length > 0 || textBuffer.trim().length > 0;
    if (hasContent) {
      // Check current state - do we already have adequate separation?
      let needsSeparation = true;
      
      if (textBuffer.endsWith('\n\n')) {
        needsSeparation = false; // Text buffer already has blank line
      } else if (textBuffer.endsWith('\n')) {
        // Check if previous result has trailing newline too
        if (result.length > 0) {
          const lastItem = result[result.length - 1];
          if (lastItem.endsWith('\n')) {
            needsSeparation = false; // Already have blank line separation
          }
        }
      } else if (result.length > 0) {
        const lastItem = result[result.length - 1];
        if (lastItem.endsWith('\n\n')) {
          needsSeparation = false; // Last result item has blank line
        }
      }
      
      return needsSeparation;
    }
  }
  return false;
}

function ensureBlockEndSeparation(tokens: any[], currentIndex: number): boolean {
  // Only add blank line after block end if there's more content following
  if (currentIndex >= tokens.length - 1) {
    return false; // At end of file, don't add trailing newline
  }
  
  // Check if next token is text with content or another structural element
  const nextToken = tokens[currentIndex + 1];
  if (!nextToken) return false;
  
  // If next token is text and has meaningful content, add separation
  if (nextToken.type === 'text' && nextToken.content?.trim()) {
    return true;
  }
  
  // If next token is another block/slot, add separation
  if (nextToken.type === 'blockStart' || nextToken.type === 'slotStart') {
    return true;
  }
  
  return false;
}

function countTrailingNewlines(result: string[]): number {
  let count = 0;
  for (let i = result.length - 1; i >= 0; i--) {
    const s = result[i];
    for (let j = s.length - 1; j >= 0; j--) {
      if (s[j] === '\n') count++; else return count;
    }
  }
  return count;
}

function trimTrailingNewlines(result: string[], toRemove: number): void {
  let remaining = toRemove;
  for (let i = result.length - 1; i >= 0 && remaining > 0; i--) {
    const s = result[i];
    let cut = 0;
    for (let j = s.length - 1; j >= 0 && remaining > 0; j--) {
      if (s[j] === '\n') { cut++; remaining--; } else { break; }
    }
    if (cut > 0) {
      const kept = s.slice(0, s.length - cut);
      if (kept.length > 0) {
        result[i] = kept;
        break;
      } else {
        result.pop();
      }
    }
  }
}

function setTrailingNewlines(result: string[], desiredCount: number): void {
  const current = countTrailingNewlines(result);
  if (current > desiredCount) {
    trimTrailingNewlines(result, current - desiredCount);
  } else if (current < desiredCount) {
    result.push('\n'.repeat(desiredCount - current));
  }
}

function hasFollowingContent(tokens: any[], fromIndex: number): boolean {
  for (let j = fromIndex + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === 'text') {
      const content = String(t.content || '');
      if (content.trim().length > 0) return true;
      // pure newline? count as no content, continue
      if (!t.eol) continue;
      // empty with eol: skip
      continue;
    }
    // any non-text token counts as following content
    return true;
  }
  return false;
}

function countBlankLinesBefore(tokens: any[], index: number): number {
  let count = 0;
  for (let k = index - 1; k >= 0; k--) {
    const t = tokens[k];
    if (t.type !== 'text') break;
    const content = String(t.content || '');
    if (content.trim().length === 0 && t.eol) {
      count += 1;
      continue;
    }
    // stop on any non-blank text
    break;
  }
  return count;
}

function countBlankLinesAfter(tokens: any[], index: number): number {
  let count = 0;
  for (let k = index + 1; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== 'text') break;
    const content = String(t.content || '');
    if (content.trim().length === 0 && t.eol) {
      count += 1;
      continue;
    }
    // stop on any non-blank text
    break;
  }
  return count;
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
  // Guard: formatter must not perform or be influenced by file operations or URI mutations
  let guardError: Error | undefined;
  try {
    if (options?.uri) {
      const suspicious = /\bcopy\b|\btmp\b/i.test(options.uri);
      if (suspicious) {
        guardError = new Error('Invalid URI detected - possible file operation during formatting');
      }
    }
    // Ensure there is no dynamic import of fs/child_process in call stack
    const stack = new Error().stack || '';
    if (!guardError && (/\brequire\(['"]fs['"]\)/.test(stack) || /\bfrom\s+['"]fs['"]/i.test(stack))) {
      guardError = new Error('Forbidden module fs usage detected during formatting');
    }
    if (!guardError && (/\brequire\(['"]child_process['"]\)/.test(stack) || /\bfrom\s+['"]child_process['"]/i.test(stack))) {
      guardError = new Error('Forbidden module child_process usage detected during formatting');
    }
  } catch {
    // ignore guard evaluation failures; will not set guardError in that case
  }
  if (guardError) { throw guardError; }
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
        
        // Protect expressions before sending to Prettier
        const expressionsByIndex: string[] = [];
        type PlaceholderInfo = { indent: string; isFirstOnLine: boolean };
        const placeholderInfos: PlaceholderInfo[] = [];
        const placeholderBase = '⟨EXPR_PLACEHOLDER_';
        const placeholderClose = '⟩';
        let exprCounter = 0;

        // Replace expressions with indexed placeholders, recording original line indentation
        let protectedText = textBuffer.replace(/(#{[^}]*}|!{[^}]*})/g, (match, _g, offset: number) => {
          const lineStart = textBuffer.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
          const before = textBuffer.slice(lineStart, offset);
          const indentMatch = before.match(/^[ \t]*/);
          const indent = indentMatch ? indentMatch[0] : '';
          const isFirstOnLine = before.trim().length === 0;
          const id = exprCounter++;
          expressionsByIndex[id] = match;
          placeholderInfos[id] = { indent, isFirstOnLine };
          return `${placeholderBase}${id}${placeholderClose}`;
        });
        
        console.log('PROTECTING EXPRESSIONS:');
        console.log('Original textBuffer:', JSON.stringify(textBuffer));
        console.log('Protected text:', JSON.stringify(protectedText));
        console.log('Expressions array (indexed):', expressionsByIndex);
        
        // Format the protected text
        const formatted = prettier.format(protectedText, opts).trim();
        
        console.log('Formatted text:', JSON.stringify(formatted));
        
        // Restore expressions and re-apply original indentation for lines
        // where the expression was the first non-whitespace token on the line.
        const lines = formatted.split(/\r?\n/);
        for (let li = 0; li < lines.length; li++) {
          let line = lines[li];
          // If placeholder starts the content (after whitespace), and it was first on line originally,
          // enforce original indent for that placeholder id.
          const leadingMatch = line.match(/^(\s*)⟨EXPR_PLACEHOLDER_(\d+)⟩/);
          if (leadingMatch) {
            const currentLead = leadingMatch[1];
            const idNum = Number(leadingMatch[2]);
            const info = placeholderInfos[idNum];
            if (info && info.isFirstOnLine) {
              if (currentLead !== info.indent) {
                line = info.indent + line.slice(currentLead.length);
              }
            }
          }
          // Replace all placeholders on this line with their original expressions
          line = line.replace(/⟨EXPR_PLACEHOLDER_(\d+)⟩/g, (_m: string, num: string) => {
            const idNum = Number(num);
            return expressionsByIndex[idNum] || `⟨EXPR_PLACEHOLDER_${num}⟩`;
          });
          lines[li] = line;
        }
        formattedText = lines.join('\n');
        
        console.log('Final result:', JSON.stringify(formattedText));
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

  // Main algorithm: iterate through all tokens in their original order
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const rawToken = (token.start || '') + (token.content || '') + (token.end || '');
    
    switch (token.type) {
      case 'text':
        // Check if this is a pure whitespace token that should be handled structurally
        if (token.content.trim() === '' && token.eol) {
          // This is a pure newline token - we need to decide whether to include it
          // Skip pure newline tokens when they are adjacent to structural tags,
          // as structural tag handlers will manage proper separation
          const prevToken = i > 0 ? tokens[i - 1] : null;
          const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;
          
          const isAfterStructural = prevToken && 
            ['blockStart', 'blockEnd', 'slotStart', 'slotEnd'].includes(prevToken.type);
          const isBeforeStructural = nextToken && 
            ['blockStart', 'blockEnd', 'slotStart', 'slotEnd'].includes(nextToken.type);
          
          if (!isAfterStructural && !isBeforeStructural) {
            // Not adjacent to structural tags - preserve this newline
            flushTextChunk();
            result.push('\n');
          }
          // Skip newlines adjacent to structural tags - let the structural handlers manage spacing
        } else {
          // Regular text content - accumulate into buffer
          textBuffer += rawToken;
          if (token.eol) textBuffer += '\n';
        }
        break;
      
      case 'directive':
        // Directives must start on new line
        flushTextChunk();
        if (ensureNewlinePrefix(result, textBuffer)) {
          result.push('\n');
        }
        result.push(rawToken);
        if (token.eol) result.push('\n');
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
      case 'slotStart': {
        flushTextChunk();
        
        // Idempotent separation logic: check what we actually need
        if (result.length > 0) {
          const currentTrailing = countTrailingNewlines(result);
          const hasContent = result.some(item => item.trim().length > 0);
          
          if (hasContent) {
            // If there's content before this block, ensure exactly one blank line (2 newlines total)
            // But cap it to avoid accumulation
            if (currentTrailing < 2) {
              setTrailingNewlines(result, 2);
            } else if (currentTrailing > 2) {
              setTrailingNewlines(result, 2); // Normalize excessive newlines
            }
            // If exactly 2, leave as is (idempotent)
          }
        }
        
        // Push normalized tag and ensure exactly one newline after it
        result.push(normalizeStructuralTag(token));
        setTrailingNewlines(result, 1);
        break;
      }
        
      case 'blockEnd':
      case 'slotEnd': {
        flushTextChunk();
        
        // Check current state BEFORE making any changes to the result
        const initialTrailing = countTrailingNewlines(result);
        
        // Determine what comes after this end tag first
        let nextStructuralToken = null;
        let hasRealContent = false;
        
        if (hasFollowingContent(tokens, i)) {
          for (let j = i + 1; j < tokens.length; j++) {
            const t = tokens[j];
            if (t.type === 'text') {
              if (t.content?.trim()) {
                hasRealContent = true;
                break; // Found content, no structural token follows
              }
              continue;
            }
            nextStructuralToken = t;
            break;
          }
        }
        
        // Ensure the end tag is placed at the start of a line
        if (result.length > 0) setTrailingNewlines(result, 1);
        result.push(normalizeStructuralTag(token));
        
        // Now apply the appropriate trailing strategy based on what follows
        if (!hasFollowingContent(tokens, i)) {
          // No content following - no trailing newline at EOF
          setTrailingNewlines(result, 0);
        } else if (nextStructuralToken && (nextStructuralToken.type === 'blockStart' || nextStructuralToken.type === 'slotStart')) {
          // Next structural element is another block/slot - blockStart will handle separation
          setTrailingNewlines(result, 1);
        } else if (hasRealContent) {
          // Next is regular content - ensure visual separation
          // Check if separation already exists in original token stream
          let hasExistingSeparation = false;
          let emptyTokenCount = 0;
          
          for (let j = i + 1; j < tokens.length; j++) {
            const t = tokens[j];
            if (t.type === 'text') {
              if (t.content?.trim()) {
                break; // Found content, stop counting
              }
              if (t.eol) {
                emptyTokenCount++;
              }
            } else {
              break; // Found non-text token
            }
          }
          
          // If we already have adequate separation (2+ empty tokens), don't add more
          if (emptyTokenCount >= 2) {
            hasExistingSeparation = true;
          }
          
          if (!hasExistingSeparation) {
            // Add visual separation only if it doesn't already exist
            setTrailingNewlines(result, 2);
          } else {
            // Keep existing separation as is
            setTrailingNewlines(result, 1);
          }
        } else {
          // Only whitespace follows or other non-structural tokens
          setTrailingNewlines(result, 1);
        }
        break;
      }
        
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


