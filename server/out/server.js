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
const path = __importStar(require("path"));
// dynamic import of parser from fte2 path
function loadParser(parserPath) {
    try {
        const entry = path.join(parserPath, 'dist', 'index.js');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(entry);
        return mod;
    }
    catch (e) {
        return undefined;
    }
}
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let parser;
connection.onInitialize((params) => {
    const options = (params.initializationOptions || {});
    const parserPath = options.parserPath || '';
    if (parserPath) {
        parser = loadParser(parserPath);
    }
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: { resolveProvider: false, triggerCharacters: ['{', '<', '@', '\'', '"'] },
            hoverProvider: true,
            documentSymbolProvider: true,
            definitionProvider: false,
            referencesProvider: false,
        },
    };
});
const DIRECTIVES = [
    'extend', 'context', 'alias', 'deindent', 'chunks', 'includeMainChunk', 'useHash',
    'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs'
];
function parseContent(text) {
    if (!parser?.Parser)
        return undefined;
    try {
        return parser.Parser.parse(text, { indent: 2 });
    }
    catch {
        return undefined;
    }
}
connection.onCompletion(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc)
        return [];
    const text = doc.getText();
    const offset = doc.offsetAt(position);
    const prefix = text.slice(Math.max(0, offset - 50), offset);
    const items = [];
    // directive completion inside <#@ ... #>
    if (/<#@\s+[\w-]*$/.test(prefix)) {
        items.push(...DIRECTIVES.map((d) => ({ label: d, kind: node_1.CompletionItemKind.Keyword })));
    }
    // block/slot keywords
    if (/<#-?\s*(block|slot)\s+['"`][^'"`]*$/.test(prefix)) {
        items.push({ label: "end", kind: node_1.CompletionItemKind.Keyword });
    }
    // content()/partial() suggestions inside #{ ... }
    if (/#\{\s*[\w$]*$/.test(prefix)) {
        items.push({ label: 'content', kind: node_1.CompletionItemKind.Function }, { label: 'partial', kind: node_1.CompletionItemKind.Function });
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
        return { contents: { kind: 'plaintext', value: `fte.js: ${hit.type}` } };
    }
    return null;
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
    for (const [name, slot] of Object.entries(ast.blocks || {})) {
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
