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
  ParameterInformation
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import * as prettier from 'prettier';
import * as url from 'url';

// dynamic import of parser. Try explicit path, then package resolution
function tryRequire(id: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(id);
  } catch {
    return undefined;
  }
}

function loadParserAuto(parserPath?: string) {
  if (parserPath) {
    const distEntry = path.join(parserPath, 'dist', 'index.js');
    const direct = tryRequire(distEntry) || tryRequire(parserPath);
    if (direct) return direct;
  }
  // try npm package names
  const resolvedDist = tryRequire('fte.js-parser/dist/index.js');
  if (resolvedDist) return resolvedDist;
  const resolvedMain = tryRequire('fte.js-parser');
  if (resolvedMain) return resolvedMain;
  return undefined;
}

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let parser: any | undefined;
let usageDocs: { functions: Record<string, string>; directives: Record<string, string> } = { functions: {}, directives: {} };
let usageWatchers: Array<fs.FSWatcher> = [];
let serverSettings: { format?: { textFormatter?: boolean; keepBlankLines?: number }, docs?: { usagePath?: string } } = { format: { textFormatter: true, keepBlankLines: 1 }, docs: {} };
let workspaceRoots: string[] = [];
const prettierConfigCache: Record<string, any> = {};

// Workspace index (P1)
type FileIndex = {
  uri: string
  path?: string
  blocks: Map<string, { start: number; end: number }>
  slots: Map<string, { start: number; end: number }>
  requireAs: Map<string, string>
}
const fileIndex = new Map<string, FileIndex>();

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
  const rxDecl = /<#-?\s*(block|slot)\s*(["'`])([^"'`]+)\2\s*:\s*-?#>/g;
  let m: RegExpExecArray | null;
  while ((m = rxDecl.exec(text))) {
    const name = m[3];
    const range = { start: m.index, end: m.index + m[0].length };
    if (m[1] === 'block') blocks.set(name, range); else slots.set(name, range);
  }
  const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
  let d: RegExpExecArray | null;
  while ((d = dirRe.exec(text))) {
    const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
    if (params.length >= 2) requireAs.set(params[1], params[0]);
  }
  fileIndex.set(uri, { uri, path: absPath, blocks, slots, requireAs });
}

function posFromOffset(text: string, offset: number): Position {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 10 /*\n*/ ) { line++; col = 0; } else { col++; }
  }
  return Position.create(line, col);
}

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
  const options = (params.initializationOptions || {}) as { parserPath?: string };
  const parserPath = options.parserPath || '';
  parser = loadParserAuto(parserPath);
  if (!parser) {
    connection.console.warn('fte.js parser not found. Set "ftejs.parserPath" or add dependency "fte.js-parser".');
  }
  // load usage docs candidates (workspace USAGE.md and repo USAGE.md)
  const wsFolders = params.workspaceFolders?.map((f) => url.fileURLToPath(f.uri)) || [];
  const candidates: string[] = [
    ...wsFolders.map((f) => path.join(f, 'USAGE.md')),
    path.join(process.cwd(), 'USAGE.md')
  ];
  workspaceRoots = wsFolders;
  // prefer configured docs path if provided later via settings
  loadUsageDocsFrom(candidates);
  watchUsage(candidates);
  // initial index
  indexWorkspace();

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
    },
  };
});

