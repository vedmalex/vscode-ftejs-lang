import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Location,
  Range,
  Position,
  TextEdit,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  SemanticTokensLegend,
  SemanticTokens,
  SemanticTokensParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { buildSemanticTokensFromText, semanticTokenTypes, semanticTokenModifiers } from './semanticTokens';
import { computeDiagnostics as computeDiagnosticsExternal } from './diagnostics';
import { getCompletions } from './completion';
import { getDefinition, getReferences, getHover } from './navigation';
import * as fs from 'fs';
import * as path from 'path';
import { formatSegments, formatWithSourceWalking, extractTemplateCodeView, extractInstructionCodeView } from './formatterCore';
import { computeOpenBlocksFromText, buildEndTagFor, walkAstNodes, isTemplateTagLine, computeJsCodeDelta, collectAllASTSegments, getExtendTargetFrom as getExtendTargetFromUtil, extractBlockAndSlotSymbols } from './astUtils';
import { Parser as LocalParser } from './parser';
import * as url from 'url';

// Using embedded parser - no external dependencies (MUST_HAVE.md point 12)
// Parser is directly embedded in the extension for maximum reliability

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Using embedded LocalParser directly - no external fte.js-parser dependency needed
let usageDocs: { functions: Record<string, string>; directives: Record<string, string> } = { functions: {}, directives: {} };
let usageWatchers: Array<fs.FSWatcher> = [];
let serverSettings: { 
  format?: { textFormatter?: boolean; codeFormatter?: boolean; keepBlankLines?: number }, 
  docs?: { usagePath?: string },
  debug?: { enabled?: boolean; logFile?: string },
  linter?: { external?: { enabled?: boolean; command?: string; args?: string[]; timeoutMs?: number } }
} = { format: { textFormatter: true, codeFormatter: true, keepBlankLines: 1 }, docs: {}, debug: { enabled: false }, linter: { external: { enabled: false } } };
let workspaceRoots: string[] = [];
const prettierConfigCache: Record<string, any> = {};

// Enhanced logging system for debugging server crashes and issues
enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN', 
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

function log(level: LogLevel, context: string, message: string, details?: any) {
  try {
    const timestamp = new Date().toISOString();
    const detailsStr = details ? ` | Details: ${JSON.stringify(details, null, 2)}` : '';
    const logMessage = `[${timestamp}] [${level}] ${context}: ${message}${detailsStr}`;
    
    // Always log to console for immediate feedback
    const logFn = level === LogLevel.ERROR ? console.error : 
                  level === LogLevel.WARN ? console.warn : 
                  level === LogLevel.DEBUG ? console.debug : console.log;
    try { logFn(logMessage); } catch {}
    
    // Log to file if debug enabled or for errors (always log errors to file for troubleshooting)
    if (serverSettings?.debug?.enabled || level === LogLevel.ERROR) {
      const target = serverSettings?.debug?.logFile || path.join(process.cwd(), 'ftejs-server.log');
      try { 
        fs.appendFileSync(target, logMessage + '\n', 'utf8'); 
      } catch (fileErr) {
        console.error(`Failed to write to log file: ${fileErr}`);
      }
    }
  } catch (logErr) {
    // Fallback logging if main logger fails
    try { console.error(`Logger error: ${logErr}`); } catch {}
  }
}

function logError(err: unknown, context: string, details?: any) {
  const message = err instanceof Error ? (err.stack || err.message) : String(err);
  log(LogLevel.ERROR, context, message, details);
}

function logWarn(message: string, context: string, details?: any) {
  log(LogLevel.WARN, context, message, details);
}

function logInfo(message: string, context: string, details?: any) {
  log(LogLevel.INFO, context, message, details);
}

function logDebug(message: string, context: string, details?: any) {
  if (serverSettings?.debug?.enabled) {
    log(LogLevel.DEBUG, context, message, details);
  }
}

// Workspace index (P1)
type FileIndex = {
  uri: string
  path?: string
  blocks: Map<string, { start: number; end: number }>
  slots: Map<string, { start: number; end: number }>
  requireAs: Map<string, string>
  // Absolute path of parent template resolved from <#@ extend ... #>, if any
  extendsPath?: string
}
const fileIndex = new Map<string, FileIndex>();
// Reverse index: parent absolute path -> set of child URIs that extend it
const extendsChildren = new Map<string, Set<string>>();

