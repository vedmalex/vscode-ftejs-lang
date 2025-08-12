"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const formatterCore_1 = require("./formatterCore");
const astUtils_1 = require("./astUtils");
const parser_1 = require("./parser");
const url = __importStar(require("url"));
// Using embedded parser - no external dependencies (MUST_HAVE.md point 12)
// Parser is directly embedded in the extension for maximum reliability
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Using embedded LocalParser directly - no external fte.js-parser dependency needed
let usageDocs = { functions: {}, directives: {} };
let usageWatchers = [];
let serverSettings = { format: { textFormatter: true, codeFormatter: true, keepBlankLines: 1 }, docs: {}, debug: { enabled: false }, linter: { external: { enabled: false } } };
let workspaceRoots = [];
const prettierConfigCache = {};
// Enhanced logging system for debugging server crashes and issues
var LogLevel;
(function (LogLevel) {
    LogLevel["ERROR"] = "ERROR";
    LogLevel["WARN"] = "WARN";
    LogLevel["INFO"] = "INFO";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (LogLevel = {}));
function log(level, context, message, details) {
    try {
        const timestamp = new Date().toISOString();
        const detailsStr = details ? ` | Details: ${JSON.stringify(details, null, 2)}` : '';
        const logMessage = `[${timestamp}] [${level}] ${context}: ${message}${detailsStr}`;
        // Always log to console for immediate feedback
        const logFn = level === LogLevel.ERROR ? console.error :
            level === LogLevel.WARN ? console.warn :
                level === LogLevel.DEBUG ? console.debug : console.log;
        try {
            logFn(logMessage);
        }
        catch { }
        // Log to file if debug enabled or for errors (always log errors to file for troubleshooting)
        if (serverSettings?.debug?.enabled || level === LogLevel.ERROR) {
            const target = serverSettings?.debug?.logFile || path.join(process.cwd(), 'ftejs-server.log');
            try {
                fs.appendFileSync(target, logMessage + '\n', 'utf8');
            }
            catch (fileErr) {
                console.error(`Failed to write to log file: ${fileErr}`);
            }
        }
    }
    catch (logErr) {
        // Fallback logging if main logger fails
        try {
            console.error(`Logger error: ${logErr}`);
        }
        catch { }
    }
}
function logError(err, context, details) {
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    log(LogLevel.ERROR, context, message, details);
}
function logWarn(message, context, details) {
    log(LogLevel.WARN, context, message, details);
}
function logInfo(message, context, details) {
    log(LogLevel.INFO, context, message, details);
}
function logDebug(message, context, details) {
    if (serverSettings?.debug?.enabled) {
        log(LogLevel.DEBUG, context, message, details);
    }
}
const fileIndex = new Map();
// Reverse index: parent absolute path -> set of child URIs that extend it
const extendsChildren = new Map();
function walkDir(root, out = []) {
    try {
        const list = fs.readdirSync(root, { withFileTypes: true });
        for (const ent of list) {
            if (ent.name === 'node_modules' || ent.name.startsWith('.git'))
                continue;
            const p = path.join(root, ent.name);
            if (ent.isDirectory())
                walkDir(p, out);
            else if (/\.(njs|nhtml|nts|nmd)$/i.test(ent.name))
                out.push(p);
        }
    }
    catch { }
    return out;
}
function indexFile(absPath) {
    try {
        const uri = 'file://' + absPath;
        const text = fs.readFileSync(absPath, 'utf8');
        indexText(uri, text, absPath);
    }
    catch { }
}
function indexWorkspace() {
    for (const root of workspaceRoots) {
        const files = walkDir(root);
        for (const f of files)
            indexFile(f);
    }
}
function indexText(uri, text, absPath) {
    const blocks = new Map();
    const slots = new Map();
    const requireAs = new Map();
    // Use AST-based approach for more robust parsing
    const ast = parseContent(text);
    if (ast && Array.isArray(ast.main)) {
        for (const node of ast.main) {
            if (node.type === 'blockStart') {
                const name = String(node.name || node.blockName || '');
                if (name) {
                    const range = { start: node.pos, end: node.pos + (String(node.start || '').length) };
                    blocks.set(name, range);
                }
            }
            else if (node.type === 'slotStart') {
                const name = String(node.name || node.slotName || '');
                if (name) {
                    const range = { start: node.pos, end: node.pos + (String(node.start || '').length) };
                    slots.set(name, range);
                }
            }
        }
    }
    else {
        // Fallback to regex if AST parsing fails
        const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
        let m;
        while ((m = rxDecl.exec(text))) {
            const name = m[3];
            const range = { start: m.index, end: m.index + m[0].length };
            if (m[1] === 'block')
                blocks.set(name, range);
            else
                slots.set(name, range);
        }
    }
    // Extract requireAs directives from AST or fallback to regex
    if (ast && Array.isArray(ast.main)) {
        for (const node of ast.main) {
            if (node.type === 'directive' && node.content) {
                const content = String(node.content).trim();
                if (content.startsWith('requireAs')) {
                    // Parse requireAs directive content
                    const match = content.match(/requireAs\s*\(\s*([^)]*)\s*\)/);
                    if (match) {
                        const params = match[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
                        if (params.length >= 2)
                            requireAs.set(params[1], params[0]);
                    }
                }
            }
        }
    }
    else {
        // Fallback to regex
        const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
        let d;
        while ((d = dirRe.exec(text))) {
            const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
            if (params.length >= 2)
                requireAs.set(params[1], params[0]);
        }
    }
    // remove old reverse index link if present
    const prev = fileIndex.get(uri);
    if (prev?.extendsPath) {
        const set = extendsChildren.get(prev.extendsPath);
        if (set) {
            set.delete(uri);
            if (set.size === 0)
                extendsChildren.delete(prev.extendsPath);
        }
    }
    // resolve parent template absolute path if present
    let extendsPath;
    try {
        const parentAbs = getExtendTargetFrom(text, uri);
        if (parentAbs)
            extendsPath = parentAbs;
    }
    catch (e) {
        logError(e, 'indexText.getExtendTargetFrom');
    }
    fileIndex.set(uri, { uri, path: absPath, blocks, slots, requireAs, extendsPath });
    // update reverse index
    if (extendsPath) {
        const set = extendsChildren.get(extendsPath) || new Set();
        set.add(uri);
        extendsChildren.set(extendsPath, set);
    }
}
function posFromOffset(text, offset) {
    let line = 0;
    let col = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 10 /*\n*/) {
            line++;
            col = 0;
        }
        else {
            col++;
        }
    }
    return node_1.Position.create(line, col);
}
function loadUsageDocsFrom(pathCandidates) {
    for (const p of pathCandidates) {
        try {
            const md = fs.readFileSync(p, 'utf8');
            const functions = {};
            const directives = {};
            const lines = md.split(/\r?\n/);
            let current = { type: null, buf: [] };
            const flush = () => {
                if (current.type && current.key) {
                    const text = current.buf.join('\n').trim();
                    if (current.type === 'func')
                        functions[current.key] = text;
                    if (current.type === 'dir')
                        directives[current.key] = text;
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
                    const known = ['extend', 'context', 'alias', 'requireAs', 'deindent', 'chunks', 'includeMainChunk', 'useHash', 'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback'];
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
        }
        catch { }
    }
}
function watchUsage(candidates) {
    // clear previous watchers
    for (const w of usageWatchers) {
        try {
            w.close();
        }
        catch { }
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
        }
        catch { }
    }
}
connection.onInitialize((params) => {
    try {
        logInfo('Server initializing with embedded parser', 'onInitialize', {
            workspaceFolders: params.workspaceFolders?.length || 0,
            clientInfo: params.clientInfo
        });
        // Using embedded parser - no external configuration needed
        // load usage docs candidates (workspace USAGE.md and repo USAGE.md)
        const wsFolders = params.workspaceFolders?.map((f) => url.fileURLToPath(f.uri)) || [];
        const candidates = [
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
    }
    catch (err) {
        logError(err, 'onInitialize', { params: params.workspaceFolders });
        throw err; // Re-throw to signal initialization failure
    }
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
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
        await connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    catch { }
});
async function refreshSettings() {
    try {
        const cfg = await connection.workspace?.getConfiguration?.('ftejs');
        if (cfg)
            serverSettings = cfg;
        // reload docs from configured path if available
        const usagePath = serverSettings?.docs?.usagePath;
        if (usagePath && fs.existsSync(usagePath)) {
            loadUsageDocsFrom([usagePath]);
            watchUsage([usagePath]);
        }
    }
    catch { }
}
connection.onDidChangeConfiguration(async () => {
    await refreshSettings();
});
const DIRECTIVES = [
    'extend', 'context', 'alias', 'deindent', 'chunks', 'includeMainChunk', 'useHash',
    'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs', 'lang'
];
function parseContent(text) {
    // Use embedded parser consistently - no external dependencies (MUST_HAVE.md point 12)
    try {
        return parser_1.Parser.parse(text, { indent: 2 });
    }
    catch (e) {
        logError(e, 'parseContent.embeddedParser', { textLength: text.length });
        return undefined;
    }
}
// Collect all segments from AST in document order for formatting
function collectAllASTSegments(ast) {
    if (!ast)
        return [];
    const allSegments = [];
    // First, collect all segments with their positions
    const segmentsByPos = [];
    // Add main segments
    for (const item of ast.main || []) {
        segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'main' });
    }
    // Add block segments - need to reconstruct opening/closing tags
    for (const [blockName, block] of Object.entries(ast.blocks || {})) {
        const blockContent = block.main || [];
        if (blockContent.length > 0) {
            const firstItem = blockContent[0];
            const lastItem = blockContent[blockContent.length - 1];
            // Calculate block start position (before first content)
            const blockStartPos = Math.max(0, (firstItem.pos || 0) - 50); // Rough estimate
            // Add synthetic block start tag
            segmentsByPos.push({
                pos: blockStartPos,
                segment: {
                    type: 'blockStart',
                    content: ` block '${blockName}' : `,
                    start: '<#',
                    end: '#>',
                    pos: blockStartPos
                },
                source: 'block-start'
            });
            // Add block content
            for (const item of blockContent) {
                segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'block-content' });
            }
            // Add synthetic block end tag
            const blockEndPos = (lastItem.pos || 0) + (lastItem.content?.length || 0) + 10;
            segmentsByPos.push({
                pos: blockEndPos,
                segment: {
                    type: 'blockEnd',
                    content: ' end ',
                    start: '<#',
                    end: '#>',
                    pos: blockEndPos
                },
                source: 'block-end'
            });
        }
    }
    // Similar for slots
    for (const [slotName, slot] of Object.entries(ast.slots || {})) {
        const slotContent = slot.main || [];
        if (slotContent.length > 0) {
            const firstItem = slotContent[0];
            const lastItem = slotContent[slotContent.length - 1];
            const slotStartPos = Math.max(0, (firstItem.pos || 0) - 50);
            segmentsByPos.push({
                pos: slotStartPos,
                segment: {
                    type: 'slotStart',
                    content: ` slot '${slotName}' : `,
                    start: '<#',
                    end: '#>',
                    pos: slotStartPos
                },
                source: 'slot-start'
            });
            for (const item of slotContent) {
                segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'slot-content' });
            }
            const slotEndPos = (lastItem.pos || 0) + (lastItem.content?.length || 0) + 10;
            segmentsByPos.push({
                pos: slotEndPos,
                segment: {
                    type: 'slotEnd',
                    content: ' end ',
                    start: '<#',
                    end: '#>',
                    pos: slotEndPos
                },
                source: 'slot-end'
            });
        }
    }
    // Sort by position
    segmentsByPos.sort((a, b) => a.pos - b.pos);
    // Extract just the segments
    return segmentsByPos.map(item => item.segment);
}
// Resolve parent template path from <#@ extend ... #>
function getExtendTargetFrom(text, docUri) {
    // Try AST-based approach first
    const ast = parseContent(text);
    if (ast && Array.isArray(ast.main)) {
        for (const node of ast.main) {
            if (node.type === 'directive' && node.content) {
                const content = String(node.content).trim();
                if (content.startsWith('extend')) {
                    // Parse extend directive content
                    const match = content.match(/extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s+(["'`])([^"'`]+)\3)/);
                    const rel = (match?.[2] || match?.[4])?.trim();
                    if (rel) {
                        return resolveTemplatePath(rel, docUri);
                    }
                }
            }
        }
    }
    // Fallback to regex approach
    const m = text.match(/<#@\s*extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s*(["'`])([^"'`]+)\3)\s*#>/);
    const rel = (m?.[2] || m?.[4])?.trim();
    if (!rel)
        return null;
    return resolveTemplatePath(rel, docUri);
}
function resolveTemplatePath(rel, docUri) {
    try {
        const currentDir = docUri && docUri.startsWith('file:') ? path.dirname(url.fileURLToPath(docUri)) : process.cwd();
        const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
        for (const base of bases) {
            const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
            const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
            for (const v of variants) {
                if (fs.existsSync(v))
                    return v;
            }
        }
    }
    catch { }
    return null;
}
function computeDiagnostics(doc) {
    const text = doc.getText();
    const diags = [];
    // AST-driven structural validation
    const ast = parseContent(text);
    if (!ast || !Array.isArray(ast.main)) {
        diags.push({
            severity: node_1.DiagnosticSeverity.Error,
            range: node_1.Range.create(node_1.Position.create(0, 0), node_1.Position.create(0, 1)),
            message: 'Parse error',
            source: 'fte.js'
        });
    }
    else {
        try {
            const stack = [];
            // Validate naming of blocks/slots
            const nameIsValid = (s) => /^[A-Za-z_][\w.-]*$/.test(s);
            for (const n of ast.main) {
                if (n.type === 'blockStart' || n.type === 'slotStart') {
                    const nm = String(n.name || n.blockName || n.slotName || '');
                    if (nm && !nameIsValid(nm)) {
                        const from = doc.positionAt(n.pos);
                        const to = doc.positionAt(n.pos + String(n.start || '').length);
                        diags.push({ severity: node_1.DiagnosticSeverity.Error, range: { start: from, end: to }, message: `Invalid ${n.type === 'blockStart' ? 'block' : 'slot'} name: ${nm}`, source: 'fte.js' });
                    }
                    stack.push({ name: nm, pos: n.pos });
                }
                else if (n.type === 'end') {
                    if (stack.length === 0) {
                        const len = (text.slice(n.pos).match(/^<#-?\s*end\s*-?#>/)?.[0]?.length) || 5;
                        const start = doc.positionAt(n.pos);
                        const end = doc.positionAt(n.pos + len);
                        diags.push({ severity: node_1.DiagnosticSeverity.Error, range: { start, end }, message: 'Unmatched end', source: 'fte.js' });
                    }
                    else {
                        stack.pop();
                    }
                }
            }
            for (const it of stack) {
                const start = doc.positionAt(it.pos);
                const end = doc.positionAt(it.pos + 1);
                diags.push({ severity: node_1.DiagnosticSeverity.Error, range: { start, end }, message: `Unclosed ${it.name}`, source: 'fte.js' });
            }
            // report parser internal errors (unmatched/unclosed)
            if (Array.isArray(ast.errors)) {
                for (const e of ast.errors) {
                    const pos = doc.positionAt(e.pos || 0);
                    diags.push({ severity: node_1.DiagnosticSeverity.Error, range: { start: pos, end: pos }, message: e.message, source: 'fte.js' });
                }
            }
        }
        catch { }
    }
    // Unknown content('name') references
    try {
        const ast = parseContent(text);
        const known = new Set(Object.keys(ast?.blocks || {}));
        // include blocks from parent template if extends
        const parentAbs = getExtendTargetFrom(text, doc.uri);
        if (parentAbs) {
            try {
                const src = fs.readFileSync(parentAbs, 'utf8');
                const pAst = parseContent(src);
                for (const k of Object.keys(pAst?.blocks || {}))
                    known.add(k);
            }
            catch { }
        }
        // scan only inside expr/code nodes to avoid false positives in text
        const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
        const partialRe = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
        const contentHits = [];
        const partialHits = [];
        if (ast?.main) {
            for (const n of ast.main) {
                if (n && (n.type === 'expr' || n.type === 'code')) {
                    contentRe.lastIndex = 0;
                    partialRe.lastIndex = 0;
                    let mm;
                    while ((mm = contentRe.exec(String(n.content || '')))) {
                        const glob = n.pos + (String(n.start || '').length) + mm.index;
                        contentHits.push({ index: glob, match: mm });
                    }
                    while ((mm = partialRe.exec(String(n.content || '')))) {
                        const glob = n.pos + (String(n.start || '').length) + mm.index;
                        partialHits.push({ index: glob, match: mm });
                    }
                }
            }
        }
        for (const h of contentHits) {
            const name = h.match[2];
            if (!known.has(name)) {
                const from = doc.positionAt(h.index);
                const to = doc.positionAt(h.index + h.match[0].length);
                diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Unknown block name: ${name}`, source: 'fte.js' });
            }
        }
        // unresolved partial alias/path (also scan via AST-bound hits)
        for (const ph of partialHits) {
            const key = ph.match[2];
            // try local requireAs map
            const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
            let d;
            const local = new Map();
            while ((d = dirRe.exec(text))) {
                const params = d[1].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''));
                if (params.length >= 2)
                    local.set(params[1], params[0]);
            }
            let target = local.get(key) || key;
            if (target === key) {
                for (const [, info] of fileIndex) {
                    const mapped = info.requireAs.get(key);
                    if (mapped) {
                        target = mapped;
                        break;
                    }
                }
            }
            const bases = [...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
            const exists = (rel) => {
                for (const base of bases) {
                    const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
                    const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
                    for (const v of variants) {
                        if (fs.existsSync(v))
                            return true;
                    }
                }
                return false;
            };
            if (!exists(target)) {
                const from = doc.positionAt(ph.index);
                const to = doc.positionAt(ph.index + ph.match[0].length);
                diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Unresolved partial: ${key}`, source: 'fte.js' });
            }
        }
    }
    catch (e) {
        logError(e, 'computeDiagnostics.content');
    }
    // Duplicate block/slot declarations (AST based)
    try {
        const seen = {};
        const ast2 = parseContent(text);
        if (ast2?.main) {
            for (const n of ast2.main) {
                if (n.type === 'blockStart' || n.type === 'slotStart') {
                    const name = String(n.name || n.blockName || n.slotName || '');
                    seen[name] = (seen[name] || 0) + 1;
                    if (seen[name] > 1) {
                        const from = doc.positionAt(n.pos);
                        const to = doc.positionAt(n.pos + String(n.start || '').length || 1);
                        diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Duplicate ${n.type === 'blockStart' ? 'block' : 'slot'} declaration: ${name}`, source: 'fte.js' });
                    }
                }
            }
        }
    }
    catch { }
    // Directive validation
    // Trim hints: suggest using <#- or -#> when only whitespace is around
    try {
        const leftRx = /(\n?)([ \t]*)<#/g;
        let ml;
        while ((ml = leftRx.exec(text))) {
            // skip directives <#@
            if (text.slice(ml.index, ml.index + 3) === '<#@')
                continue;
            // skip structural tags <# block|slot|end
            const tail = text.slice(ml.index, ml.index + 12);
            if (/^<#-?\s*(block|slot|end)\b/.test(tail))
                continue;
            const dash = text.slice(ml.index, ml.index + 3) === '<#-';
            if (dash)
                continue;
            const prev = text[ml.index - 1] || '\n';
            const atLineStart = prev === '\n' || ml.index === 0;
            if (atLineStart && ml[2].length >= 0) {
                const start = doc.positionAt(ml.index);
                const end = doc.positionAt(ml.index + 2);
                diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start, end }, message: "Consider '<#-' to trim leading whitespace", source: 'fte.js' });
            }
        }
        const rightRx = /#>([ \t]*)(\r?\n)/g;
        let mr;
        while ((mr = rightRx.exec(text))) {
            // skip directive endings
            const openPos = text.lastIndexOf('<#', mr.index);
            if (openPos >= 0 && text[openPos + 2] === '@')
                continue;
            // skip structural tags <# block|slot|end ... #>
            if (openPos >= 0) {
                const tail = text.slice(openPos, openPos + 12);
                if (/^<#-?\s*(block|slot|end)\b/.test(tail))
                    continue;
            }
            const prevTwo = text.slice(mr.index - 2, mr.index);
            const dash = prevTwo === '-#';
            if (dash)
                continue;
            const start = doc.positionAt(mr.index);
            const end = doc.positionAt(mr.index + 2);
            diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start, end }, message: "Consider '-#>' to trim trailing whitespace", source: 'fte.js' });
        }
    }
    catch { }
    // Validate extend directive and parent template existence (MUST_HAVE.md point 14)
    try {
        const ast = parseContent(text);
        if (ast && Array.isArray(ast.main)) {
            for (const node of ast.main) {
                if (node.type === 'directive' && node.content) {
                    const content = String(node.content).trim();
                    if (content.startsWith('extend')) {
                        // Parse extend directive content
                        const match = content.match(/extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s+(["'`])([^"'`]+)\3)/);
                        const rel = (match?.[2] || match?.[4])?.trim();
                        if (rel) {
                            const resolvedPath = resolveTemplatePath(rel, doc.uri);
                            if (!resolvedPath) {
                                const start = doc.positionAt(node.pos);
                                const end = doc.positionAt(node.pos + (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length));
                                diags.push({
                                    severity: node_1.DiagnosticSeverity.Error,
                                    range: { start, end },
                                    message: `Parent template not found: ${rel}`,
                                    source: 'fte.js'
                                });
                            }
                            else {
                                // Check if parent template is accessible
                                try {
                                    fs.accessSync(resolvedPath, fs.constants.R_OK);
                                }
                                catch {
                                    const start = doc.positionAt(node.pos);
                                    const end = doc.positionAt(node.pos + (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length));
                                    diags.push({
                                        severity: node_1.DiagnosticSeverity.Error,
                                        range: { start, end },
                                        message: `Parent template is not accessible: ${resolvedPath}`,
                                        source: 'fte.js'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    catch (e) {
        logError(e, 'computeDiagnostics.extendValidation');
    }
    // Validate blocks used in child templates exist in parent chain
    try {
        const ast = parseContent(text);
        const parentAbs = getExtendTargetFrom(text, doc.uri);
        if (parentAbs && ast?.main) {
            // Get all parent blocks
            const parentBlocks = new Set();
            try {
                const parentSrc = fs.readFileSync(parentAbs, 'utf8');
                const parentAst = parseContent(parentSrc);
                if (parentAst?.blocks) {
                    for (const blockName of Object.keys(parentAst.blocks)) {
                        parentBlocks.add(blockName);
                    }
                }
            }
            catch { }
            // Check if child template uses blocks that don't exist in parent
            const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
            let m;
            while ((m = contentRe.exec(text))) {
                const blockName = m[2];
                const localBlock = ast?.blocks?.[blockName];
                // If block is used via content() but not defined locally and not in parent
                if (!localBlock && !parentBlocks.has(blockName)) {
                    const start = doc.positionAt(m.index);
                    const end = doc.positionAt(m.index + m[0].length);
                    diags.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: { start, end },
                        message: `Block '${blockName}' is not defined in this template or parent template chain`,
                        source: 'fte.js'
                    });
                }
            }
            // Check if child template declares blocks that don't exist in parent (MUST_HAVE.md point 4.44)
            if (ast?.blocks && parentBlocks.size > 0) {
                for (const [blockName, blockInfo] of Object.entries(ast.blocks)) {
                    if (!parentBlocks.has(blockName)) {
                        // Block declared in child but not in parent - this might be intentional (new block) 
                        // or unintentional (typo in override). Show as warning.
                        const blockNode = blockInfo;
                        if (blockNode && blockNode.declPos !== undefined) {
                            const start = doc.positionAt(blockNode.declPos);
                            const end = doc.positionAt(blockNode.declPos + 10); // approximate end
                            diags.push({
                                severity: node_1.DiagnosticSeverity.Information,
                                range: { start, end },
                                message: `Block '${blockName}' is declared in child template but does not exist in parent template. This creates a new block.`,
                                source: 'fte.js'
                            });
                        }
                    }
                }
            }
        }
    }
    catch (e) {
        logError(e, 'computeDiagnostics.parentBlockValidation');
    }
    // TODO: cross-file validation (P1): unknown aliases in `partial` or unresolvable paths
    const dirRe = /<#@([\s\S]*?)#>/g;
    let d;
    while ((d = dirRe.exec(text))) {
        const content = d[1].trim();
        const startPos = doc.positionAt(d.index);
        const endPos = doc.positionAt(d.index + d[0].length);
        const nameMatch = content.match(/^(\w+)/);
        if (!nameMatch) {
            diags.push({ severity: node_1.DiagnosticSeverity.Warning, range: { start: startPos, end: endPos }, message: 'Empty directive', source: 'fte.js' });
            continue;
        }
        const name = nameMatch[1];
        const paramsRaw = content.slice(name.length).trim();
        // extract params inside parentheses if present, otherwise split by spaces/commas
        let params = [];
        const paren = paramsRaw.match(/^\(([^)]*)\)/);
        if (paren) {
            params = paren[1]
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => s.replace(/^['"`]|['"`]$/g, ''));
        }
        else if (paramsRaw.length) {
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
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: `Directive ${name} requires 1 parameter`, source: 'fte.js' });
                }
                break;
            case 'alias':
                if (params.length < 1) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: 'Directive alias requires at least 1 parameter', source: 'fte.js' });
                }
                break;
            case 'requireAs':
                if (params.length !== 2) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: 'Directive requireAs requires exactly 2 parameters', source: 'fte.js' });
                }
                break;
            case 'deindent':
                if (params.length > 1) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: 'Directive deindent accepts at most 1 numeric parameter', source: 'fte.js' });
                }
                else if (params.length === 1 && Number.isNaN(Number(params[0]))) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: 'Directive deindent parameter must be a number', source: 'fte.js' });
                }
                break;
            case 'lang':
                // lang directive supports both forms: <#@ lang = c# #> or <#@ lang(c#) #>
                if (params.length < 1) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: 'Directive lang requires 1 parameter or assignment', source: 'fte.js' });
                }
                break;
            default:
                if (!DIRECTIVES.includes(name)) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: `Unknown directive: ${name}`, source: 'fte.js' });
                }
                else if (requireNoParams.includes(name) && params.length > 0) {
                    diags.push({ severity: node_1.DiagnosticSeverity.Warning, range, message: `Directive ${name} does not accept parameters`, source: 'fte.js' });
                }
        }
    }
    return diags;
}
function computeOpenBlocks(text, upTo) {
    // MUST_USE_PARSER: compute pairs strictly via AST; no regex fallbacks
    const ast = parseContent(text);
    const limit = upTo ?? text.length;
    if (ast && Array.isArray(ast.main)) {
        return (0, astUtils_1.computeOpenBlocksFromAst)(ast.main, limit);
    }
    return [];
}
function stripStringsAndComments(line) {
    // remove // comments
    let res = line.replace(/\/\/.*$/, '');
    // remove single/double/backtick quoted strings (no multiline)
    res = res.replace(/'(?:\\.|[^'\\])*'/g, "'");
    res = res.replace(/"(?:\\.|[^"\\])*"/g, '"');
    res = res.replace(/`(?:\\.|[^`\\])*`/g, '`');
    return res;
}
function isTemplateTagLine(line) {
    return /<#|#>|\#\{|!\{|<%|%>/.test(line);
}
function computeJsCodeDelta(line) {
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
    if (!doc)
        return [];
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    const prefix = text.slice(Math.max(0, offset - 50), offset);
    const before = text.slice(0, offset);
    const items = [];
    // directive completion inside <#@ ... #>
    if (/<#@\s+[\w-]*$/.test(prefix)) {
        items.push(...DIRECTIVES.map((d) => ({
            label: d,
            kind: node_1.CompletionItemKind.Keyword,
            documentation: usageDocs.directives[d] || undefined
        })));
    }
    // block/slot keywords
    if (/<#-?\s*(block|slot)\s+['"`][^'"`]*$/.test(prefix)) {
        items.push({ label: "end", kind: node_1.CompletionItemKind.Keyword });
    }
    // block/slot snippets with auto end
    if (/<#-?\s*$/.test(prefix)) {
        const snippets = [
            {
                label: 'block (with end)',
                kind: node_1.CompletionItemKind.Snippet,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                insertText: "<# block '${1:name}' : #>\n\t$0\n<# end #>"
            },
            {
                label: 'block trimmed (with end)',
                kind: node_1.CompletionItemKind.Snippet,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                insertText: "<#- block '${1:name}' : -#>\n\t$0\n<#- end -#>"
            },
            {
                label: 'slot (with end)',
                kind: node_1.CompletionItemKind.Snippet,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                insertText: "<# slot '${1:name}' : #>\n\t$0\n<# end #>"
            },
            {
                label: 'slot trimmed (with end)',
                kind: node_1.CompletionItemKind.Snippet,
                insertTextFormat: node_1.InsertTextFormat.Snippet,
                insertText: "<#- slot '${1:name}' : -#>\n\t$0\n<#- end -#>"
            }
        ];
        items.push(...snippets);
    }
    // content()/partial() suggestions inside #{ ... }
    if (/#\{\s*[\w$]*$/.test(prefix)) {
        // suggest function names
        const f = (name) => ({
            label: name,
            kind: node_1.CompletionItemKind.Function,
            documentation: usageDocs.functions[name] || undefined
        });
        items.push(f('content'), f('partial'), f('slot'), f('chunkStart'), f('chunkEnd'));
        // suggest known block/slot names inside string literal argument
        const argPrefix = before.match(/content\(\s*(["'`])([^"'`]*)$/) || before.match(/slot\(\s*(["'`])([^"'`]*)$/);
        if (argPrefix) {
            const ast = parseContent(text);
            const seen = new Set(Object.keys(ast?.blocks || {}));
            // include parent via extend
            const parentAbs = getExtendTargetFrom(text, textDocument.uri);
            if (parentAbs) {
                try {
                    const src = fs.readFileSync(parentAbs, 'utf8');
                    const pAst = parseContent(src);
                    for (const k of Object.keys(pAst?.blocks || {}))
                        seen.add(k);
                }
                catch { }
            }
            // include project index (workspace)
            for (const [, info] of fileIndex) {
                for (const k of info.blocks.keys())
                    seen.add(k);
            }
            for (const name of seen) {
                items.push({ label: name, kind: node_1.CompletionItemKind.Text });
            }
        }
    }
    return items;
});
connection.onHover(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return null;
    const text = doc.getText();
    const ast = parseContent(text);
    if (!ast)
        return null;
    const offset = doc.offsetAt(position);
    // naive hover: show node type at position
    const hit = ast.main.find((n) => offset >= n.pos && offset <= (n.pos + (n.content?.length || 0)));
    if (hit) {
        // enrich hover for known functions/directives by scanning the token near cursor
        const around = text.slice(Math.max(0, offset - 40), Math.min(text.length, offset + 40));
        const func = around.match(/\b(partial|content|slot|chunkStart|chunkEnd)\b/);
        if (func) {
            const key = func[1];
            const info = usageDocs.functions[key] || usageDocs.functions[key === 'chunkEnd' ? 'chunkStart' : key];
            if (info)
                return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
        }
        const dir = around.match(/<#@\s*(\w+)/);
        if (dir) {
            const info = usageDocs.directives[dir[1]];
            if (info)
                return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
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
    if (!doc)
        return null;
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    const winStart = Math.max(0, offset - 200);
    const winEnd = Math.min(text.length, offset + 200);
    const around = text.slice(winStart, winEnd);
    // NOTE: content() navigation is DISABLED per MUST_HAVE.md point 13
    // content() is a data insertion point, not a definition reference
    // However, we should check if cursor is specifically on the block name inside content('block_name')
    // Check if cursor is on block name inside content('block_name') string literal
    // Use global search to find all matches and pick the right one based on cursor position
    const contentRegex = /content\(\s*(["'`])([^"'`]+)\1/g;
    let contentMatch;
    while ((contentMatch = contentRegex.exec(around)) !== null) {
        const blockName = contentMatch[2];
        const contentStart = contentMatch.index;
        const quoteStart = winStart + contentStart + contentMatch[0].indexOf(contentMatch[1]) + 1;
        const quoteEnd = quoteStart + blockName.length;
        // Check if our offset falls within this match's quote range
        if (offset >= quoteStart && offset <= quoteEnd) {
            const ast = parseContent(text);
            // Use AST-based search instead of RegExp to find correct block
            if (ast?.blocks?.[blockName]) {
                const block = ast.blocks[blockName];
                // Use declPos from AST if available (more reliable than RegExp)
                if (block.declPos !== undefined) {
                    const declStart = doc.positionAt(block.declPos);
                    // Calculate end position based on declaration parts
                    const declLength = (block.declStart || '').length + (block.declContent || '').length + (block.declEnd || '').length;
                    const declEnd = doc.positionAt(block.declPos + declLength);
                    return node_1.Location.create(textDocument.uri, node_1.Range.create(declStart, declEnd));
                }
                // Fallback to first inner item if declPos not available
                const first = ast.blocks[blockName].main?.[0];
                if (first) {
                    return node_1.Location.create(textDocument.uri, node_1.Range.create(doc.positionAt(first.pos), doc.positionAt(first.pos + first.content.length)));
                }
            }
            // If not found locally, try parent via extend
            const parentAbs = getExtendTargetFrom(text, textDocument.uri);
            if (parentAbs) {
                try {
                    const src = fs.readFileSync(parentAbs, 'utf8');
                    const pAst = parseContent(src);
                    if (pAst?.blocks?.[blockName]) {
                        // Try to use declPos from parent AST if available
                        const parentBlock = pAst.blocks[blockName];
                        if (parentBlock.declPos !== undefined) {
                            const uri = 'file://' + parentAbs;
                            const declStart = posFromOffset(src, parentBlock.declPos);
                            const declLength = (parentBlock.declStart || '').length + (parentBlock.declContent || '').length + (parentBlock.declEnd || '').length;
                            const declEnd = posFromOffset(src, parentBlock.declPos + declLength);
                            return node_1.Location.create(uri, node_1.Range.create(declStart, declEnd));
                        }
                        // Fallback to first inner item
                        const first = pAst.blocks[blockName].main?.[0];
                        if (first) {
                            const uri = 'file://' + parentAbs;
                            return node_1.Location.create(uri, node_1.Range.create(posFromOffset(src, first.pos), posFromOffset(src, first.pos + first.content.length)));
                        }
                    }
                }
                catch (e) {
                    logError(e, 'onDefinition.contentBlockName.parent');
                }
            }
            break; // Stop after finding the right match
        }
    }
    const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
    if (mp) {
        const key = mp[2];
        // resolve alias/path
        const aliasMap = {};
        const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
        let d;
        while ((d = dirRe.exec(text))) {
            const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
            if (params.length >= 2)
                aliasMap[params[1]] = params[0];
        }
        let target = aliasMap[key] || key;
        // also scan workspace index for requireAs aliases
        if (target === key) {
            for (const [, info] of fileIndex) {
                const mapped = info.requireAs.get(key);
                if (mapped) {
                    target = mapped;
                    break;
                }
            }
        }
        const tryResolve = (rel, baseDirs) => {
            for (const base of baseDirs) {
                const c = path.isAbsolute(rel) ? rel : path.join(base, rel);
                const variants = [c, c + '.njs', c + '.nhtml', c + '.nts'];
                for (const v of variants) {
                    if (fs.existsSync(v))
                        return v;
                }
            }
            return null;
        };
        const currentDir = textDocument.uri.startsWith('file:') ? path.dirname(url.fileURLToPath(textDocument.uri)) : process.cwd();
        const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
        const resolved = tryResolve(target, bases);
        if (resolved) {
            const uri = 'file://' + resolved;
            return node_1.Location.create(uri, node_1.Range.create(node_1.Position.create(0, 0), node_1.Position.create(0, 0)));
        }
    }
    // If on a block/slot declaration name, just return its own location
    const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
    let match;
    while ((match = openRe.exec(text))) {
        const nameStart = match.index + match[0].indexOf(match[3]);
        const nameEnd = nameStart + match[3].length;
        if (offset >= nameStart && offset <= nameEnd) {
            // Prefer navigating to parent declaration if present (inheritance base)
            const parentAbs = getExtendTargetFrom(text, textDocument.uri);
            if (parentAbs) {
                try {
                    const src = fs.readFileSync(parentAbs, 'utf8');
                    const declRe = new RegExp(`<#\\s*-?\\s*(?:block|slot)\\s+(["'\`])${match[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*:\\s*-?\\s*#>`, 'g');
                    const dm = declRe.exec(src);
                    if (dm) {
                        const uri = 'file://' + parentAbs;
                        return node_1.Location.create(uri, node_1.Range.create(posFromOffset(src, dm.index), posFromOffset(src, dm.index + dm[0].length)));
                    }
                }
                catch { }
            }
            return node_1.Location.create(textDocument.uri, node_1.Range.create(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length)));
        }
    }
    return null;
});
connection.onReferences(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return [];
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    const around = text.slice(Math.max(0, offset - 100), Math.min(text.length, offset + 100));
    // Determine selected block name
    const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
    let selected;
    let match;
    while ((match = openRe.exec(text))) {
        const nameStart = match.index + match[0].indexOf(match[3]);
        const nameEnd = nameStart + match[3].length;
        if (offset >= nameStart && offset <= nameEnd) {
            selected = match[3];
            break;
        }
    }
    if (!selected)
        return [];
    // Collect all references via content('name') and declaration
    const res = [];
    // declaration
    if (match) {
        res.push(node_1.Location.create(textDocument.uri, node_1.Range.create(doc.positionAt(match.index), doc.positionAt(match.index + match[0].length))));
    }
    // usages
    const usageRe = new RegExp(String.raw `content\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
    const slotRe = new RegExp(String.raw `slot\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
    let u;
    while ((u = usageRe.exec(text))) {
        const start = doc.positionAt(u.index);
        const end = doc.positionAt(u.index + u[0].length);
        res.push(node_1.Location.create(textDocument.uri, node_1.Range.create(start, end)));
    }
    while ((u = slotRe.exec(text))) {
        const start = doc.positionAt(u.index);
        const end = doc.positionAt(u.index + u[0].length);
        res.push(node_1.Location.create(textDocument.uri, node_1.Range.create(start, end)));
    }
    // cross-file usages
    for (const [uri, info] of fileIndex) {
        if (uri === textDocument.uri)
            continue;
        const p = info.path ? fs.readFileSync(info.path, 'utf8') : '';
        if (!p)
            continue;
        let mu;
        usageRe.lastIndex = 0;
        while ((mu = usageRe.exec(p))) {
            const start = posFromOffset(p, mu.index);
            const end = posFromOffset(p, mu.index + mu[0].length);
            res.push(node_1.Location.create(uri, node_1.Range.create(start, end)));
        }
        slotRe.lastIndex = 0;
        while ((mu = slotRe.exec(p))) {
            const start = posFromOffset(p, mu.index);
            const end = posFromOffset(p, mu.index + mu[0].length);
            res.push(node_1.Location.create(uri, node_1.Range.create(start, end)));
        }
    }
    // include declarations of overrides in child templates that extend current file
    const thisAbs = textDocument.uri.startsWith('file:') ? url.fileURLToPath(textDocument.uri) : undefined;
    if (thisAbs) {
        const children = extendsChildren.get(thisAbs);
        if (children) {
            const declRe = new RegExp(`<#\\s*-?\\s*(?:block|slot)\\s+(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*:\\s*-?\\s*#>`, 'g');
            for (const childUri of children) {
                const info = fileIndex.get(childUri);
                const src = info?.path ? fs.readFileSync(info.path, 'utf8') : '';
                if (!src)
                    continue;
                let mm;
                while ((mm = declRe.exec(src))) {
                    const start = posFromOffset(src, mm.index);
                    const end = posFromOffset(src, mm.index + mm[0].length);
                    res.push(node_1.Location.create(childUri, node_1.Range.create(start, end)));
                }
            }
        }
    }
    // Partial references if cursor is within partial(..., 'name') argument
    const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
    if (mp) {
        const key = mp[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prx = new RegExp(String.raw `partial\(\s*[^,]+,\s*(["'\`])${key}\1`, 'g');
        // current file
        let mu;
        while ((mu = prx.exec(text))) {
            const start = doc.positionAt(mu.index);
            const end = doc.positionAt(mu.index + mu[0].length);
            res.push(node_1.Location.create(textDocument.uri, node_1.Range.create(start, end)));
        }
        // other files
        for (const [uri, info] of fileIndex) {
            if (uri === textDocument.uri)
                continue;
            const p = info.path ? fs.readFileSync(info.path, 'utf8') : '';
            if (!p)
                continue;
            prx.lastIndex = 0;
            while ((mu = prx.exec(p))) {
                const start = posFromOffset(p, mu.index);
                const end = posFromOffset(p, mu.index + mu[0].length);
                res.push(node_1.Location.create(uri, node_1.Range.create(start, end)));
            }
        }
    }
    return res;
});
connection.onSignatureHelp(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return null;
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    const before = text.slice(Math.max(0, offset - 60), offset);
    const m = before.match(/<#@\s*(\w+)\s*\([^\)]*$/);
    const name = m?.[1];
    if (!name)
        return null;
    const sig = {
        label: `<#@ ${name}(...) #>`,
        documentation: `fte.js directive ${name}`,
        parameters: [{ label: '...params' }]
    };
    const help = { signatures: [sig], activeSignature: 0, activeParameter: 0 };
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
        logDebug('Starting document formatting', 'onDocumentFormatting', {
            uri: textDocument.uri,
            textLength: text.length,
            indentSize
        });
        // Use local parser to split into items
        let ast;
        try {
            ast = parseContent(text);
            logDebug('AST parsing successful', 'onDocumentFormatting');
        }
        catch (e) {
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
                if (isTplEnd || isHtmlClose || jsDedentFirst)
                    level = Math.max(0, level - 1);
                const base = rtrim.trimStart();
                const indented = (level > 0 ? ' '.repeat(level * indentSize) : '') + base;
                const opensTpl = openTpl.test(rtrim) && !endTpl.test(rtrim);
                const opensHtml = isHtml && htmlOpen.test(rtrim.trim()) && !htmlSelf.test(rtrim.trim()) && !isHtmlClose && !/^<\//.test(rtrim.trim());
                let delta = 0;
                if (opensTpl || opensHtml)
                    delta += 1;
                if (maybeCode)
                    delta += jsDelta;
                if (delta > 0)
                    level += delta;
                return indented;
            }).join('\n');
            const fullRange = node_1.Range.create(node_1.Position.create(0, 0), doc.positionAt(doc.getText().length));
            return [node_1.TextEdit.replace(fullRange, formattedFallback.endsWith('\n') ? formattedFallback : formattedFallback + '\n')];
        }
        const ext = (textDocument.uri.split('.').pop() || '').toLowerCase();
        let defaultLang = ext === 'nhtml' ? 'html' : ext === 'nmd' ? 'markdown' : ext === 'nts' ? 'typescript' : 'babel';
        // Override defaultLang if directive <#@ lang = X #> is present
        try {
            const langDir = /<#@\s*lang\s*=\s*([A-Za-z#]+)\s*#>/i.exec(text);
            if (langDir && langDir[1]) {
                const v = langDir[1].toLowerCase();
                if (v === 'c#' || v === 'csharp')
                    defaultLang = 'csharp';
                else if (v === 'ts' || v === 'typescript')
                    defaultLang = 'typescript';
                else if (v === 'js' || v === 'javascript')
                    defaultLang = 'babel';
                else if (v === 'html')
                    defaultLang = 'html';
                else if (v === 'md' || v === 'markdown')
                    defaultLang = 'markdown';
            }
        }
        catch { }
        const getTextLang = () => defaultLang;
        // Build result using shared core to make it testable without LSP runtime
        // Prefer flat token list from parser (ast.tokens) when available to preserve exact order
        const items = ast.tokens && Array.isArray(ast.tokens)
            ? ast.tokens
            : collectAllASTSegments(ast);
        // Prefer source-walking formatting
        const finalText = (0, formatterCore_1.formatWithSourceWalking)(text, ast, {
            indentSize,
            defaultLang: getTextLang(),
            settings: serverSettings,
            uri: textDocument.uri,
            prettierConfigCache,
        });
        const original = doc.getText();
        const fullRange = node_1.Range.create(node_1.Position.create(0, 0), doc.positionAt(original.length));
        const needsTerminalNewline = /\n$/.test(original);
        const replaced = needsTerminalNewline ? (finalText.endsWith('\n') ? finalText : finalText + '\n') : finalText.replace(/\n$/, '');
        logDebug('Document formatting completed', 'onDocumentFormatting', {
            originalLength: original.length,
            formattedLength: replaced.length,
            hasTerminalNewline: needsTerminalNewline
        });
        return [node_1.TextEdit.replace(fullRange, replaced)];
    }
    catch (err) {
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
    if (!doc)
        return [];
    const indentSize = options.tabSize || 2;
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    // Only react when '>' or newline typed right after opener; use token-ordered stack for reliable pairing
    const before = text.slice(0, offset);
    const lastOpenStack = computeOpenBlocks(text, offset);
    if (lastOpenStack.length === 0)
        return [];
    const last = lastOpenStack[lastOpenStack.length - 1];
    // If next non-space after cursor is already an end tag - do nothing
    const after = text.slice(offset);
    if (after.match(/^\s*<#-?\s*end\s*-?#>/))
        return [];
    // Build end tag based on opener trim markers
    const endTag = (0, astUtils_1.buildEndTagFor)(last);
    const currentLineStart = before.lastIndexOf('\n') + 1;
    const currentLineIndent = before.slice(currentLineStart).match(/^\s*/)?.[0]?.length ?? 0;
    const indent = ' '.repeat(Math.max(0, currentLineIndent));
    const nextIndent = ' '.repeat(Math.max(0, currentLineIndent + indentSize));
    // Insert a newline, keep cursor line, add end on new line below
    // We return edits that re-indent current line (if needed) and append the end tag
    const edits = [];
    if (ch === '>') {
        // user just closed opener; insert newline + end below
        edits.push(node_1.TextEdit.insert(position, `\n${nextIndent}`));
        const insertPos = { line: position.line + 1, character: 0 };
        edits.push(node_1.TextEdit.insert(insertPos, `${indent}${endTag}`));
    }
    else if (ch === '\n') {
        edits.push(node_1.TextEdit.insert(position, `${nextIndent}`));
        const insertPos = position;
        edits.push(node_1.TextEdit.insert(insertPos, `\n${indent}${endTag}`));
    }
    return edits;
});
connection.onCodeAction(({ textDocument, range, context }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return [];
    const text = doc.getText();
    const diagnostics = context.diagnostics || [];
    const actions = [];
    // Quick fix for unmatched end
    const hasUnmatchedEnd = diagnostics.some(d => /Unmatched end/.test(d.message));
    if (hasUnmatchedEnd) {
        actions.push({
            title: 'Remove unmatched end',
            kind: 'quickfix',
            edit: { changes: { [textDocument.uri]: [node_1.TextEdit.del(range)] } }
        });
    }
    // Quick fix: sanitize invalid block/slot names
    for (const d of diagnostics) {
        const m = d.message.match(/^Invalid (block|slot) name: (.+)$/);
        if (m) {
            const kind = m[1];
            const bad = m[2];
            const sanitized = bad
                .replace(/[^A-Za-z0-9_.-]/g, '_')
                .replace(/^[^A-Za-z_]+/, '_');
            const docText = text;
            // Find the declaration near diagnostic range
            const startOff = doc.offsetAt(d.range.start);
            const searchFrom = Math.max(0, startOff - 200);
            const searchTo = Math.min(docText.length, startOff + 200);
            const snippet = docText.slice(searchFrom, searchTo);
            const declRe = new RegExp(String.raw `<#\s*-?\s*${kind}\s+(["'\`])([^"'\`]+)\1\s*:\s*-?\s*#>`);
            const local = declRe.exec(snippet);
            if (local) {
                const nameStartLocal = local.index + local[0].indexOf(local[2]);
                const from = doc.positionAt(searchFrom + nameStartLocal);
                const to = doc.positionAt(searchFrom + nameStartLocal + local[2].length);
                actions.push({
                    title: `Rename ${kind} to '${sanitized}'`,
                    kind: 'quickfix',
                    diagnostics: [d],
                    edit: { changes: { [textDocument.uri]: [node_1.TextEdit.replace({ start: from, end: to }, sanitized)] } }
                });
            }
        }
    }
    // Quick fixes for trim suggestions
    for (const d of diagnostics) {
        if (d.message.includes("Consider '<#-")) {
            // Replace '<#' with '<#-' at the diagnostic range
            actions.push({
                title: "Apply left trim '<#-'",
                kind: 'quickfix',
                diagnostics: [d],
                edit: { changes: { [textDocument.uri]: [node_1.TextEdit.replace(d.range, '<#-')] } }
            });
        }
        if (d.message.includes("Consider '-#>")) {
            // Replace '#>' with '-#>' at the diagnostic range
            actions.push({
                title: "Apply right trim '-#>'",
                kind: 'quickfix',
                diagnostics: [d],
                edit: { changes: { [textDocument.uri]: [node_1.TextEdit.replace(d.range, '-#>')] } }
            });
        }
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
            edit: { changes: { [textDocument.uri]: [node_1.TextEdit.insert(range.end, `\n${indent}${tags}`)] } }
        });
    }
    // Wrap selection into template block/code
    const selectionText = text.slice(doc.offsetAt(range.start), doc.offsetAt(range.end));
    if (selectionText && selectionText.length > 0) {
        actions.push({
            title: 'Wrap with <#- ... -#>',
            kind: 'refactor.rewrite',
            edit: { changes: { [textDocument.uri]: [node_1.TextEdit.replace(range, `<#- ${selectionText} -#>`)] } }
        });
        actions.push({
            title: "Wrap with <# ... #>",
            kind: 'refactor.rewrite',
            edit: { changes: { [textDocument.uri]: [node_1.TextEdit.replace(range, `<# ${selectionText} #>`)] } }
        });
        // Prompted transforms (handled on client via commands)
        actions.push({ title: "Transform to block (prompt name)", kind: 'refactor.extract', command: { title: 'transform', command: 'ftejs.refactor.toBlock', arguments: [{ uri: textDocument.uri, range }] } });
        actions.push({ title: "Transform to slot (prompt name)", kind: 'refactor.extract', command: { title: 'transform', command: 'ftejs.refactor.toSlot', arguments: [{ uri: textDocument.uri, range }] } });
        actions.push({ title: "Transform to partial (prompt name)", kind: 'refactor.rewrite', command: { title: 'transform', command: 'ftejs.refactor.toPartial', arguments: [{ uri: textDocument.uri, range }] } });
    }
    // Refactor: extract heavy expression inside #{ ... } to const and use #{var}
    const curOffset = doc.offsetAt(range.start);
    const before = text.slice(0, curOffset);
    const after = text.slice(curOffset);
    const openIdx = before.lastIndexOf('#{');
    const openBangIdx = before.lastIndexOf('!{');
    const open = Math.max(openIdx, openBangIdx);
    const closeRel = after.indexOf('}');
    if (open >= 0 && closeRel >= 0) {
        const exprStart = open + 2; // after #{ or !{
        const exprEnd = curOffset + closeRel; // index of '}'
        const exprText = text.slice(exprStart, exprEnd);
        if (exprText.trim().length > 20) { // heuristic: heavy
            let idx = 1;
            let varName = `_expr${idx}`;
            while (text.includes(varName)) {
                idx += 1;
                varName = `_expr${idx}`;
            }
            const lineStart = node_1.Position.create(range.start.line, 0);
            const insertDecl = node_1.TextEdit.insert(lineStart, `<# const ${varName} = ${exprText.trim()} #>\n`);
            const replaceRange = node_1.Range.create(doc.positionAt(exprStart), doc.positionAt(exprEnd));
            const replaceExpr = node_1.TextEdit.replace(replaceRange, ` ${varName} `);
            actions.push({
                title: 'Extract expression to const and use in template',
                kind: 'refactor.extract',
                edit: { changes: { [textDocument.uri]: [insertDecl, replaceExpr] } }
            });
        }
    }
    // Quick fix: create missing block for Unknown block name diagnostics
    for (const d of diagnostics) {
        const m = d.message.match(/^Unknown block name: (.+)$/);
        if (m) {
            const name = m[1];
            const insertAt = node_1.Position.create(0, 0);
            const scaffold = `<# block '${name}' : #>\n<# end #>\n`;
            actions.push({
                title: `Create block '${name}' at file start`,
                kind: 'quickfix',
                edit: { changes: { [textDocument.uri]: [node_1.TextEdit.insert(insertAt, scaffold)] } }
            });
            const curInsert = range.start;
            actions.push({
                title: `Insert block '${name}' here`,
                kind: 'quickfix',
                edit: { changes: { [textDocument.uri]: [node_1.TextEdit.insert(curInsert, scaffold)] } }
            });
        }
    }
    return actions;
});
// publish diagnostics on open/change with counts like typical linters
documents.onDidChangeContent(({ document }) => {
    const diags = computeDiagnostics(document);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
    const errors = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Error).length;
    const warns = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Warning).length;
    const hints = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Hint).length;
    logInfo(`Diagnostics updated: ${errors} error(s), ${warns} warning(s), ${hints} hint(s)`, 'diagnostics', { uri: document.uri });
    // re-index this document
    try {
        indexText(document.uri, document.getText());
    }
    catch { }
});
documents.onDidOpen(({ document }) => {
    const diags = computeDiagnostics(document);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: diags });
    const errors = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Error).length;
    const warns = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Warning).length;
    const hints = diags.filter(d => d.severity === node_1.DiagnosticSeverity.Hint).length;
    logInfo(`Diagnostics on open: ${errors} error(s), ${warns} warning(s), ${hints} hint(s)`, 'diagnostics', { uri: document.uri });
    try {
        indexText(document.uri, document.getText());
    }
    catch { }
});
connection.onDocumentSymbol(({ textDocument }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return [];
    const ast = parseContent(doc.getText());
    if (!ast)
        return [];
    // expose blocks and slots as document symbols
    const symbols = [];
    for (const [name, block] of Object.entries(ast.blocks || {})) {
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
    for (const [name, slot] of Object.entries(ast.slots || {})) {
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