connection.onInitialized(async () => {
  try {
    await connection.client.register(DidChangeConfigurationNotification.type, undefined as any);
  } catch {}
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

const DIRECTIVES = [
  'extend', 'context', 'alias', 'deindent', 'chunks', 'includeMainChunk', 'useHash',
  'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs'
];

function parseContent(text: string) {
  if (!parser?.Parser) return undefined;
  try {
    return parser.Parser.parse(text, { indent: 2 });
  } catch {
    return undefined;
  }
}

function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const diags: Diagnostic[] = [];
  // Try strict parse: if it throws, surface generic diagnostic
  try {
    parseContent(text);
  } catch (e: any) {
    const message = typeof e?.message === 'string' ? e.message : 'Parse error';
    diags.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(Position.create(0, 0), Position.create(0, 1)),
      message,
      source: 'fte.js'
    });
  }
  // Light structural validation: block/slot matching
  const openRe = /<#-?\s*(block|slot)\s+(["'`])([^"'`]+?)\1\s*:\s*-?#>/g;
  const endRe = /<#-?\s*end\s*-?#>/g;
  type StackItem = { name: string; index: number };
  const stack: StackItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text))) {
    stack.push({ name: m[3], index: m.index });
  }
  // Scan ends and pop; if too many ends -> error
  let eMatch: RegExpExecArray | null;
  let lastIdx = 0;
  while ((eMatch = endRe.exec(text))) {
    lastIdx = eMatch.index;
    if (stack.length === 0) {
      const start = doc.positionAt(eMatch.index);
      const end = doc.positionAt(eMatch.index + eMatch[0].length);
      diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: 'Unmatched end', source: 'fte.js' });
    } else {
      stack.pop();
    }
  }
  // Unclosed blocks
  for (const it of stack) {
    const start = doc.positionAt(it.index);
    const end = doc.positionAt(it.index + 1);
    diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: `Unclosed ${it.name}`, source: 'fte.js' });
  }

  // Unknown content('name') references
  try {
    const ast = parseContent(text) as any;
    const known = new Set(Object.keys(ast?.blocks || {}));
    const rx = /content\(\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const name = m[2];
      if (!known.has(name)) {
        const from = doc.positionAt(m.index);
        const to = doc.positionAt(m.index + m[0].length);
        diags.push({ severity: DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Unknown block name: ${name}`, source: 'fte.js' });
      }
    }
  } catch {}

  // Duplicate block/slot declarations
  try {
    const seen: Record<string, number> = {};
    const rxDecl = /<#-?\s*(block|slot)\s*(["'`])([^"'`]+)\2\s*:\s*-?#>/g;
    let d: RegExpExecArray | null;
    while ((d = rxDecl.exec(text))) {
      const name = d[3];
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) {
        const from = doc.positionAt(d.index);
        const to = doc.positionAt(d.index + d[0].length);
        diags.push({ severity: DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Duplicate ${d[1]} declaration: ${name}`, source: 'fte.js' });
      }
    }
  } catch {}

  // Directive validation
  // TODO: cross-file validation (P1): unknown aliases in `partial` or unresolvable paths
  const dirRe = /<#@([\s\S]*?)#>/g;
  let d: RegExpExecArray | null;
  while ((d = dirRe.exec(text))) {
    const content = d[1].trim();
    const startPos = doc.positionAt(d.index);
    const endPos = doc.positionAt(d.index + d[0].length);
    const nameMatch = content.match(/^(\w+)/);
    if (!nameMatch) {
      diags.push({ severity: DiagnosticSeverity.Warning, range: { start: startPos, end: endPos }, message: 'Empty directive', source: 'fte.js' });
      continue;
    }
    const name = nameMatch[1];
    const paramsRaw = content.slice(name.length).trim();
    // extract params inside parentheses if present, otherwise split by spaces/commas
    let params: string[] = [];
    const paren = paramsRaw.match(/^\(([^)]*)\)/);
    if (paren) {
      params = paren[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.replace(/^['"`]|['"`]$/g, ''));
    } else if (paramsRaw.length) {
      params = paramsRaw
        .split(/\s+/)
        .map(s => s.trim().replace(/^['"`]|['"`]$/g, ''))
        .filter(Boolean);
    }
    const range = { start: startPos, end: endPos };
    const requireNoParams = ['includeMainChunk', 'useHash', 'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback'];
    switch (name) {
      case 'extend':
      case 'context':
        if (params.length < 1) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: `Directive ${name} requires 1 parameter`, source: 'fte.js' });
        }
        break;
      case 'alias':
        if (params.length < 1) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: 'Directive alias requires at least 1 parameter', source: 'fte.js' });
        }
        break;
      case 'requireAs':
        if (params.length !== 2) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: 'Directive requireAs requires exactly 2 parameters', source: 'fte.js' });
        }
        break;
      case 'deindent':
        if (params.length > 1) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: 'Directive deindent accepts at most 1 numeric parameter', source: 'fte.js' });
        } else if (params.length === 1 && Number.isNaN(Number(params[0]))) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: 'Directive deindent parameter must be a number', source: 'fte.js' });
        }
        break;
      default:
        if (!DIRECTIVES.includes(name)) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: `Unknown directive: ${name}`, source: 'fte.js' });
        } else if (requireNoParams.includes(name) && params.length > 0) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: `Directive ${name} does not accept parameters`, source: 'fte.js' });
        }
    }
  }
  return diags;
}