function walkDir(root: string, out: string[] = []) {
  try {
    const list = fs.readdirSync(root, { withFileTypes: true });
    for (const ent of list) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.git')) continue;
      const p = path.join(root, ent.name);
      if (ent.isDirectory()) walkDir(p, out);
      else if (/\.(njs|nhtml|nts|nmd)$/i.test(ent.name)) out.push(p);
    }
  } catch {}
  return out;
}

function indexFile(absPath: string) {
  try {
    const uri = 'file://' + absPath;
    const text = fs.readFileSync(absPath, 'utf8');
    indexText(uri, text, absPath);
  } catch {}
}

function indexWorkspace() {
  for (const root of workspaceRoots) {
    const files = walkDir(root);
    for (const f of files) indexFile(f);
  }
}

function indexText(uri: string, text: string, absPath?: string) {
  const blocks = new Map<string, { start: number; end: number }>();
  const slots = new Map<string, { start: number; end: number }>();
  const requireAs = new Map<string, string>();
  
  // Use AST-based approach for more robust parsing
  const ast = parseContent(text);
  walkAstNodes(ast, (node) => {
    if (node.type === 'blockStart') {
      const name = String(node.name || node.blockName || '');
      if (name) {
        const range = { start: node.pos, end: node.pos + (String(node.start || '').length) };
        blocks.set(name, range);
      }
    } else if (node.type === 'slotStart') {
      const name = String(node.name || node.slotName || '');
      if (name) {
        const range = { start: node.pos, end: node.pos + (String(node.start || '').length) };
        slots.set(name, range);
      }
    }
  });
  // (AST-based parsing eliminates need for regex fallback)
  // Extract requireAs directives from AST
  walkAstNodes(ast, (node) => {
    if (node.type === 'directive' && node.content) {
      const content = String(node.content).trim();
      if (content.startsWith('requireAs')) {
        // Parse requireAs directive content
        const match = content.match(/requireAs\s*\(\s*([^)]*)\s*\)/);
        if (match) {
          const params = match[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
          if (params.length >= 2) requireAs.set(params[1], params[0]);
        }
      }
    }
  });
  // (AST-based parsing eliminates need for regex fallback)
  // remove old reverse index link if present
  const prev = fileIndex.get(uri);
  if (prev?.extendsPath) {
    const set = extendsChildren.get(prev.extendsPath);
    if (set) { set.delete(uri); if (set.size === 0) extendsChildren.delete(prev.extendsPath); }
  }
  // resolve parent template absolute path if present
  let extendsPath: string | undefined;
  try {
    const parentAbs = getExtendTargetFrom(text, uri);
    if (parentAbs) extendsPath = parentAbs;
  } catch (e) { logError(e, 'indexText.getExtendTargetFrom'); }
  fileIndex.set(uri, { uri, path: absPath, blocks, slots, requireAs, extendsPath });
  // update reverse index
  if (extendsPath) {
    const set = extendsChildren.get(extendsPath) || new Set<string>();
    set.add(uri);
    extendsChildren.set(extendsPath, set);
  }
}

// moved to astUtils.ts: posFromOffset

function loadUsageDocsFrom(pathCandidates: string[]) {
  for (const p of pathCandidates) {
    try {
      const md = fs.readFileSync(p, 'utf8');
      const functions: Record<string, string> = {};
      const directives: Record<string, string> = {};
      const lines = md.split(/\r?\n/);
      let current: { type: 'func' | 'dir' | null; key?: string; buf: string[] } = { type: null, buf: [] };
      const flush = () => {
        if (current.type && current.key) {
          const text = current.buf.join('\n').trim();
          if (current.type === 'func') functions[current.key] = text;
          if (current.type === 'dir') directives[current.key] = text;
        }
        current = { type: null, buf: [] };
      };
      for (const line of lines) {
        const mFunc = line.match(/^###\s+([\w]+)\s*\(/);
        const mChunks = line.match(/^###\s+Чанки.*chunkStart\(name\).*chunkEnd\(\)/);
        const mDir = line.match(/^###\s+(\w+)/);
        if (mFunc) {
          flush();
          current.type = 'func';
          current.key = mFunc[1];
          continue;
        }
        if (mChunks) {
          flush();
          current.type = 'func';
          current.key = 'chunkStart';
          current.buf.push('chunkStart(name), chunkEnd()');
          // keep collecting
          continue;
        }
        if (mDir) {
          const key = mDir[1];
          const known = ['extend','context','alias','requireAs','deindent','chunks','includeMainChunk','useHash','noContent','noSlots','noBlocks','noPartial','noOptions','promise','callback'];
          if (known.includes(key)) {
            flush();
            current.type = 'dir';
            current.key = key;
            continue;
          }
        }
        current.buf.push(line);
      }
      flush();
      usageDocs = { functions, directives };
      return;
    } catch {}
  }
}

function watchUsage(candidates: string[]) {
  // clear previous watchers
  for (const w of usageWatchers) {
    try { w.close(); } catch {}
  }
  usageWatchers = [];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const w = fs.watch(p, { persistent: false }, (evt) => {
          if (evt === 'change') {
            loadUsageDocsFrom([p]);
          }
        });
        usageWatchers.push(w);
      }
    } catch {}
  }
}

