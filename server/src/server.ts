import { createConnection, TextDocuments, ProposedFeatures, InitializeParams, CompletionItem, CompletionItemKind, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// dynamic import of parser from fte2 path
function loadParser(parserPath: string) {
  try {
    const entry = path.join(parserPath, 'dist', 'index.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(entry);
    return mod;
  } catch (e) {
    return undefined;
  }
}

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let parser: any | undefined;

connection.onInitialize((params: InitializeParams) => {
  const options = (params.initializationOptions || {}) as { parserPath?: string };
  const parserPath = options.parserPath || '';
  if (parserPath) {
    parser = loadParser(parserPath);
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
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

function parseContent(text: string) {
  if (!parser?.Parser) return undefined;
  try {
    return parser.Parser.parse(text, { indent: 2 });
  } catch {
    return undefined;
  }
}

connection.onCompletion(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const prefix = text.slice(Math.max(0, offset - 50), offset);

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

  // content()/partial() suggestions inside #{ ... }
  if (/#\{\s*[\w$]*$/.test(prefix)) {
    items.push(
      { label: 'content', kind: CompletionItemKind.Function },
      { label: 'partial', kind: CompletionItemKind.Function }
    );
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
    return { contents: { kind: 'plaintext', value: `fte.js: ${hit.type}` } };
  }
  return null;
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