function computeOpenBlocks(text: string, upTo?: number) {
  const openRe = /<#(-?)\s*(block|slot)\s+(["'`])([^"'`]+)\3\s*:\s*(-?)#>/g;
  const endRe = /<#-?\s*end\s*-?#>/g;
  const limit = upTo ?? text.length;
  const stack: { trimmedOpen: boolean; trimmedClose: boolean; name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text)) && m.index < limit) {
    stack.push({ trimmedOpen: m[1] === '-', trimmedClose: m[5] === '-', name: m[4], index: m.index });
  }
  let e: RegExpExecArray | null;
  while ((e = endRe.exec(text)) && e.index < limit) {
    if (stack.length) stack.pop();
  }
  return stack;
}

function stripStringsAndComments(line: string): string {
  // remove // comments
  let res = line.replace(/\/\/.*$/, '');
  // remove single/double/backtick quoted strings (no multiline)
  res = res.replace(/'(?:\\.|[^'\\])*'/g, "'");
  res = res.replace(/"(?:\\.|[^"\\])*"/g, '"');
  res = res.replace(/`(?:\\.|[^`\\])*`/g, '`');
  return res;
}

function isTemplateTagLine(line: string): boolean {
  return /<#|#>|\#\{|!\{|<%|%>/.test(line);
}

function computeJsCodeDelta(line: string): { dedentFirst: number; delta: number } {
  const trimmed = line.trimStart();
  // case/default as outdented one level
  let dedentFirst = /^(}|\)|\]|case\b|default\b)/.test(trimmed) ? 1 : 0;
  if (/^default\b/.test(trimmed)) {
    // keep same level for default
    dedentFirst = 1;
  }
  const safe = stripStringsAndComments(line);
  const opens = (safe.match(/[\{\(\[]/g) || []).length;
  const closes = (safe.match(/[\}\)\]]/g) || []).length;
  const delta = opens - closes;
  return { dedentFirst, delta };
}

connection.onCompletion(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const prefix = text.slice(Math.max(0, offset - 50), offset);
  const before = text.slice(0, offset);

  const items: CompletionItem[] = [];

  // directive completion inside <#@ ... #>
  if (/<#@\s+[\w-]*$/.test(prefix)) {
    items.push(
      ...DIRECTIVES.map((d) => ({ label: d, kind: CompletionItemKind.Keyword }))
    );
  }

  // block/slot keywords
  if (/<#-?\s*(block|slot)\s+['"`][^'"`]*$/.test(prefix)) {
    items.push({ label: "end", kind: CompletionItemKind.Keyword });
  }

  // block/slot snippets with auto end
  if (/<#-?\s*$/.test(prefix)) {
    const snippets: CompletionItem[] = [
      {
        label: 'block (with end)',
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "<# block '${1:name}' : #>\n\t$0\n<# end #>"
      },
      {
        label: 'block trimmed (with end)',
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "<#- block '${1:name}' : -#>\n\t$0\n<#- end -#>"
      },
      {
        label: 'slot (with end)',
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "<# slot '${1:name}' : #>\n\t$0\n<# end #>"
      },
      {
        label: 'slot trimmed (with end)',
        kind: CompletionItemKind.Snippet,
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: "<#- slot '${1:name}' : -#>\n\t$0\n<#- end -#>"
      }
    ];
    items.push(...snippets);
  }

  // content()/partial() suggestions inside #{ ... }
  if (/#\{\s*[\w$]*$/.test(prefix)) {
    // suggest function names
    items.push(
      { label: 'content', kind: CompletionItemKind.Function },
      { label: 'partial', kind: CompletionItemKind.Function },
      { label: 'slot', kind: CompletionItemKind.Function },
      { label: 'chunkStart', kind: CompletionItemKind.Function },
      { label: 'chunkEnd', kind: CompletionItemKind.Function }
    );
    // suggest known block/slot names inside string literal argument
    const argPrefix = before.match(/content\(\s*(["'`])([^"'`]*)$/) || before.match(/slot\(\s*(["'`])([^"'`]*)$/);
    if (argPrefix) {
      const ast = parseContent(text) as any;
      const blocks = Object.keys(ast?.blocks || {});
      for (const name of blocks) {
        items.push({ label: name, kind: CompletionItemKind.Text });
      }
    }
  }

  return items;
});