connection.onInitialize((params: InitializeParams) => {
  try {
    logInfo('Server initializing with embedded parser', 'onInitialize', { 
      workspaceFolders: params.workspaceFolders?.length || 0,
      clientInfo: params.clientInfo 
    });
    
    // Using embedded parser - no external configuration needed
    // load usage docs candidates (workspace USAGE.md and repo USAGE.md)
    const wsFolders = params.workspaceFolders?.map((f) => url.fileURLToPath(f.uri)) || [];
    const candidates: string[] = [
      ...wsFolders.map((f) => path.join(f, 'USAGE.md')),
      path.join(process.cwd(), 'USAGE.md')
    ];
    workspaceRoots = wsFolders;
    
    logDebug('Loading usage docs', 'onInitialize', { candidates });
    // prefer configured docs path if provided later via settings
    loadUsageDocsFrom(candidates);
    watchUsage(candidates);
    
    // initial index
    logDebug('Starting workspace indexing', 'onInitialize', { workspaceRoots });
    indexWorkspace();
    logInfo('Server initialization completed', 'onInitialize');
  } catch (err) {
    logError(err, 'onInitialize', { params: params.workspaceFolders });
    throw err; // Re-throw to signal initialization failure
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: ['{', '<', '@', '\'', '"'] },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentFormattingProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', '"', "'"] },
      documentOnTypeFormattingProvider: { firstTriggerCharacter: '>', moreTriggerCharacter: ['\n'] },
      codeActionProvider: { resolveProvider: false },
      semanticTokensProvider: {
        legend: { tokenTypes: Array.from(semanticTokenTypes), tokenModifiers: Array.from(semanticTokenModifiers) } as SemanticTokensLegend,
        range: false,
        full: true
      },
    },
  };
});

connection.onInitialized(async () => {
  try {
    await connection.client.register(DidChangeConfigurationNotification.type, undefined as any);
  } catch {}
});

// Custom request: provide dual extraction views for a document
connection.onRequest('ftejs/extractViews', (params: { uri: string; hostLanguage?: 'html'|'markdown'|'javascript'|'typescript' }) => {
  try {
    const doc = documents.get(params.uri);
    if (!doc) { return { templateCode: '', instructionCode: '' }; }
    const text = doc.getText();
    const ast = parseContent(text);
    // Derive host language if not provided
    let host: 'html'|'markdown'|'javascript'|'typescript' = 'javascript';
    if (params.hostLanguage) { host = params.hostLanguage; }
    else {
      const ext = (params.uri.split('.').pop() || '').toLowerCase();
      host = ext === 'nhtml' ? 'html' : ext === 'nmd' ? 'markdown' : ext === 'nts' ? 'typescript' : 'javascript';
    }
    const codeView = extractTemplateCodeView(text, ast, { hostLanguage: host });
    const instrView = extractInstructionCodeView(text, ast, { hostLanguage: host, instructionLanguage: host === 'typescript' ? 'typescript' : 'javascript' });
    return { templateCode: codeView.code, instructionCode: instrView.code };
  } catch (e) {
    logError(e, 'extractViews');
    return { templateCode: '', instructionCode: '' };
  }
});

async function refreshSettings() {
  try {
    const cfg: any = await (connection as any).workspace?.getConfiguration?.('ftejs');
    if (cfg) serverSettings = cfg;
    // reload docs from configured path if available
    const usagePath = serverSettings?.docs?.usagePath;
    if (usagePath && fs.existsSync(usagePath)) {
      loadUsageDocsFrom([usagePath]);
      watchUsage([usagePath]);
    }
  } catch {}
}