connection.onHover(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  const text = doc.getText();
  const ast = parseContent(text);
  if (!ast) return null;
  const offset = doc.offsetAt(position);

  // naive hover: show node type at position
  const hit = (ast.main as any[]).find((n) => offset >= n.pos && offset <= (n.pos + (n.content?.length || 0)));
  if (hit) {
    // enrich hover for known functions/directives by scanning the token near cursor
    const around = text.slice(Math.max(0, offset - 40), Math.min(text.length, offset + 40));
    const func = around.match(/\b(partial|content|slot|chunkStart|chunkEnd)\b/);
    if (func) {
      const key = func[1];
      const info = usageDocs.functions[key] || usageDocs.functions[key === 'chunkEnd' ? 'chunkStart' : key];
      if (info) return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
    }
    const dir = around.match(/<#@\s*(\w+)/);
    if (dir) {
      const info = usageDocs.directives[dir[1]];
      if (info) return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
    }
    // Show block/slot declaration hover
    if (hit.type === 'blockStart' || hit.type === 'slotStart') {
      return { contents: { kind: 'markdown', value: `Declared ${hit.type === 'blockStart' ? 'block' : 'slot'}` } };
    }
    return { contents: { kind: 'plaintext', value: `fte.js: ${hit.type}` } };
  }
  return null;
});

connection.onDefinition(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  const text = doc.getText();
  const ast = parseContent(text) as any;
  const offset = doc.offsetAt(position);
  // Go to block/slot by content('name')
  const before = text.slice(Math.max(0, offset - 100), offset);
  const m = before.match(/content\(\s*(["'`])([^"'`)\}]*)$/);
  const name = m?.[2];
  if (name && ast?.blocks?.[name]) {
    const first = ast.blocks[name].main?.[0];
    if (first) {
      const loc = Location.create(textDocument.uri, Range.create(doc.positionAt(first.pos), doc.positionAt(first.pos + first.content.length)));
      return loc;
    }
  }
  // Go to partial template by alias or path
  const around = text.slice(Math.max(0, offset - 100), Math.min(text.length, offset + 100));
  const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
  if (mp) {
    const key = mp[2];
    // try resolve alias from requireAs directives in this file
    const aliasMap: Record<string, string> = {};
    const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = dirRe.exec(text))) {
      const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
      if (params.length >= 2) aliasMap[params[1]] = params[0];
    }
    const target = aliasMap[key] || key;
    // search in workspace by path
    for (const root of workspaceRoots) {
      const candidates = [path.join(root, target), path.join(root, 'templates', target)];
      for (const c of candidates) {
        try {
          // probe with known extensions
          const variants = [c, c + '.njs', c + '.nhtml', c + '.nts'];
          for (const v of variants) {
            if (fs.existsSync(v)) {
              const uri = 'file://' + v;
              return Location.create(uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
            }
          }
        } catch {}
      }
    }
  }
  // If on a block/slot declaration name, just return its own location
  const openRe = /<#-?\s*(block|slot)\s+(["'`])([^"'`]+?)\1\s*:\s*-?#>/g;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(text))) {
    const nameStart = match.index + match[0].indexOf(match[3]);
    const nameEnd = nameStart + match[3].length;
    if (offset >= nameStart && offset <= nameEnd) {
      return Location.create(textDocument.uri, Range.create(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length)));
    }
  }
  return null;
});