connection.onDidChangeConfiguration(async () => {
  await refreshSettings();
});

function parseContent(text: string) {
  // Use embedded parser consistently - no external dependencies (MUST_HAVE.md point 12)
  try {
    return LocalParser.parse(text, { indent: 2 });
  } catch (e) {
    logError(e, 'parseContent.embeddedParser', { textLength: text.length });
    return undefined;
  }
}

// Collect all segments from AST in document order for formatting
// moved to astUtils.ts: collectAllASTSegments

// Resolve parent template path from <#@ extend ... #>
function getExtendTargetFrom(text: string, docUri?: string): string | null {
  return getExtendTargetFromUtil(text, docUri, parseContent);
}

function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  return computeDiagnosticsExternal(doc, {
    parseContent,
    getExtendTargetFrom,
    fileIndex,
    workspaceRoots,
    logError: (e, ctx) => logError(e, ctx)
  });
}

function computeOpenBlocks(text: string, upTo?: number) {
  return computeOpenBlocksFromText(text, upTo, parseContent);
}

// moved to astUtils.ts: stripStringsAndComments, isTemplateTagLine, computeJsCodeDelta

connection.onCompletion(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  return getCompletions(doc.getText(), textDocument.uri, position, {
    usageDocs,
    parseContent,
    getExtendTargetFrom,
    fileIndex,
  });
});

connection.onHover(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  return getHover(doc.getText(), position, { usageDocs, parseContent }) as any;
});

connection.onDefinition(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  return getDefinition(doc.getText(), textDocument.uri, position, { parseContent, getExtendTargetFrom, fileIndex, workspaceRoots });
});

connection.onReferences(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  return getReferences(doc.getText(), textDocument.uri, position, { fileIndex });
});

connection.onSignatureHelp(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const before = text.slice(Math.max(0, offset - 60), offset);
  const m = before.match(/<#@\s*(\w+)\s*\([^\)]*$/);
  const name = m?.[1];
  if (!name) return null;
  const sig: SignatureInformation = {
    label: `<#@ ${name}(...) #>`,
    documentation: `fte.js directive ${name}`,
    parameters: [ { label: '...params' } ]
  };
  const help: SignatureHelp = { signatures: [sig], activeSignature: 0, activeParameter: 0 };
  return help;
});