connection.onReferences(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  // Determine selected block name
  const openRe = /<#-?\s*(block|slot)\s+(["'`])([^"'`]+?)\1\s*:\s*-?#>/g;
  let selected: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(text))) {
    const nameStart = match.index + match[0].indexOf(match[3]);
    const nameEnd = nameStart + match[3].length;
    if (offset >= nameStart && offset <= nameEnd) {
      selected = match[3];
      break;
    }
  }
  if (!selected) return [];
  // Collect all references via content('name') and declaration
  const res: Location[] = [];
  // declaration
  if (match) {
    res.push(Location.create(textDocument.uri, Range.create(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length))));
  }
  // usages
  const usageRe = new RegExp(String.raw`content\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
  let u: RegExpExecArray | null;
  while ((u = usageRe.exec(text))) {
    const start = doc.positionAt(u.index);
    const end = doc.positionAt(u.index + u[0].length);
    res.push(Location.create(textDocument.uri, Range.create(start, end)));
  }
  // cross-file usages
  for (const [uri, info] of fileIndex) {
    if (uri === textDocument.uri) continue;
    const p = info.path ? fs.readFileSync(info.path, 'utf8') : '';
    if (!p) continue;
    let mu: RegExpExecArray | null;
    usageRe.lastIndex = 0;
    while ((mu = usageRe.exec(p))) {
      const start = posFromOffset(p, mu.index);
      const end = posFromOffset(p, mu.index + mu[0].length);
      res.push(Location.create(uri, Range.create(start, end)));
    }
  }
  return res;
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
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const indentSize = options.tabSize || 2;
  const text = doc.getText();
  // Use parser to split into items
  let ast: any;
  try {
    ast = (parser?.Parser ? parser.Parser.parse(text, { indent: indentSize }) : undefined);
  } catch {
    ast = undefined;
  }
  // Fallback to previous simple formatter if parse failed or parser missing
  if (!ast) {
    const lines = text.split(/\r?\n/);
    let level = 0;
    const openTpl = /<#-?\s*(block|slot)\s+(["'`])([^"'`]+?)\1\s*:\s*-?#>/;
    const endTpl = /<#-?\s*end\s*-?#>/;
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
  const defaultLang = ext === 'nhtml' ? 'html' : ext === 'nmd' ? 'markdown' : ext === 'nts' ? 'typescript' : 'babel';
  const getTextLang = () => defaultLang;
  const filePath = textDocument.uri.startsWith('file:') ? url.fileURLToPath(textDocument.uri) : undefined;
  const getPrettierOpts = () => {
    let base: any = { parser: getTextLang(), tabWidth: indentSize };
    if (serverSettings?.format?.textFormatter === false) {
      return null;
    }
    try {
      const key = filePath || 'default';
      if (prettierConfigCache[key]) return { ...prettierConfigCache[key], ...base };
      const anyPrettier: any = prettier as any;
      const resolveSync = anyPrettier.resolveConfigSync;
      const cfg = resolveSync && filePath ? resolveSync(filePath) : null;
      prettierConfigCache[key] = cfg || {};
      return { ...(cfg || {}), ...base };
    } catch {
      return base;
    }
  };
  const limitBlankLines = (s: string) => {
    const limit = serverSettings?.format?.keepBlankLines ?? 1;
    if (limit < 0) return s;
    const lines = s.split(/\r?\n/);
    let blank = 0;
    const out: string[] = [];
    for (const ln of lines) {
      if (ln.trim().length === 0) {
        blank += 1;
        if (blank <= limit) out.push(ln);
      } else {
        blank = 0;
        out.push(ln);
      }
    }
    return out.join('\n');
  };

  // Build from AST with language-aware formatting for text chunks
  const items: any[] = ast.main || [];
  let result: string[] = [];
  let templateIndentLevel = 0;
  const openTpl = /<#-?\s*(block|slot)\s+(["'`])([^"'`]+?)\1\s*:\s*-?#>/;
  const endTpl = /<#-?\s*end\s*-?#>/;
  const appendWithIndent = (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (i < lines.length - 1 || line.length > 0) {
        result.push((templateIndentLevel > 0 ? ' '.repeat(templateIndentLevel * indentSize) : '') + line);
      }
    }
  };
  let textChunk: string[] = [];
  const flushTextChunk = () => {
    if (textChunk.length === 0) return;
    const rawText = textChunk.join('');
    let formatted: string = rawText;
    try {
      const pOpts = getPrettierOpts();
      if (pOpts) {
        const pretty: string = prettier.format(rawText, pOpts) as unknown as string;
        formatted = (pretty || rawText).replace(/[\s\u00A0]+$/,'');
        formatted = limitBlankLines(formatted);
      }
    } catch {
      // fallback
    }
    appendWithIndent(formatted);
    textChunk = [];
  };

  for (const it of items) {
    const seg = it as { type: string; start: string; end: string; content: string };
    if (seg.type === 'text') {
      textChunk.push(seg.content);
      // Lookahead not needed, will flush when non-text encountered
    } else {
      flushTextChunk();
      const raw = (seg.start || '') + (seg.content || '') + (seg.end || '');
      const rtrim = raw.replace(/\s+$/, '');
      const isTplEnd = endTpl.test(rtrim);
      if (isTplEnd) {
        templateIndentLevel = Math.max(0, templateIndentLevel - 1);
      }
      appendWithIndent(raw.trimStart());
      const opensTpl = openTpl.test(rtrim) && !endTpl.test(rtrim);
      if (opensTpl) templateIndentLevel += 1;
    }
  }
  flushTextChunk();
  const finalText = result.join('\n');
  const fullRange = Range.create(Position.create(0,0), doc.positionAt(doc.getText().length));
  return [TextEdit.replace(fullRange, finalText.endsWith('\n') ? finalText : finalText + '\n')];
});

connection.onDocumentOnTypeFormatting(({ ch, options, position, textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const indentSize = options.tabSize || 2;
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  // Only react when '>' or newline typed right after opener
  const before = text.slice(0, offset);
  const lastOpenStack = computeOpenBlocks(text, offset);
  if (lastOpenStack.length === 0) return [];
  const last = lastOpenStack[lastOpenStack.length - 1];
  // If next non-space after cursor is already an end tag - do nothing
  const after = text.slice(offset);
  if (after.match(/^\s*<#-?\s*end\s*-?#>/)) return [];
  // Build end tag based on opener trim markers
  const openTrim = last.trimmedOpen ? '-' : '';
  const closeTrim = last.trimmedClose ? '-' : '';
  const endTag = `<#${openTrim} end ${closeTrim}#>`;
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
  const actions: any[] = [];
  // Quick fix for unmatched end
  const hasUnmatchedEnd = diagnostics.some(d => /Unmatched end/.test(d.message));
  if (hasUnmatchedEnd) {
    actions.push({
      title: 'Remove unmatched end',
      kind: 'quickfix',
      edit: { changes: { [textDocument.uri]: [TextEdit.del(range)] } }
    });
  }
  // Action: Close all open blocks at cursor
  const offset = doc.offsetAt(range.end);
  const stack = computeOpenBlocks(text, offset);
  if (stack.length) {
    const indent = ' '.repeat((range.start.character));
    const tags = stack.map(s => `<#${s.trimmedOpen ? '-' : ''} end ${s.trimmedClose ? '-' : ''}#>`).join(`\n${indent}`);
    actions.push({
      title: 'Close open template blocks here',
      kind: 'quickfix',
      edit: { changes: { [textDocument.uri]: [TextEdit.insert(range.end, `\n${indent}${tags}`)] } }
    });
  }
  return actions;
});

// publish diagnostics on open/change
documents.onDidChangeContent(({ document }) => {
  const diags = computeDiagnostics(document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
  // re-index this document
  try {
    indexText(document.uri, document.getText());
  } catch {}
});
documents.onDidOpen(({ document }) => {
  const diags = computeDiagnostics(document);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
  try { indexText(document.uri, document.getText()); } catch {}
});
connection.onDocumentSymbol(({ textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const ast = parseContent(doc.getText());
  if (!ast) return [];

  // expose blocks and slots as document symbols
  const symbols: any[] = [];
  for (const [name, block] of Object.entries<any>(ast.blocks || {})) {
    const first = block.main[0];
    if (first) {
      symbols.push({
        name: `block ${name}`,
        kind: 12, // SymbolKind.Function
        range: {
          start: doc.positionAt(first.pos),
          end: doc.positionAt(first.pos + first.content.length)
        },
        selectionRange: {
          start: doc.positionAt(first.pos),
          end: doc.positionAt(first.pos + Math.min(20, first.content.length))
        }
      });
    }
  }
  for (const [name, slot] of Object.entries<any>(ast.blocks || {})) {
    const first = slot.main[0];
    if (first) {
      symbols.push({
        name: `slot ${name}`,
        kind: 12,
        range: {
          start: doc.positionAt(first.pos),
          end: doc.positionAt(first.pos + first.content.length)
        },
        selectionRange: {
          start: doc.positionAt(first.pos),
          end: doc.positionAt(first.pos + Math.min(20, first.content.length))
        }
      });
    }
  }
  return symbols;
});

documents.listen(connection);
connection.listen();