connection.onDocumentFormatting(({ textDocument, options }) => {
  try {
    const doc = documents.get(textDocument.uri);
    if (!doc) {
      logWarn('Document not found for formatting', 'onDocumentFormatting', { uri: textDocument.uri });
      return [];
    }
    
    const indentSize = options.tabSize || 2;
    const text = doc.getText();
    const originalUri = textDocument.uri;
    logDebug('Starting document formatting', 'onDocumentFormatting', { 
      originalUri,
      documentVersion: doc.version,
      textLength: text.length,
      indentSize 
    });
    
    // Use local parser to split into items
    let ast: any;
    try {
      ast = parseContent(text);
      logDebug('AST parsing successful', 'onDocumentFormatting');
    } catch (e) {
      logError(e, 'onDocumentFormatting.parseContent', { 
        uri: textDocument.uri,
        textLength: text.length 
      });
      ast = undefined;
    }
  // Fallback to previous simple formatter if parse failed
  if (!ast) {
    const lines = text.split(/\r?\n/);
    let level = 0;
    const openTpl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/;
    const endTpl = /<#\s*-?\s*end\s*-?\s*#>/;
    const isHtml = textDocument.uri.endsWith('.nhtml');
    const htmlOpen = /<([A-Za-z][^\s>/]*)[^>]*?(?<![\/])>/;
    const htmlClose = /<\/(\w+)[^>]*>/;
    const htmlSelf = /<([A-Za-z][^\s>/]*)([^>]*)\/>/;
    const formattedFallback = lines.map((line) => {
      const rtrim = line.replace(/\s+$/, '');
      const raw = rtrim;
      const isTplEnd = endTpl.test(rtrim);
      const isHtmlClose = isHtml && htmlClose.test(rtrim.trimStart());
      const maybeCode = !isTemplateTagLine(raw);
      let jsDedentFirst = 0;
      let jsDelta = 0;
      if (maybeCode) {
        const d = computeJsCodeDelta(raw);
        jsDedentFirst = d.dedentFirst;
        jsDelta = d.delta;
      }
      if (isTplEnd || isHtmlClose || jsDedentFirst) level = Math.max(0, level - 1);
      const base = rtrim.trimStart();
      const indented = (level > 0 ? ' '.repeat(level * indentSize) : '') + base;
      const opensTpl = openTpl.test(rtrim) && !endTpl.test(rtrim);
      const opensHtml = isHtml && htmlOpen.test(rtrim.trim()) && !htmlSelf.test(rtrim.trim()) && !isHtmlClose && !/^<\//.test(rtrim.trim());
      let delta = 0;
      if (opensTpl || opensHtml) delta += 1;
      if (maybeCode) delta += jsDelta;
      if (delta > 0) level += delta;
      return indented;
    }).join('\n');
    const fullRange = Range.create(Position.create(0,0), doc.positionAt(doc.getText().length));
    return [TextEdit.replace(fullRange, formattedFallback.endsWith('\n') ? formattedFallback : formattedFallback + '\n')];
  }

  const ext = (textDocument.uri.split('.').pop() || '').toLowerCase();
  let defaultLang = ext === 'nhtml' ? 'html' : ext === 'nmd' ? 'markdown' : ext === 'nts' ? 'typescript' : 'babel';
  // Override defaultLang if directive <#@ lang = X #> is present
  try {
    const langDir = /<#@\s*lang\s*=\s*([A-Za-z#]+)\s*#>/i.exec(text);
    if (langDir && langDir[1]) {
      const v = langDir[1].toLowerCase();
      if (v === 'c#' || v === 'csharp') defaultLang = 'csharp';
      else if (v === 'ts' || v === 'typescript') defaultLang = 'typescript';
      else if (v === 'js' || v === 'javascript') defaultLang = 'babel';
      else if (v === 'html') defaultLang = 'html';
      else if (v === 'md' || v === 'markdown') defaultLang = 'markdown';
    }
  } catch {}
  const getTextLang = () => defaultLang;

  // Build result using shared core to make it testable without LSP runtime
  // Prefer flat token list from parser (ast.tokens) when available to preserve exact order
      const items: any[] = (ast as any).tokens && Array.isArray((ast as any).tokens)
      ? (ast as any).tokens
      : collectAllASTSegments(ast);
    // Prefer source-walking formatting
    const finalText = formatWithSourceWalking(text, ast, {
      indentSize,
      defaultLang: getTextLang(),
      settings: serverSettings,
      uri: textDocument.uri,
      prettierConfigCache,
    });
    const original = doc.getText();
    const fullRange = Range.create(Position.create(0,0), doc.positionAt(original.length));
    const needsTerminalNewline = /\n$/.test(original);
    const replaced = needsTerminalNewline ? (finalText.endsWith('\n') ? finalText : finalText + '\n') : finalText.replace(/\n$/, '');
    
    logDebug('Document formatting completed', 'onDocumentFormatting', {
      originalLength: original.length,
      formattedLength: replaced.length,
      hasTerminalNewline: needsTerminalNewline
    });
    // Sanity check: ensure URI did not change during formatting lifecycle
    if (textDocument.uri !== originalUri) {
      logError(new Error('URI changed during formatting'), 'onDocumentFormatting', {
        original: originalUri,
        current: textDocument.uri
      });
    }
    
    return [TextEdit.replace(fullRange, replaced)];
  } catch (err) {
    logError(err, 'onDocumentFormatting.general', { 
      uri: textDocument.uri,
      options 
    });
    // Return empty array to avoid crashing the client
    return [];
  }
});

connection.onDocumentOnTypeFormatting(({ ch, options, position, textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const indentSize = options.tabSize || 2;
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  // Only react when '>' or newline typed right after opener; use token-ordered stack for reliable pairing
  const before = text.slice(0, offset);
  const lastOpenStack = computeOpenBlocks(text, offset);
  if (lastOpenStack.length === 0) return [];
  const last = lastOpenStack[lastOpenStack.length - 1];
  // If next non-space after cursor is already an end tag - do nothing
  const after = text.slice(offset);
  if (after.match(/^\s*<#-?\s*end\s*-?#>/)) return [];
  // Build end tag based on opener trim markers
  const endTag = buildEndTagFor(last);
  const currentLineStart = before.lastIndexOf('\n') + 1;
  const currentLineIndent = before.slice(currentLineStart).match(/^\s*/)?.[0]?.length ?? 0;
  const indent = ' '.repeat(Math.max(0, currentLineIndent));
  const nextIndent = ' '.repeat(Math.max(0, currentLineIndent + indentSize));

  // Insert a newline, keep cursor line, add end on new line below
  // We return edits that re-indent current line (if needed) and append the end tag
  const edits: TextEdit[] = [];
  if (ch === '>') {
    // user just closed opener; insert newline + end below
    edits.push(TextEdit.insert(position, `\n${nextIndent}`));
    const insertPos = { line: position.line + 1, character: 0 };
    edits.push(TextEdit.insert(insertPos, `${indent}${endTag}`));
  } else if (ch === '\n') {
    edits.push(TextEdit.insert(position, `${nextIndent}`));
    const insertPos = position;
    edits.push(TextEdit.insert(insertPos, `\n${indent}${endTag}`));
  }
  return edits;
});

connection.onCodeAction(({ textDocument, range, context }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const diagnostics = context.diagnostics || [];
  const indentSize = context?.only?.length ? 2 : 2; // keep existing behavior
  const { buildCodeActions } = require('./codeActions');
  return buildCodeActions({
    text,
    uri: textDocument.uri,
    range,
    diagnostics,
    doc,
    indentSize,
    parseContent
  });
});

  // publish diagnostics on open/change with counts like typical linters
documents.onDidChangeContent(({ document }) => {
  const diags = computeDiagnostics(document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
  const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error).length;
  const warns = diags.filter(d => d.severity === DiagnosticSeverity.Warning).length;
  const hints = diags.filter(d => d.severity === DiagnosticSeverity.Hint).length;
  logInfo(`Diagnostics updated: ${errors} error(s), ${warns} warning(s), ${hints} hint(s)`, 'diagnostics', { uri: document.uri });
  // re-index this document
  try {
    indexText(document.uri, document.getText());
  } catch {}
});
documents.onDidOpen(({ document }) => {
  const diags = computeDiagnostics(document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
  const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error).length;
  const warns = diags.filter(d => d.severity === DiagnosticSeverity.Warning).length;
  const hints = diags.filter(d => d.severity === DiagnosticSeverity.Hint).length;
  logInfo(`Diagnostics on open: ${errors} error(s), ${warns} warning(s), ${hints} hint(s)`, 'diagnostics', { uri: document.uri });
  try { indexText(document.uri, document.getText()); } catch {}
});
connection.onDocumentSymbol(({ textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const ast = parseContent(doc.getText());
  if (!ast) return [];
  const { blocks, slots } = extractBlockAndSlotSymbols(ast);
  const symbols: any[] = [];
  for (const b of blocks) {
    symbols.push({
      name: `block ${b.name}`,
      kind: 12,
      range: { start: doc.positionAt(b.startPos), end: doc.positionAt(b.endPos) },
      selectionRange: { start: doc.positionAt(b.startPos), end: doc.positionAt(Math.min(b.endPos, b.startPos + 20)) }
    });
  }
  for (const s of slots) {
    symbols.push({
      name: `slot ${s.name}`,
      kind: 12,
      range: { start: doc.positionAt(s.startPos), end: doc.positionAt(s.endPos) },
      selectionRange: { start: doc.positionAt(s.startPos), end: doc.positionAt(Math.min(s.endPos, s.startPos + 20)) }
    });
  }
  return symbols;
});

// Semantic tokens: provide stable highlighting independent of TextMate quirks
connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] } as any;
    const text = doc.getText();
    const built = buildSemanticTokensFromText(text);
    // LSP requires delta-encoded integers: [lineDelta, startCharDelta, length, tokenType, tokenModifiers]
    const legendTypes = Array.from(semanticTokenTypes);
    const legendMods = Array.from(semanticTokenModifiers);
    const data: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    for (const t of built.sort((a,b) => a.line - b.line || a.char - b.char)) {
      const lineDelta = t.line - prevLine;
      const charDelta = lineDelta === 0 ? t.char - prevChar : t.char;
      const tokenType = Math.max(0, legendTypes.indexOf(t.type as any));
      const modMask = (t.modifiers || []).reduce((acc, m) => {
        const idx = legendMods.indexOf(m as any);
        return idx >= 0 ? acc | (1 << idx) : acc;
      }, 0);
      data.push(lineDelta, charDelta, t.length, tokenType, modMask);
      prevLine = t.line;
      prevChar = t.char;
    }
    return { data } as any;
  } catch (e) {
    logError(e, 'semanticTokens.on');
    return { data: [] } as any;
  }
});

documents.listen(connection);
connection.listen();
