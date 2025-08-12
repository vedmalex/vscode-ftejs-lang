# fte-js-lang

## Структура файловой системы

```
└── fte-js-lang/
    ├── .vscode/
    │   └── launch.json
    ├── client/
    │   ├── src/
    │   │   └── extension.ts
    │   ├── package.json
    │   └── tsconfig.json
    ├── server/
    │   ├── src/
    │   │   ├── astUtils.ts
    │   │   ├── diagnosticsCore.ts
    │   │   ├── formatterCore.ts
    │   │   ├── parser.ts
    │   │   ├── semanticTokens.ts
    │   │   └── server.ts
    │   ├── package.json
    │   └── tsconfig.json
    ├── syntaxes/
    │   ├── template-html.tmLanguage.json
    │   ├── template-inject-generic.tmLanguage.json
    │   ├── template-inject-html.tmLanguage.json
    │   ├── template-inline.tmLanguage.json
    │   ├── template-js.tmLanguage.json
    │   ├── template-markdown.tmLanguage.json
    │   └── template-typescript.tmLanguage.json
    ├── language-configuration.json
    ├── package-lock.json
    ├── package.json
    └── tsconfig.json
```

## Список файлов

`.vscode/launch.json`

```json
// A launch configuration that launches the extension inside a new window
// Use IntelliSense to learn about possible attributes.
// Hover to view descriptions of existing attributes.
// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
{
	"version": "0.2.0",
    "configurations": [
        {
            "name": "Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ]
        }
    ]
}
```

`client/src/extension.ts`

```ts
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let trimDecorationType: vscode.TextEditorDecorationType | undefined;
let trimVisualizerEnabled = false;
let trimDebounceTimer: NodeJS.Timeout | undefined;

function scheduleUpdateTrimDecorations(editor: vscode.TextEditor | undefined) {
  if (!trimVisualizerEnabled) { return; }
  if (trimDebounceTimer) { clearTimeout(trimDebounceTimer); }
  trimDebounceTimer = setTimeout(() => updateTrimDecorations(editor), 150);
}

function updateTrimDecorations(editor: vscode.TextEditor | undefined) {
  if (!trimDecorationType) { return; }
  if (!editor || !trimVisualizerEnabled) {
    try { editor?.setDecorations(trimDecorationType, []); } catch {}
    return;
  }

  const doc = editor.document;
  const text = doc.getText();
  const decos: vscode.DecorationOptions[] = [];

  const pushRange = (start: number, end: number, hover: string) => {
    if (end <= start) { return; }
    const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end));
    decos.push({ range, hoverMessage: hover });
  };

  // Left-trim: <#- and EJS variants
  for (const m of text.matchAll(/<#-/g)) {
    const idx = m.index ?? -1; if (idx < 0) continue;
    // Walk backwards over whitespace
    let s = idx - 1;
    while (s >= 0) {
      const ch = text.charAt(s);
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
      s--;
    }
    const start = s + 1;
    pushRange(start, idx, 'Whitespace trimmed by <#-');
  }

  // EJS left-trim: <%_ and <%-
  for (const m of text.matchAll(/<%[-_]/g)) {
    const idx = m.index ?? -1; if (idx < 0) continue;
    // Walk backwards over whitespace
    let s = idx - 1;
    while (s >= 0) {
      const ch = text.charAt(s);
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
      s--;
    }
    const start = s + 1;
    pushRange(start, idx, `Whitespace trimmed by ${m[0]}`);
  }

  // Right-trim: -#> and EJS variants
  for (const m of text.matchAll(/-#>/g)) {
    const idx = m.index ?? -1; if (idx < 0) continue;
    const from = idx + m[0].length;
    // Walk forwards over whitespace
    let e = from;
    while (e < text.length) {
      const ch = text.charAt(e);
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
      e++;
    }
    pushRange(from, e, 'Whitespace trimmed by -#>');
  }

  // EJS right-trim: -%> and _%>
  for (const m of text.matchAll(/[-_]%>/g)) {
    const idx = m.index ?? -1; if (idx < 0) continue;
    const from = idx + m[0].length;
    // Walk forwards over whitespace
    let e = from;
    while (e < text.length) {
      const ch = text.charAt(e);
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
      e++;
    }
    pushRange(from, e, `Whitespace trimmed by ${m[0]}`);
  }

  editor.setDecorations(trimDecorationType, decos);
}

export async function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: 'template-js' },
      { language: 'template-html' },
      { language: 'template-typescript' },
      { language: 'template-markdown' },
    ],
    synchronize: {
      configurationSection: 'ftejs',
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{njs,nhtml,nts,nmd}')
    }
  };

  client = new LanguageClient('ftejsLanguageServer', 'fte.js Language Server', serverOptions, clientOptions);
  await client.start();
  context.subscriptions.push({ dispose: () => client?.stop() });

  // Decoration type for trimmed whitespace visualization
  trimDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    isWholeLine: false,
    border: '1px dashed rgba(200,160,0,0.50)'
  });

  // Commands to scaffold common constructs
  const insert = (snippet: string) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    editor.insertSnippet(new vscode.SnippetString(snippet));
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('ftejs.scaffold.block', () => insert(`<# block '\${1:name}' : #>\n$0\n<# end #>`)),
    vscode.commands.registerCommand('ftejs.scaffold.slot', () => insert(`<# slot '\${1:name}' : #>\n$0\n<# end #>`)),
    vscode.commands.registerCommand('ftejs.scaffold.chunkPair', () => insert(`<#- chunkStart('\${1:path}'); -#>\n$0\n<# chunkEnd(); -#>`)),
    vscode.commands.registerCommand('ftejs.scaffold.partial', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const name = await vscode.window.showInputBox({ prompt: 'Partial name (file base name without extension)', value: 'partial' });
      if (!name) return;
      const docUri = editor.document.uri;
      const baseDir = path.dirname(docUri.fsPath);
      const filePath = path.join(baseDir, `${name}.njs`);
      const scaffold = `<#@ context 'context' #>\n`;
      const wsedit = new vscode.WorkspaceEdit();
      try {
        const fileUri = vscode.Uri.file(filePath);
        const exists = await vscode.workspace.fs.stat(fileUri).then(() => true, () => false);
        if (!exists) {
          wsedit.createFile(fileUri, { ignoreIfExists: true });
          wsedit.insert(fileUri, new vscode.Position(0, 0), scaffold);
          await vscode.workspace.applyEdit(wsedit);
        }
        editor.insertSnippet(new vscode.SnippetString(`#{partial(context, '${name}')}\n`));
        const open = await vscode.window.showQuickPick(['Open partial', 'Skip'], { placeHolder: 'Open created partial?' });
        if (open === 'Open partial') {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to create partial: ${e}`);
      }
    }),
    // Toggle trimmed-whitespace visualizer
    vscode.commands.registerCommand('ftejs.toggleTrimVisualizer', async () => {
      trimVisualizerEnabled = !trimVisualizerEnabled;
      if (!trimVisualizerEnabled) {
        const ed = vscode.window.activeTextEditor;
        if (ed && trimDecorationType) ed.setDecorations(trimDecorationType, []);
        vscode.window.showInformationMessage('fte.js Trim Visualizer: Disabled');
      } else {
        vscode.window.showInformationMessage('fte.js Trim Visualizer: Enabled');
        scheduleUpdateTrimDecorations(vscode.window.activeTextEditor);
      }
    }),
    // Prompted refactors from server-provided actions
    vscode.commands.registerCommand('ftejs.refactor.toBlock', async (payload: { uri: string; range: { start: vscode.Position; end: vscode.Position } }) => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const name = await vscode.window.showInputBox({ prompt: 'Block name', value: 'extracted' }); if (!name) return;
      const selectionText = editor.document.getText(new vscode.Range(payload.range.start, payload.range.end));
      const blockDecl = `<# block '${name}' : #>\n${selectionText}\n<# end #>\n`;
      const ws = new vscode.WorkspaceEdit();
      ws.insert(editor.document.uri, new vscode.Position(payload.range.start.line, 0), blockDecl);
      ws.replace(editor.document.uri, new vscode.Range(payload.range.start, payload.range.end), `#{content('${name}')}`);
      await vscode.workspace.applyEdit(ws);
    }),
    vscode.commands.registerCommand('ftejs.refactor.toSlot', async (payload: { uri: string; range: { start: vscode.Position; end: vscode.Position } }) => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const name = await vscode.window.showInputBox({ prompt: 'Slot name', value: 'extracted' }); if (!name) return;
      const selectionText = editor.document.getText(new vscode.Range(payload.range.start, payload.range.end));
      const slotDecl = `<# slot '${name}' : #>\n${selectionText}\n<# end #>\n`;
      const ws = new vscode.WorkspaceEdit();
      ws.insert(editor.document.uri, new vscode.Position(payload.range.start.line, 0), slotDecl);
      ws.replace(editor.document.uri, new vscode.Range(payload.range.start, payload.range.end), `#{slot('${name}')}`);
      await vscode.workspace.applyEdit(ws);
    }),
    vscode.commands.registerCommand('ftejs.refactor.toPartial', async (payload: { uri: string; range: { start: vscode.Position; end: vscode.Position } }) => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const name = await vscode.window.showInputBox({ prompt: 'Partial name', value: 'extracted-partial' }); if (!name) return;
      editor.insertSnippet(new vscode.SnippetString(`#{partial(context, '${name}')}`), new vscode.Range(payload.range.start, payload.range.end));
    }),
    // Generators
    vscode.commands.registerCommand('ftejs.generator.nhtmlPage', async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const title = await vscode.window.showInputBox({ prompt: 'Page title', value: 'Title' }); if (title === undefined) return;
      const tpl = `<#@ context 'data' #>\n<!doctype html>\n<html>\n  <head>\n    <title>#{ data.title || '${title}' }</title>\n  </head>\n  <body>\n    <#- if (data.items?.length) { -#>\n      <ul>\n        <#- for (const it of data.items) { -#>\n          <li>!{ it }</li>\n        <#- } -#>\n      </ul>\n    <#- } else { -#>\n      <p>No items</p>\n    <#- } -#>\n  </body>\n</html>\n`;
      insert(tpl);
    }),
    vscode.commands.registerCommand('ftejs.generator.ntsClass', async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const className = await vscode.window.showInputBox({ prompt: 'Class name', value: 'MyClass' }); if (!className) return;
      const fields = await vscode.window.showInputBox({ prompt: 'Fields (comma separated name:type)', value: 'id:number,name:string' });
      const parsed = (fields || '').split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(':'));
      const body = parsed.map(([n,t]) => `  public ${n}: ${t};`).join('\n');
      const tpl = `<#@ context 'm' #>\nexport class ${className} {\n${body}\n}\n`;
      insert(tpl);
    }),
    // Static preview of chunks
    vscode.commands.registerCommand('ftejs.preview.chunks', async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const txt = editor.document.getText();
      const starts = [...txt.matchAll(/<#-\s*chunkStart\(\s*(["'`])([^"'`]+)\1\s*\);\s*-#>/g)];
      const chunks: { name: string; start: number; end: number }[] = [];
      for (let i = 0; i < starts.length; i++) {
        const name = starts[i][2];
        const from = starts[i].index ?? 0;
        const next = i + 1 < starts.length ? (starts[i + 1].index ?? txt.length) : txt.length;
        const endIdx = txt.indexOf('<# chunkEnd(); -#>', from) >= 0 ? txt.indexOf('<# chunkEnd(); -#>', from) : next;
        chunks.push({ name, start: from, end: endIdx >= 0 ? endIdx : next });
      }
      const panel = vscode.window.createWebviewPanel('ftejsPreview', 'fte.js Chunks Preview', vscode.ViewColumn.Beside, { enableScripts: false });
      const html = [`<h3>Detected chunks (static)</h3>`].concat(chunks.map(c => `<h4>${c.name}</h4><pre>${escapeHtml(txt.slice(c.start, c.end))}</pre>`)).join('\n');
      panel.webview.html = `<!doctype html><html><body>${html}</body></html>`;
      function escapeHtml(s: string) { return s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m] as string)); }
    }),
    // Live preview using fte.js-standalone
    vscode.commands.registerCommand('ftejs.preview.chunksLive', async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const fsPath = editor.document.uri.fsPath;
      try {
        const fte = require('fte.js-standalone');
        const Factory = fte.Factory || fte.default?.Factory || fte;
        const factory = new Factory({ root: [path.dirname(fsPath)], ext: ['.njs','.nhtml','.nts'], watch: false, preload: true });
        const name = path.basename(fsPath);
        const res = await factory.run({ title: 'Preview', items: ['A','B'] }, name);
        const panel = vscode.window.createWebviewPanel('ftejsPreviewLive', 'fte.js Chunks Preview (Live)', vscode.ViewColumn.Beside, { enableScripts: false });
        let html = `<h3>Result</h3>`;
        if (Array.isArray(res)) {
          html += res.map((c: any) => `<h4>${escapeHtml(c.name)}</h4><pre>${escapeHtml(Array.isArray(c.content)? c.content.join('\n') : String(c.content))}</pre>`).join('');
        } else if (typeof res === 'object') {
          html += Object.keys(res).map((k: string) => `<h4>${escapeHtml(k)}</h4><pre>${escapeHtml(String((res as any)[k]))}</pre>`).join('');
        } else {
          html += `<pre>${escapeHtml(String(res))}</pre>`;
        }
        panel.webview.html = `<!doctype html><html><body>${html}</body></html>`;
        function escapeHtml(s: string) { return s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m] as string)); }
      } catch (e) {
        vscode.window.showErrorMessage(`Live preview failed: ${e}`);
      }
    }),
    // Debug: inspect syntax scopes at current position
    vscode.commands.registerCommand('ftejs.debug.syntaxScopes', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const position = editor.selection.active;
      // Try to fetch semantic tokens legend or tokens; fallback to token inspection message
      let scopes: string[] = [];
      try {
        const res = await vscode.commands.executeCommand<any>(
          'vscode.provideDocumentSemanticTokensLegend',
          editor.document
        );
        if (res && Array.isArray(res.tokenTypes)) {
          scopes = res.tokenTypes as string[];
        }
      } catch {}
      const panel = vscode.window.createWebviewPanel(
        'ftejsSyntaxDebug',
        'Syntax Scopes at Position',
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = `<!doctype html><html><body>
        <h3>Position: Line ${position.line + 1}, Column ${position.character + 1}</h3>
        <h4>Scopes:</h4>
        <ul>${(scopes || []).map((s) => `<li>${s}</li>`).join('')}</ul>
        <p>Tip: You can also use the VSCode command <b>Developer: Inspect Editor Tokens and Scopes</b>.</p>
      </body></html>`;
    }),
    // Convert file to template (MUST_HAVE.md point 8)
    vscode.commands.registerCommand('ftejs.convertToTemplate', async () => {
      const editor = vscode.window.activeTextEditor; 
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }
      
      const src = editor.document.uri.fsPath;
      const ext = path.extname(src).toLowerCase();
      const baseName = path.basename(src, ext);
      const dirName = path.dirname(src);
      
      // Template extension mapping
      const map: Record<string,string> = { 
        '.ts': '.nts', 
        '.tsx': '.nts', 
        '.js': '.njs', 
        '.jsx': '.njs', 
        '.md': '.nmd', 
        '.html': '.nhtml', 
        '.htm': '.nhtml' 
      };
      
      const dstExt = map[ext];
      if (!dstExt) { 
        vscode.window.showWarningMessage(`Unsupported source type '${ext}' for template conversion. Supported: ${Object.keys(map).join(', ')}`); 
        return; 
      }
      
      // Ask user for confirmation and optional name customization
      const suggested = baseName + dstExt;
      const customName = await vscode.window.showInputBox({
        prompt: `Convert ${path.basename(src)} to fte.js template`,
        value: suggested,
        placeHolder: 'Template file name (with extension)',
        validateInput: (value) => {
          if (!value.trim()) return 'File name cannot be empty';
          if (!value.endsWith(dstExt)) return `Template file must have ${dstExt} extension`;
          return undefined;
        }
      });
      
      if (!customName) return; // User cancelled
      
      const dst = path.join(dirName, customName);
      const dstUri = vscode.Uri.file(dst);
      
      try {
        // Check if target file already exists
        const exists = await vscode.workspace.fs.stat(dstUri).then(() => true, () => false);
        if (exists) {
          const overwrite = await vscode.window.showWarningMessage(
            `File '${customName}' already exists. Overwrite?`,
            { modal: true },
            'Overwrite',
            'Cancel'
          );
          if (overwrite !== 'Overwrite') return;
        }
        
        // Copy file content
        const content = editor.document.getText();
        const buf = new TextEncoder().encode(content);
        await vscode.workspace.fs.writeFile(dstUri, buf);
        
        // Open the new template file
        const doc = await vscode.workspace.openTextDocument(dstUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        
        // Add template scaffold if file is empty or just has basic content
        const needsScaffold = content.trim().length === 0 || !content.includes('<#@');
        if (needsScaffold) {
          const contextVar = dstExt === '.nhtml' ? 'data' : 'context';
          const scaffold = `<#@ context '${contextVar}' #>\n`;
          const edit = new vscode.WorkspaceEdit();
          edit.insert(dstUri, new vscode.Position(0, 0), scaffold);
          await vscode.workspace.applyEdit(edit);
        }
        
        vscode.window.showInformationMessage(
          `Template created: ${customName}`,
          'Show in Explorer'
        ).then(action => {
          if (action === 'Show in Explorer') {
            vscode.commands.executeCommand('revealFileInOS', dstUri);
          }
        });
        
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to convert file: ${e}`);
      }
    })
  );

  // Update decorations on editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(ed => scheduleUpdateTrimDecorations(ed)),
    vscode.workspace.onDidChangeTextDocument(ev => {
      if (vscode.window.activeTextEditor && ev.document === vscode.window.activeTextEditor.document) {
        scheduleUpdateTrimDecorations(vscode.window.activeTextEditor);
      }
    })
  );

  // Initial update
  scheduleUpdateTrimDecorations(vscode.window.activeTextEditor);
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

```

`client/package.json`

```json
{
  "name": "ftejs-client",
  "private": true,
  "version": "0.0.1",
  "main": "out/extension.js",
  "scripts": {
    "build": "tsc -b",
    "watch": "tsc -w"
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "@types/node": "^20.12.8",
    "@types/vscode": "^1.96.0"
  }
}

```

`client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vscode"]
  },
  "include": ["src"],
  "exclude": ["node_modules", ".vscode-test"]
}

```

`server/src/astUtils.ts`

```ts
export type AstNode = {
  type: string
  pos: number
  start?: string
  end?: string
  name?: string
  blockName?: string
  slotName?: string
  content?: string
};

export type OpenBlock = {
  trimmedOpen: boolean
  trimmedClose: boolean
  name: string
  index: number
};

export function computeOpenBlocksFromAst(nodes: AstNode[], upTo?: number): OpenBlock[] {
  const limit = typeof upTo === 'number' ? upTo : Number.POSITIVE_INFINITY;
  const stack: OpenBlock[] = [];
  for (const node of nodes) {
    const pos = typeof node.pos === 'number' ? node.pos : 0;
    if (pos >= limit) break;
    if (node.type === 'blockStart' || node.type === 'slotStart') {
      const start = String(node.start || '');
      const end = String(node.end || '');
      const name = String(node.name || node.blockName || node.slotName || '');
      const trimmedOpen = start.startsWith('<#-');
      const trimmedClose = /-#>$/.test(end);
      stack.push({ trimmedOpen, trimmedClose, name, index: pos });
    } else if (node.type === 'end') {
      if (stack.length) stack.pop();
    }
  }
  return stack;
}

export function buildEndTagFor(item: OpenBlock): string {
  const openTrim = item.trimmedOpen ? '-' : '';
  const closeTrim = item.trimmedClose ? '-' : '';
  return `<#${openTrim} end ${closeTrim}#>`;
}

// Compute block pairing using raw token stream from parser main nodes.
// This is robust to adjacent end/start like "#>#<#" because we scan linear nodes by positions.
export function computePairsFromAst(nodes: AstNode[]) {
  const pairs: Array<{ open: AstNode; close?: AstNode }> = [];
  const stack: AstNode[] = [];
  for (const n of nodes) {
    if (n.type === 'blockStart' || n.type === 'slotStart') {
      stack.push(n);
    } else if (n.type === 'end') {
      const open = stack.pop();
      if (open) pairs.push({ open, close: n });
    }
  }
  // Unclosed remain without close
  while (stack.length) {
    const open = stack.pop()!;
    pairs.push({ open });
  }
  return pairs;
}



```

`server/src/diagnosticsCore.ts`

```ts
import * as fs from 'fs';
import * as path from 'path';

export type SimpleDiagnostic = {
  severity: 'error' | 'warning' | 'hint'
  message: string
};

export function computeDiagnosticsFromText(text: string, workspaceRoots: string[] = []): SimpleDiagnostic[] {
  const diags: SimpleDiagnostic[] = [];

  // Unmatched end: more end tags than opened
  try {
    const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
    const endRe = /<#\s*-?\s*end\s*-?\s*#>/g;
    let opens = 0;
    let ends = 0;
    while (openRe.exec(text)) opens += 1;
    while (endRe.exec(text)) ends += 1;
    if (ends > opens) {
      diags.push({ severity: 'error', message: 'Unmatched end' });
    }
  } catch {}

  // Duplicate block/slot declarations
  try {
    const seen: Record<string, number> = {};
    const kind: Record<string, 'block' | 'slot'> = {};
    const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = rxDecl.exec(text))) {
      const name = d[3];
      seen[name] = (seen[name] || 0) + 1;
      kind[name] = (d[1] as 'block' | 'slot');
    }
    for (const n of Object.keys(seen)) {
      if (seen[n] > 1) {
        diags.push({ severity: 'warning', message: `Duplicate ${kind[n]} declaration: ${n}` });
      }
    }
  } catch {}

  // Unknown content('name') references
  try {
    const declared = new Set<string>();
    const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = rxDecl.exec(text))) {
      declared.add(d[3]);
    }
    const rxUse = /content\(\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = rxUse.exec(text))) {
      const name = m[2];
      if (!declared.has(name)) {
        diags.push({ severity: 'warning', message: `Unknown block name: ${name}` });
      }
    }
  } catch {}

  // Unresolved partial alias/path
  try {
    const rp = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = rp.exec(text))) {
      const key = m[2];
      const bases = [ ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates')) ];
      const exists = (rel: string) => {
        for (const base of bases) {
          const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
          const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
          for (const v of variants) { if (fs.existsSync(v)) return true; }
        }
        return false;
      };
      if (!exists(key)) {
        diags.push({ severity: 'warning', message: `Unresolved partial: ${key}` });
      }
    }
  } catch {}

  return diags;
}



```

`server/src/formatterCore.ts`

```ts
export type FormatItem = { type: string; start: string; end: string; content: string };
export type FormatSettings = { format?: { textFormatter?: boolean; codeFormatter?: boolean; keepBlankLines?: number } };

// Note: We intentionally preserve the original token order. No reordering.

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

  // Main algorithm: iterate through all tokens in their original order
  for (const token of tokens) {
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
      
      case 'directive':
        // Preserve directives exactly where they appear; do not reorder or re-indent
        flushTextChunk();
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



```

`server/src/parser.ts`

```ts
// Local copy of fte.js-parser essential parts for AST-based parsing
// This ensures all syntax parsing operations use consistent AST approach

export type ResultTypes =
  | 'unknown'
  | 'expression'
  | 'uexpression'
  | 'expression2'
  | 'uexpression2'
  | 'code'
  | 'directive'
  | 'comments'
  | 'slotStart'
  | 'blockStart'
  | 'blockEnd'
  | 'text'
  | 'skip'
  | 'empty'

export interface ParserResult {
  data: string
  pos: number
  line: number
  column: number
  type: ResultTypes
  start: string
  end: string
  eol: boolean
}

export interface Items {
  content: string
  indent?: string
  pos: number
  line: number
  column: number
  start: string
  end: string
  eol: boolean
  type: ResultTypes
  name?: string
}

export interface ParserError { message: string; pos: number; line: number; column: number }

type StateDefinition = {
  start?: Array<string>
  end?: Array<string>
  skip?: {
    start?: Array<string>
    end?: Array<string>
  }
  states?: Array<ResultTypes>
  curly?: 0 | 1 | 2
  type?: { [key: string]: ResultTypes }
}

const globalStates: { [key: string]: StateDefinition } = {
  text: {
    states: [
      'unknown',
      'expression',
      'uexpression',
      'code',
      'directive',
      'slotStart',
      'blockStart',
      'blockEnd',
      'comments',
    ],
  },
  unknown: {
    start: ['<%', '<%=', '<%-', '<%_', '<%#'],
    end: ['%>', '-%>', '_%>'],
    skip: {
      start: ['<%%'],
      end: ['%%>'],
    },
    type: {
      '<%': 'code',
      '<%=': 'uexpression',
      '<%-': 'expression',
      '<%#': 'comments',
      '<%_': 'code',
    },
  },
  expression: {
    start: ['#{'],
    end: ['}'],
    curly: 1,
  },
  uexpression: {
    start: ['!{'],
    end: ['}'],
    curly: 1,
  },
  code: {
    start: ['<#', '<#-'],
    end: ['#>', '-#>'],
    skip: {
      start: ['<#@', '<# block', '<# slot', '<# end #>', '<#{'],
    },
  },
  directive: {
    start: ['<#@'],
    end: ['#>', '-#>'],
  },
  comments: {
    start: ['<*'],
    end: ['*>'],
  },
  blockStart: {
    start: ['<# block', '<#- block'],
    end: [': #>', ': -#>'],
  },
  slotStart: {
    start: ['<# slot', '<#- slot'],
    end: [': #>', ': -#>'],
  },
  blockEnd: {
    start: ['<# end #>', '<#- end #>', '<# end -#>', '<#- end -#>'],
  },
}

export class CodeBlock {
  name!: string
  main: Array<Items> = []
  slots: { [slot: string]: CodeBlock } = {}
  blocks: { [block: string]: CodeBlock } = {}
  // Declaration info for navigation
  declPos?: number
  declStart?: string
  declContent?: string
  declEnd?: string
  
  constructor(init?: ParserResult) {
    if (init) {
      this.name = this.unquote(init.data)
      this.declPos = init.pos
      this.declStart = init.start
      this.declContent = init.data
      this.declEnd = init.end
    }
  }
  
  addBlock(block: CodeBlock) {
    this.blocks[block.name] = block
  }
  
  addSlot(slot: CodeBlock) {
    this.slots[slot.name] = slot
  }
  
  private unquote(str?: string) {
    if (str) {
      let res = str.trim()
      res = res.match(/['"`]([^`'"].*)[`'"]/)?.[1] ?? res
      return res
    }
    return ''
  }
}

function sub(buffer: string, str: string, pos: number = 0, size?: number) {
  if (!size) {
    size = buffer.length
  }
  const len = str.length
  const from = pos
  const to = pos + len
  if (to <= size) {
    let res = ''
    for (let i = from; i < to; i += 1) {
      res += buffer[i]
    }
    return res
  }
  return ''
}

// Expose SUB for compatibility tests with upstream fte.js-parser
export function SUB(buffer: string, str: string, pos: number = 0, size?: number) {
  return sub(buffer, str, pos, size)
}

export class Parser {
  private buffer: string
  private size: number
  private static INITIAL_STATE: ResultTypes = 'text'
  private globalState: ResultTypes
  private actualState?: ResultTypes | null
  private globalToken!: ParserResult
  private pos = 0
  private line = 1
  private column = 1
  private curlyAware: 0 | 1 | 2 | undefined = 0
  private curlyBalance: Array<number> = []
  private result: Array<ParserResult> = []
  private errors: Array<ParserError> = []

  public static parse(text: string, options: { indent?: number } = {}) {
    const parser = new Parser(text, options)
    parser.parse()
    return parser.process()
  }

  private constructor(value: string, options: { indent?: number }) {
    this.globalState = Parser.INITIAL_STATE
    this.buffer = value.toString()
    this.size = this.buffer.length
  }

  private collect() {
    const { term, eol } = this.symbol()
    if (eol) {
      this.globalToken.eol = true
      this.term()
    } else {
      this.globalToken.data += term
    }
  }

  private run(currentState: ResultTypes) {
    const init_pos = this.pos
    const state = globalStates[currentState]
    this.curlyAware = state.curly
    
    if (state.start) {
      if (state.skip?.start) {
        for (let i = 0; i < state.skip.start.length; i += 1) {
          if (this.SUB(state.skip.start[i]) == state.skip.start[i]) {
            return false
          }
        }
      }
      
      let foundStart = false
      let foundEnd = false
      for (let i = state.start.length - 1; i >= 0; i -= 1) {
        const p = state.start[i]
        const subs = this.SUB(p).toLowerCase()
        if (subs == p) {
          foundStart = true
          this.globalState = currentState
          this.actualState = state.type?.[p] ?? currentState
          this.term({ start: p })
          this.SKIP(p)
          break
        }
      }
      
      if (foundStart)
        do {
          if (state.end) {
            let i
            for (i = state.end.length - 1; i >= 0; i -= 1) {
              const p = state.end[i]
              if (state.curly == 1 && p.indexOf('}') > -1) {
                if (this.curlyBalance.length > 0) {
                  break
                }
              }
              const subs = this.SUB(p).toLowerCase()
              if (subs == p) {
                this.SKIP(p)
                foundEnd = true
                break
              }
            }
            if (!foundEnd) {
              this.collect()
            } else {
              this.globalToken.end = state.end[i]
              this.actualState = null
            }
          } else {
            foundEnd = true
          }
        } while (!foundEnd && this.pos < this.size)
    } else if (state.states) {
      let found = false
      for (let i = state.states.length - 1; i >= 0; i -= 1) {
        const name = state.states[i]
        found = this.run(name)
        if (found) {
          this.globalState = currentState
          this.actualState = null
          this.term()
          break
        }
      }
      if (!found) {
        this.collect()
      }
    }
    return init_pos != this.pos
  }

  private parse() {
    if (this.size > 0) {
      this.term()
      do {
        this.run(this.globalState)
      } while (this.pos < this.size)
      this.term()
    }
  }

  private process() {
    const content = new CodeBlock()
    const resultSize = this.result.length
    let curr = content
    const tokens: Items[] = []
    const stack: Array<{ type: 'block' | 'slot'; name: string; pos: number; line: number; column: number }> = []
    const unquote = (str?: string) => {
      if (!str) return ''
      const m = str.match(/['"`]\s*([^'"`]+?)\s*['"`]/)
      return m ? m[1] : str.trim()
    }

    for (let i = 0; i < resultSize; i += 1) {
      const r = this.result[i]
      let data = r.data
      const { pos, line, column, start, end, eol, type } = r

      switch (type) {
        case 'blockStart':
          // push token for opener with extracted name
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
            name: unquote(data),
          })
          curr = new CodeBlock(r)
          content.addBlock(curr)
          // track for error reporting
          stack.push({ type: 'block', name: unquote(data), pos, line, column })
          break
        case 'slotStart':
          // push token for slot opener with extracted name
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
            name: unquote(data),
          })
          curr = new CodeBlock(r)
          content.addSlot(curr)
          stack.push({ type: 'slot', name: unquote(data), pos, line, column })
          break
        case 'blockEnd':
          // push token for end
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
          })
          if (stack.length === 0) {
            this.errors.push({ message: 'Unmatched end tag', pos, line, column })
          } else {
            stack.pop()
          }
          curr = content
          break
        case 'code':
        case 'expression':
        case 'uexpression':
        case 'text':
        case 'directive':
        case 'comments':
          const item: Items = {
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type: type === 'uexpression' ? 'expression' : type,
            eol,
          }
          // push into flat token stream preserving order
          tokens.push(item)
          curr.main.push(item)
          break
      }
    }
    ;(content as any).tokens = tokens
    // any unclosed blocks/slots
    if (stack.length > 0) {
      for (const it of stack) {
        const kind = it.type === 'slot' ? 'slot' : 'block'
        this.errors.push({ message: `Unclosed ${kind}: '${it.name}'`, pos: it.pos, line: it.line, column: it.column })
      }
    }
    ;(content as any).errors = this.errors
    return content
  }

  private symbol() {
    const res = this.buffer[this.pos]
    if (this.curlyAware == 1) {
      if (~res.indexOf('{')) {
        this.curlyBalance.push(this.pos)
      } else if (~res.indexOf('}')) {
        this.curlyBalance.pop()
      }
    }
    return this.SKIP(res)
  }

  private SKIP(term: string) {
    let eol = false
    if (term.length == 1) {
      if (term == '\n' || term == '\r' || term == '\u2028' || term == '\u2029') {
        if (term == '\r' && this.SUB('\r\n') == '\r\n') {
          term = '\r\n'
        }
        this.column = 1
        this.line += 1
        eol = true
      } else if (term == '\t') {
        this.column += 2 // default tab size
      } else {
        this.column += 1
      }
      this.pos += term.length
    } else {
      const startPos = this.pos
      let nTerm = ''
      do {
        nTerm += this.SKIP(this.buffer[this.pos])
      } while (this.pos < startPos + term.length)
      term = nTerm
    }
    return { term, eol }
  }

  private block(extra: Partial<ParserResult> = {}): ParserResult {
    const { pos, line, column, globalState, actualState } = this
    return {
      data: '',
      pos,
      line,
      column,
      type: actualState || globalState,
      start: '',
      end: '',
      eol: false,
      ...extra,
    }
  }

  private SUB(str: string) {
    return sub(this.buffer, str, this.pos, this.size)
  }

  private term(extra = {}) {
    this.globalToken = this.block(extra)
    this.result.push(this.globalToken)
  }
}

```

`server/src/semanticTokens.ts`

```ts
import { Parser } from './parser'

export const semanticTokenTypes = [
  'namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter',
  'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method',
  'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'
] as const

export type TokenType = typeof semanticTokenTypes[number]

export const semanticTokenModifiers = [
  'declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'
] as const

export type TokenModifier = typeof semanticTokenModifiers[number]

export type BuiltToken = { line: number; char: number; length: number; type: TokenType; modifiers?: TokenModifier[] }

export function buildSemanticTokensFromText(text: string): BuiltToken[] {
  const ast: any = Parser.parse(text)
  return buildSemanticTokensFromAst(text, ast)
}

export function buildSemanticTokensFromAst(text: string, ast: any): BuiltToken[] {
  if (!ast || !Array.isArray(ast.main)) return []
  const tokens: BuiltToken[] = []

  const add = (from: number, to: number, type: TokenType, mods?: TokenModifier[]) => {
    if (from >= to) return
    const start = offsetToPos(text, from)
    tokens.push({ line: start.line, char: start.character, length: Math.max(1, to - from), type, modifiers: mods })
  }

  for (const node of (ast as any).tokens || ast.main) {
    const startLen = (node.start || '').length
    const contentLen = (node.content || '').length
    const endLen = (node.end || '').length
    const startOff = node.pos ?? 0

    const contentOff = startOff + startLen
    const endOff = contentOff + contentLen

    switch (node.type) {
      case 'directive':
        // <#@ ... #>
        add(startOff, startOff + startLen, 'operator')
        // highlight directive name as keyword within content
        {
          const c = String(node.content || '')
          const m = c.match(/^\s*(\w+)/)
          if (m) {
            const kwStart = contentOff + (m.index || 0)
            add(kwStart, kwStart + m[1].length, 'macro', ['declaration'])
          }
        }
        add(endOff, endOff + endLen, 'operator')
        break
      case 'expression':
        // #{ ... } and !{ ... }
        add(startOff, startOff + startLen, 'operator')
        add(endOff, endOff + endLen, 'operator')
        break
      case 'blockStart':
      case 'slotStart': {
        // <# block 'name' : #>
        add(startOff, startOff + startLen, 'operator')
        const c = String(node.content || '')
        // keyword
        {
          const m = c.match(/^(\s*)(block|slot)\b/)
          if (m) {
            const kwStart = contentOff + (m[1]?.length || 0)
            add(kwStart, kwStart + (m[2]?.length || 0), 'keyword', ['declaration'])
          }
        }
        // quoted name as string
        const nameMatch = c.match(/['"`][^'"`]+['"`]/)
        if (nameMatch) {
          const nameStart = contentOff + (nameMatch.index || 0)
          add(nameStart, nameStart + nameMatch[0].length, 'string')
        }
        add(endOff, endOff + endLen, 'operator')
        break
      }
      case 'blockEnd':
        add(startOff, startOff + startLen, 'operator')
        // 'end' keyword in content
        {
          const c = String(node.content || '')
          const m = c.match(/\bend\b/)
          if (m) {
            const kwStart = contentOff + (m.index || 0)
            add(kwStart, kwStart + 3, 'keyword')
          }
        }
        add(endOff, endOff + endLen, 'operator')
        break
      case 'comments':
        add(startOff, endOff + endLen, 'comment')
        break
      case 'code': {
        // Recognize helper function names as functions
        const c = String(node.content || '')
        const helpers = ['partial', 'content', 'slot', 'chunkStart', 'chunkEnd']
        for (const h of helpers) {
          const re = new RegExp(String.raw`\b${h}\b`, 'g')
          let m: RegExpExecArray | null
          while ((m = re.exec(c))) {
            const s = contentOff + (m.index || 0)
            add(s, s + h.length, 'function')
          }
        }
        break
      }
      default:
        break
    }
  }

  return tokens
}

function offsetToPos(text: string, offset: number): { line: number; character: number } {
  let line = 0
  let character = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 10 /*\n*/) { line++; character = 0 } else { character++ }
  }
  return { line, character }
}

```

`server/src/server.ts`

```ts
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
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import * as prettier from 'prettier';
import { formatSegments, formatWithSourceWalking } from './formatterCore';
import { computeOpenBlocksFromAst, buildEndTagFor, computePairsFromAst } from './astUtils';
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
  if (ast && Array.isArray(ast.main)) {
    for (const node of ast.main as any[]) {
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
    }
  } else {
    // Fallback to regex if AST parsing fails
    const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
    let m: RegExpExecArray | null;
    while ((m = rxDecl.exec(text))) {
      const name = m[3];
      const range = { start: m.index, end: m.index + m[0].length };
      if (m[1] === 'block') blocks.set(name, range); else slots.set(name, range);
    }
  }
  // Extract requireAs directives from AST or fallback to regex
  if (ast && Array.isArray(ast.main)) {
    for (const node of ast.main as any[]) {
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
    }
  } else {
    // Fallback to regex
    const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = dirRe.exec(text))) {
      const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
      if (params.length >= 2) requireAs.set(params[1], params[0]);
    }
  }
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
  'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs', 'lang'
];

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
function collectAllASTSegments(ast: any): any[] {
  if (!ast) return [];
  
  const allSegments: any[] = [];
  
  // First, collect all segments with their positions
  const segmentsByPos: Array<{ pos: number; segment: any; source: string }> = [];
  
  // Add main segments
  for (const item of ast.main || []) {
    segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'main' });
  }
  
  // Add block segments - need to reconstruct opening/closing tags
  for (const [blockName, block] of Object.entries<any>(ast.blocks || {})) {
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
  for (const [slotName, slot] of Object.entries<any>(ast.slots || {})) {
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
function getExtendTargetFrom(text: string, docUri?: string): string | null {
  // Try AST-based approach first
  const ast = parseContent(text);
  if (ast && Array.isArray(ast.main)) {
    for (const node of ast.main as any[]) {
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
  if (!rel) return null;
  return resolveTemplatePath(rel, docUri);
}

function resolveTemplatePath(rel: string, docUri?: string): string | null {
  try {
    const currentDir = docUri && docUri.startsWith('file:') ? path.dirname(url.fileURLToPath(docUri)) : process.cwd();
    const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
    for (const base of bases) {
      const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
      const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
      for (const v of variants) { if (fs.existsSync(v)) return v; }
    }
  } catch {}
  return null;
}

function computeDiagnostics(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const diags: Diagnostic[] = [];
  // AST-driven structural validation
  const ast: any = parseContent(text);
  if (!ast || !Array.isArray(ast.main)) {
    diags.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(Position.create(0, 0), Position.create(0, 1)),
      message: 'Parse error',
      source: 'fte.js'
    });
  } else {
    try {
      type StackItem = { name: string; pos: number };
      const stack: StackItem[] = [];
      // Validate naming of blocks/slots
      const nameIsValid = (s: string) => /^[A-Za-z_][\w.-]*$/.test(s);
      for (const n of ast.main as any[]) {
        if (n.type === 'blockStart' || n.type === 'slotStart') {
          const nm = String(n.name || n.blockName || n.slotName || '');
          if (nm && !nameIsValid(nm)) {
            const from = doc.positionAt(n.pos);
            const to = doc.positionAt(n.pos + String(n.start || '').length);
            diags.push({ severity: DiagnosticSeverity.Error, range: { start: from, end: to }, message: `Invalid ${n.type === 'blockStart' ? 'block' : 'slot'} name: ${nm}`, source: 'fte.js' });
          }
          stack.push({ name: nm, pos: n.pos });
        } else if (n.type === 'end') {
          if (stack.length === 0) {
            const len = (text.slice(n.pos).match(/^<#-?\s*end\s*-?#>/)?.[0]?.length) || 5;
            const start = doc.positionAt(n.pos);
            const end = doc.positionAt(n.pos + len);
            diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: 'Unmatched end', source: 'fte.js' });
          } else {
            stack.pop();
          }
        }
      }
      for (const it of stack) {
        const start = doc.positionAt(it.pos);
        const end = doc.positionAt(it.pos + 1);
        diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: `Unclosed ${it.name}`, source: 'fte.js' });
      }
      // report parser internal errors (unmatched/unclosed)
      if (Array.isArray((ast as any).errors)) {
        for (const e of (ast as any).errors) {
          const pos = doc.positionAt(e.pos || 0);
          diags.push({ severity: DiagnosticSeverity.Error, range: { start: pos, end: pos }, message: e.message, source: 'fte.js' });
        }
      }
    } catch {}
  }

  // Unknown content('name') references
  try {
    const ast = parseContent(text) as any;
    const known = new Set<string>(Object.keys(ast?.blocks || {}));
    // include blocks from parent template if extends
    const parentAbs = getExtendTargetFrom(text, doc.uri);
    if (parentAbs) {
      try {
        const src = fs.readFileSync(parentAbs, 'utf8');
        const pAst = parseContent(src) as any;
        for (const k of Object.keys(pAst?.blocks || {})) known.add(k);
      } catch {}
    }
    // scan only inside expr/code nodes to avoid false positives in text
    const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
    const partialRe = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
    type Hit = { index: number; match: RegExpExecArray };
    const contentHits: Hit[] = [];
    const partialHits: Hit[] = [];
    if (ast?.main) {
      for (const n of ast.main as any[]) {
        if (n && (n.type === 'expr' || n.type === 'code')) {
          contentRe.lastIndex = 0; partialRe.lastIndex = 0;
          let mm: RegExpExecArray | null;
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
        diags.push({ severity: DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Unknown block name: ${name}`, source: 'fte.js' });
      }
    }
    // unresolved partial alias/path (also scan via AST-bound hits)
    for (const ph of partialHits) {
      const key = ph.match[2];
      // try local requireAs map
      const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g; let d: RegExpExecArray | null; const local = new Map<string,string>();
      while ((d = dirRe.exec(text))) {
        const params = d[1].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''));
        if (params.length >= 2) local.set(params[1], params[0]);
      }
      let target = local.get(key) || key;
      if (target === key) {
        for (const [, info] of fileIndex) { const mapped = info.requireAs.get(key); if (mapped) { target = mapped; break; } }
      }
      const bases = [ ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates')) ];
      const exists = (rel: string) => {
        for (const base of bases) {
          const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
          const variants = [p, p + '.njs', p + '.nhtml', p + '.nts'];
          for (const v of variants) { if (fs.existsSync(v)) return true; }
        }
        return false;
      };
      if (!exists(target)) {
        const from = doc.positionAt(ph.index);
        const to = doc.positionAt(ph.index + ph.match[0].length);
        diags.push({ severity: DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Unresolved partial: ${key}`, source: 'fte.js' });
      }
    }
  } catch (e) { logError(e, 'computeDiagnostics.content'); }

  // Duplicate block/slot declarations (AST based)
  try {
    const seen: Record<string, number> = {};
    const ast2: any = parseContent(text);
    if (ast2?.main) {
      for (const n of ast2.main as any[]) {
        if (n.type === 'blockStart' || n.type === 'slotStart') {
          const name = String(n.name || n.blockName || n.slotName || '');
          seen[name] = (seen[name] || 0) + 1;
          if (seen[name] > 1) {
            const from = doc.positionAt(n.pos);
            const to = doc.positionAt(n.pos + String(n.start || '').length || 1);
            diags.push({ severity: DiagnosticSeverity.Warning, range: { start: from, end: to }, message: `Duplicate ${n.type === 'blockStart' ? 'block' : 'slot'} declaration: ${name}`, source: 'fte.js' });
          }
        }
      }
    }
  } catch {}

  // Directive validation
  // Trim hints: suggest using <#- or -#> when only whitespace is around
  try {
    const leftRx = /(\n?)([ \t]*)<#/g;
    let ml: RegExpExecArray | null;
    while ((ml = leftRx.exec(text))) {
      // skip directives <#@
      if (text.slice(ml.index, ml.index + 3) === '<#@') continue;
      // skip structural tags <# block|slot|end
      const tail = text.slice(ml.index, ml.index + 12);
      if (/^<#-?\s*(block|slot|end)\b/.test(tail)) continue;
      const dash = text.slice(ml.index, ml.index + 3) === '<#-';
      if (dash) continue;
      const prev = text[ml.index - 1] || '\n';
      const atLineStart = prev === '\n' || ml.index === 0;
      if (atLineStart && ml[2].length >= 0) {
        const start = doc.positionAt(ml.index);
        const end = doc.positionAt(ml.index + 2);
        diags.push({ severity: DiagnosticSeverity.Warning, range: { start, end }, message: "Consider '<#-' to trim leading whitespace", source: 'fte.js' });
      }
    }
    const rightRx = /#>([ \t]*)(\r?\n)/g;
    let mr: RegExpExecArray | null;
    while ((mr = rightRx.exec(text))) {
      // skip directive endings
      const openPos = text.lastIndexOf('<#', mr.index);
      if (openPos >= 0 && text[openPos + 2] === '@') continue;
      // skip structural tags <# block|slot|end ... #>
      if (openPos >= 0) {
        const tail = text.slice(openPos, openPos + 12);
        if (/^<#-?\s*(block|slot|end)\b/.test(tail)) continue;
      }
      const prevTwo = text.slice(mr.index - 2, mr.index);
      const dash = prevTwo === '-#';
      if (dash) continue;
      const start = doc.positionAt(mr.index);
      const end = doc.positionAt(mr.index + 2);
      diags.push({ severity: DiagnosticSeverity.Warning, range: { start, end }, message: "Consider '-#>' to trim trailing whitespace", source: 'fte.js' });
    }
  } catch {}

  // Validate extend directive and parent template existence (MUST_HAVE.md point 14)
  try {
    const ast = parseContent(text) as any;
    if (ast && Array.isArray(ast.main)) {
      for (const node of ast.main as any[]) {
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
                  severity: DiagnosticSeverity.Error, 
                  range: { start, end }, 
                  message: `Parent template not found: ${rel}`, 
                  source: 'fte.js' 
                });
              } else {
                // Check if parent template is accessible
                try {
                  fs.accessSync(resolvedPath, fs.constants.R_OK);
                } catch {
                  const start = doc.positionAt(node.pos);
                  const end = doc.positionAt(node.pos + (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length));
                  diags.push({ 
                    severity: DiagnosticSeverity.Error, 
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
  } catch (e) { 
    logError(e, 'computeDiagnostics.extendValidation'); 
  }

  // Validate blocks used in child templates exist in parent chain
  try {
    const ast = parseContent(text) as any;
    const parentAbs = getExtendTargetFrom(text, doc.uri);
    if (parentAbs && ast?.main) {
      // Get all parent blocks
      const parentBlocks = new Set<string>();
      try {
        const parentSrc = fs.readFileSync(parentAbs, 'utf8');
        const parentAst = parseContent(parentSrc) as any;
        if (parentAst?.blocks) {
          for (const blockName of Object.keys(parentAst.blocks)) {
            parentBlocks.add(blockName);
          }
        }
      } catch {}
      
      // Check if child template uses blocks that don't exist in parent
      const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
      let m: RegExpExecArray | null;
      while ((m = contentRe.exec(text))) {
        const blockName = m[2];
        const localBlock = ast?.blocks?.[blockName];
        
        // If block is used via content() but not defined locally and not in parent
        if (!localBlock && !parentBlocks.has(blockName)) {
          const start = doc.positionAt(m.index);
          const end = doc.positionAt(m.index + m[0].length);
          diags.push({ 
            severity: DiagnosticSeverity.Error, 
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
            const blockNode = (blockInfo as any);
            if (blockNode && blockNode.declPos !== undefined) {
              const start = doc.positionAt(blockNode.declPos);
              const end = doc.positionAt(blockNode.declPos + 10); // approximate end
              diags.push({ 
                severity: DiagnosticSeverity.Information,
                range: { start, end }, 
                message: `Block '${blockName}' is declared in child template but does not exist in parent template. This creates a new block.`, 
                source: 'fte.js' 
              });
            }
          }
        }
      }
    }
  } catch (e) { 
    logError(e, 'computeDiagnostics.parentBlockValidation'); 
  }

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
      case 'lang':
        // lang directive supports both forms: <#@ lang = c# #> or <#@ lang(c#) #>
        if (params.length < 1) {
          diags.push({ severity: DiagnosticSeverity.Warning, range, message: 'Directive lang requires 1 parameter or assignment', source: 'fte.js' });
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
  // MUST_USE_PARSER: compute pairs strictly via AST; no regex fallbacks
  const ast = parseContent(text) as any;
  const limit = upTo ?? text.length;
  if (ast && Array.isArray(ast.main)) {
    return computeOpenBlocksFromAst(ast.main as any[], limit);
  }
  return [];
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
      ...DIRECTIVES.map((d) => ({
        label: d,
        kind: CompletionItemKind.Keyword,
        documentation: usageDocs.directives[d] || undefined
      }))
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
    const f = (name: string) => ({
      label: name,
      kind: CompletionItemKind.Function,
      documentation: usageDocs.functions[name] || undefined
    } as CompletionItem);
    items.push(f('content'), f('partial'), f('slot'), f('chunkStart'), f('chunkEnd'));
    // suggest known block/slot names inside string literal argument
    const argPrefix = before.match(/content\(\s*(["'`])([^"'`]*)$/) || before.match(/slot\(\s*(["'`])([^"'`]*)$/);
    if (argPrefix) {
      const ast = parseContent(text) as any;
      const seen = new Set<string>(Object.keys(ast?.blocks || {}));
      // include parent via extend
      const parentAbs = getExtendTargetFrom(text, textDocument.uri);
      if (parentAbs) {
        try {
          const src = fs.readFileSync(parentAbs, 'utf8');
          const pAst = parseContent(src) as any;
          for (const k of Object.keys(pAst?.blocks || {})) seen.add(k);
        } catch {}
      }
      // include project index (workspace)
      for (const [, info] of fileIndex) {
        for (const k of info.blocks.keys()) seen.add(k);
      }
      for (const name of seen) {
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
      const ast = parseContent(text) as any;
      // Use AST-based search instead of RegExp to find correct block
      if (ast?.blocks?.[blockName]) {
        const block = ast.blocks[blockName];
        // Use declPos from AST if available (more reliable than RegExp)
        if (block.declPos !== undefined) {
          const declStart = doc.positionAt(block.declPos);
          // Calculate end position based on declaration parts
          const declLength = (block.declStart || '').length + (block.declContent || '').length + (block.declEnd || '').length;
          const declEnd = doc.positionAt(block.declPos + declLength);
          return Location.create(textDocument.uri, Range.create(declStart, declEnd));
        }
        // Fallback to first inner item if declPos not available
        const first = ast.blocks[blockName].main?.[0];
        if (first) {
          return Location.create(textDocument.uri, Range.create(doc.positionAt(first.pos), doc.positionAt(first.pos + first.content.length)));
        }
      }
      // If not found locally, try parent via extend
      const parentAbs = getExtendTargetFrom(text, textDocument.uri);
      if (parentAbs) {
        try {
          const src = fs.readFileSync(parentAbs, 'utf8');
          const pAst = parseContent(src) as any;
          if (pAst?.blocks?.[blockName]) {
            // Try to use declPos from parent AST if available
            const parentBlock = pAst.blocks[blockName];
            if (parentBlock.declPos !== undefined) {
              const uri = 'file://' + parentAbs;
              const declStart = posFromOffset(src, parentBlock.declPos);
              const declLength = (parentBlock.declStart || '').length + (parentBlock.declContent || '').length + (parentBlock.declEnd || '').length;
              const declEnd = posFromOffset(src, parentBlock.declPos + declLength);
              return Location.create(uri, Range.create(declStart, declEnd));
            }
            // Fallback to first inner item
            const first = pAst.blocks[blockName].main?.[0];
            if (first) {
              const uri = 'file://' + parentAbs;
              return Location.create(uri, Range.create(posFromOffset(src, first.pos), posFromOffset(src, first.pos + first.content.length)));
            }
          }
        } catch (e) { logError(e, 'onDefinition.contentBlockName.parent'); }
      }
      break; // Stop after finding the right match
    }
  }
  const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
  if (mp) {
    const key = mp[2];
    // resolve alias/path
    const aliasMap: Record<string, string> = {};
    const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = dirRe.exec(text))) {
      const params = d[1].split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''));
      if (params.length >= 2) aliasMap[params[1]] = params[0];
    }
    let target = aliasMap[key] || key;
    // also scan workspace index for requireAs aliases
    if (target === key) {
      for (const [, info] of fileIndex) {
        const mapped = info.requireAs.get(key);
        if (mapped) { target = mapped; break; }
      }
    }
    const tryResolve = (rel: string, baseDirs: string[]): string | null => {
      for (const base of baseDirs) {
        const c = path.isAbsolute(rel) ? rel : path.join(base, rel);
        const variants = [c, c + '.njs', c + '.nhtml', c + '.nts'];
        for (const v of variants) { if (fs.existsSync(v)) return v; }
      }
      return null;
    };
    const currentDir = textDocument.uri.startsWith('file:') ? path.dirname(url.fileURLToPath(textDocument.uri)) : process.cwd();
    const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
    const resolved = tryResolve(target, bases);
    if (resolved) {
      const uri = 'file://' + resolved;
      return Location.create(uri, Range.create(Position.create(0, 0), Position.create(0, 0)));
    }
  }
  // If on a block/slot declaration name, just return its own location
  const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
  let match: RegExpExecArray | null;
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
            return Location.create(uri, Range.create(posFromOffset(src, dm.index), posFromOffset(src, dm.index + dm[0].length)));
          }
        } catch {}
      }
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
  const around = text.slice(Math.max(0, offset - 100), Math.min(text.length, offset + 100));
  // Determine selected block name
  const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
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
  const slotRe = new RegExp(String.raw`slot\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
  let u: RegExpExecArray | null;
  while ((u = usageRe.exec(text))) {
    const start = doc.positionAt(u.index);
    const end = doc.positionAt(u.index + u[0].length);
    res.push(Location.create(textDocument.uri, Range.create(start, end)));
  }
  while ((u = slotRe.exec(text))) {
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
    slotRe.lastIndex = 0;
    while ((mu = slotRe.exec(p))) {
      const start = posFromOffset(p, mu.index);
      const end = posFromOffset(p, mu.index + mu[0].length);
      res.push(Location.create(uri, Range.create(start, end)));
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
        if (!src) continue;
        let mm: RegExpExecArray | null;
        while ((mm = declRe.exec(src))) {
          const start = posFromOffset(src, mm.index);
          const end = posFromOffset(src, mm.index + mm[0].length);
          res.push(Location.create(childUri, Range.create(start, end)));
        }
      }
    }
  }
  // Partial references if cursor is within partial(..., 'name') argument
  const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
  if (mp) {
    const key = mp[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prx = new RegExp(String.raw`partial\(\s*[^,]+,\s*(["'\`])${key}\1`, 'g');
    // current file
    let mu: RegExpExecArray | null;
    while ((mu = prx.exec(text))) {
      const start = doc.positionAt(mu.index);
      const end = doc.positionAt(mu.index + mu[0].length);
      res.push(Location.create(textDocument.uri, Range.create(start, end)));
    }
    // other files
    for (const [uri, info] of fileIndex) {
      if (uri === textDocument.uri) continue;
      const p = info.path ? fs.readFileSync(info.path, 'utf8') : '';
      if (!p) continue;
      prx.lastIndex = 0;
      while ((mu = prx.exec(p))) {
        const start = posFromOffset(p, mu.index);
        const end = posFromOffset(p, mu.index + mu[0].length);
        res.push(Location.create(uri, Range.create(start, end)));
      }
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
      const declRe = new RegExp(String.raw`<#\s*-?\s*${kind}\s+(["'\`])([^"'\`]+)\1\s*:\s*-?\s*#>`);
      const local = declRe.exec(snippet);
      if (local) {
        const nameStartLocal = local.index + local[0].indexOf(local[2]);
        const from = doc.positionAt(searchFrom + nameStartLocal);
        const to = doc.positionAt(searchFrom + nameStartLocal + local[2].length);
        actions.push({
          title: `Rename ${kind} to '${sanitized}'`,
          kind: 'quickfix',
          diagnostics: [d],
          edit: { changes: { [textDocument.uri]: [TextEdit.replace({ start: from, end: to }, sanitized)] } }
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
        edit: { changes: { [textDocument.uri]: [TextEdit.replace(d.range, '<#-')] } }
      });
    }
    if (d.message.includes("Consider '-#>")) {
      // Replace '#>' with '-#>' at the diagnostic range
      actions.push({
        title: "Apply right trim '-#>'",
        kind: 'quickfix',
        diagnostics: [d],
        edit: { changes: { [textDocument.uri]: [TextEdit.replace(d.range, '-#>')] } }
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
      edit: { changes: { [textDocument.uri]: [TextEdit.insert(range.end, `\n${indent}${tags}`)] } }
    });
  }
  // Wrap selection into template block/code
  const selectionText = text.slice(doc.offsetAt(range.start), doc.offsetAt(range.end));
  if (selectionText && selectionText.length > 0) {
    actions.push({
      title: 'Wrap with <#- ... -#>',
      kind: 'refactor.rewrite',
      edit: { changes: { [textDocument.uri]: [TextEdit.replace(range, `<#- ${selectionText} -#>`)] } }
    });
    actions.push({
      title: "Wrap with <# ... #>",
      kind: 'refactor.rewrite',
      edit: { changes: { [textDocument.uri]: [TextEdit.replace(range, `<# ${selectionText} #>`)] } }
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
      let idx = 1; let varName = `_expr${idx}`;
      while (text.includes(varName)) { idx += 1; varName = `_expr${idx}`; }
      const lineStart = Position.create(range.start.line, 0);
      const insertDecl = TextEdit.insert(lineStart, `<# const ${varName} = ${exprText.trim()} #>\n`);
      const replaceRange = Range.create(doc.positionAt(exprStart), doc.positionAt(exprEnd));
      const replaceExpr = TextEdit.replace(replaceRange, ` ${varName} `);
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
      const insertAt = Position.create(0, 0);
      const scaffold = `<# block '${name}' : #>\n<# end #>\n`;
      actions.push({
        title: `Create block '${name}' at file start`,
        kind: 'quickfix',
        edit: { changes: { [textDocument.uri]: [TextEdit.insert(insertAt, scaffold)] } }
      });
      const curInsert = range.start;
      actions.push({
        title: `Insert block '${name}' here`,
        kind: 'quickfix',
        edit: { changes: { [textDocument.uri]: [TextEdit.insert(curInsert, scaffold)] } }
      });
    }
  }
  return actions;
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
  for (const [name, slot] of Object.entries<any>(ast.slots || {})) {
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

```

`server/package.json`

```json
{
  "name": "ftejs-server",
  "private": true,
  "version": "0.0.1",
  "main": "out/server.js",
  "scripts": {
    "build": "tsc -b",
    "watch": "tsc -w",
    "test": "jest --config jest.config.js"
  },
  "dependencies": {
    "prettier": "^3.6.2",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11"
  },
  "devDependencies": {
    "@types/node": "^20.12.8",
    "jest": "^29.7.0",
    "typescript": "^5.5.4"
  }
}

```

`server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}

```

`syntaxes/template-html.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Template HTML",
  "scopeName": "text.html.template",
  "patterns": [
    {
      "include": "#template-expressions"
    },
    {
      "include": "text.html.basic"
    }
  ],
  "repository": {
    "template-expressions": {
      "patterns": [
        {
          "begin": "<#@\\s*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.begin"
            }
          },
          "end": "[-]?\\s*#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.end"
            }
          },
          "name": "meta.directive.template",
          "patterns": [
            {
              "name": "support.type.directive.fte",
              "match": "\\b(extend|context|alias|requireAs|deindent|chunks|includeMainChunk|useHash|noContent|noSlots|noBlocks|noPartial|noOptions|promise|callback)\\b"
            },
            {
              "name": "keyword.control.directive",
              "match": "\\w+"
            },
            {
              "name": "string.unquoted.directive",
              "match": "[^\\s#>]*"
            }
          ]
        },
        {
          "begin": "#{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            },
            {
              "name": "support.function.fte",
              "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()"
            }
          ]
        },
        {
          "begin": "!{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        
        {
          "begin": "<\\*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "\\*>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template"
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\\\"`])([^'`\\\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": {
            "0": { "name": "punctuation.definition.bracket.template.block.begin" },
            "2": { "name": "entity.name.tag.block.template" }
          },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ 
            { "include": "$self" },
            { "include": "#template-expressions" }
          ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\\\"`])([^'`\\\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": {
            "0": { "name": "punctuation.definition.bracket.template.slot.begin" },
            "2": { "name": "entity.name.tag.slot.template" }
          },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ 
            { "include": "$self" },
            { "include": "#template-expressions" }
          ]
        },
        {
          "begin": "<%#",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template.ejs"
        },
        {
          "begin": "<%=",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%-",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%_",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%(?![=#\\-_])",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<#-?",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "-?#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            { "include": "source.js" },
            {
              "name": "support.function.fte",
              "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()"
            }
          ]
        }
      ]
    }
  }
}

```

`syntaxes/template-inject-generic.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "FTE Template Injection (Generic)",
  "scopeName": "fte.template.inject.generic",
  "injectionSelector": "L:source.python, L:source.swift, L:source.ruby, L:source.go, L:source.php",
  "patterns": [
    {
      "name": "meta.inline.template.brackets.generic",
      "match": "(<#|#>|#\\{|!\\{|<\\*|\\*>)",
      "captures": { "1": { "name": "punctuation.definition.bracket.template" } }
    },
    {
      "begin": "<#@\\s*",
      "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.directive.begin" } },
      "end": "[-]?\\s*#>",
      "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.directive.end" } },
      "name": "meta.directive.template",
      "patterns": [
        { "name": "keyword.control.directive", "match": "\\w+" },
        { "name": "string.unquoted.directive", "match": "[^\\s#>]*" }
      ]
    },
    {
      "begin": "#{",
      "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
      "end": "}",
      "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
      "contentName": "meta.embedded.block.javascript",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "!{",
      "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
      "end": "}",
      "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
      "contentName": "meta.embedded.block.javascript",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "(?:<#-(?!\\s*(?:block|slot)\\b)|<#(?!\\s*(?:block|slot|@|end\\s*#>)|\\{))",
      "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" } },
      "end": "[-]?#>",
      "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
      "contentName": "meta.embedded.block.javascript",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "<\\*",
      "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.comment.begin" } },
      "end": "\\*>",
      "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.comment.end" } },
      "name": "comment.block.template"
    },
    {
      "begin": "<#-\\s*block\\s+['\"`]([^'\"`]+)['\"`]\\s*:\\s*-#>",
      "beginCaptures": { "0": { "name": "punctuation.definition.block.begin" }, "1": { "name": "entity.name.block" } },
      "end": "<#-\\s*end\\s*-#>",
      "endCaptures": { "0": { "name": "punctuation.definition.block.end" } },
      "name": "meta.block.template",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "<#\\s*block\\s+['\"`]([^'\"`]+)['\"`]\\s*:\\s*#>",
      "beginCaptures": { "0": { "name": "punctuation.definition.block.begin" }, "1": { "name": "entity.name.block" } },
      "end": "<#\\s*end\\s*#>",
      "endCaptures": { "0": { "name": "punctuation.definition.block.end" } },
      "name": "meta.block.template",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "<#-\\s*slot\\s+['\"`]([^'\"`]+)['\"`]\\s*:\\s*-#>",
      "beginCaptures": { "0": { "name": "punctuation.definition.block.begin" }, "1": { "name": "entity.name.block" } },
      "end": "<#-\\s*end\\s*-#>",
      "endCaptures": { "0": { "name": "punctuation.definition.block.end" } },
      "name": "meta.slot.template",
      "patterns": [ { "include": "source.js" } ]
    },
    {
      "begin": "<#\\s*slot\\s+['\"`]([^'\"`]+)['\"`]\\s*:\\s*#>",
      "beginCaptures": { "0": { "name": "punctuation.definition.block.begin" }, "1": { "name": "entity.name.block" } },
      "end": "<#\\s*end\\s*#>",
      "endCaptures": { "0": { "name": "punctuation.definition.block.end" } },
      "name": "meta.slot.template",
      "patterns": [ { "include": "source.js" } ]
    }
  ]
}

```

`syntaxes/template-inject-html.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "FTE Template Injection (HTML/Markdown)",
  "scopeName": "fte.template.inject.html",
  "injectionSelector": "L:text.html.basic, L:text.html.markdown",
  "patterns": [
    { "include": "text.html.template#template-expressions" },
    {
      "name": "meta.inline.template.brackets",
      "match": "(<#|#>|#\\{|!\\{|<\\*|\\*>)",
      "captures": {
        "1": { "name": "punctuation.definition.bracket.template" }
      }
    }
  ]
}

```

`syntaxes/template-inline.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "FTE Template Inline",
  "scopeName": "text.html.template.inline",
  "injectionSelector": "L:source.js, L:source.ts",
  "patterns": [
    {
      "name": "meta.embedded.fte.template",
      "begin": "(\\bfte)\\s*`",
      "beginCaptures": {
        "1": { "name": "entity.name.function.tagged-template" }
      },
      "end": "`",
      "applyEndPatternLast": true,
      "patterns": [
        {
          "begin": "\\\\`",
          "end": "\\\\`",
          "name": "constant.character.escape.backtick"
        },
        {
          "begin": "\\$\\{",
          "beginCaptures": { "0": { "name": "punctuation.section.interpolation.begin" } },
          "end": "}",
          "endCaptures": { "0": { "name": "punctuation.section.interpolation.end" } },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        },
        { "include": "text.html.template" }
      ]
    }
  ]
}

```

`syntaxes/template-js.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Template JavaScript",
  "scopeName": "source.js.template",
  "patterns": [
    {
      "include": "#template-expressions"
    },
    {
      "include": "source.js"
    }
  ],
  "repository": {
    "template-expressions": {
      "patterns": [
        {
          "begin": "<#@\\s*",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.directive.begin" } },
          "end": "[-]?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.directive.end" } },
          "name": "meta.directive.template",
          "patterns": [
            {
              "name": "support.type.directive.fte",
              "match": "\\b(extend|context|alias|requireAs|deindent|chunks|includeMainChunk|useHash|noContent|noSlots|noBlocks|noPartial|noOptions|promise|callback)\\b"
            },
            {
              "name": "keyword.control.directive",
              "match": "\\w+"
            },
            {
              "name": "string.unquoted.directive",
              "match": "[^\\s#>]*"
            }
          ]
        },
        {
          "begin": "#{",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
          "end": "}",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            { "include": "source.js" },
            { "name": "support.function.fte", "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()" }
          ]
        },
        {
          "begin": "!{",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
          "end": "}",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        },
        {
          "begin": "(?:<#-(?!\\s*(?:block|slot)\\b)|<#(?!\\s*(?:block|slot|@|end\\s*#>)|\\{))",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" } },
          "end": "[-]?#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            { "include": "source.js" },
            { "name": "support.function.fte", "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()" }
          ]
        },
        {
          "begin": "<\\*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "\\*>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template"
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\"``])([^'\"``]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { 
            "0": { "name": "punctuation.definition.bracket.template.block.begin" }, 
            "2": { "name": "entity.name.tag.block.template" } 
          },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\"``])([^'\"``]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { 
            "0": { "name": "punctuation.definition.bracket.template.slot.begin" }, 
            "2": { "name": "entity.name.tag.slot.template" } 
          },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<%#",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.comment.begin" } },
          "end": "[-_]?%>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.comment.end" } },
          "name": "comment.block.template.ejs"
        },
        {
          "begin": "<%=",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
          "end": "[-_]?%>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
          "name": "meta.ejs.output.template",
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        },
        {
          "begin": "<%-",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.begin" } },
          "end": "[-_]?%>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.expression.end" } },
          "name": "meta.ejs.unescaped.template",
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        },
        {
          "begin": "<%_",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" } },
          "end": "[-_]?%>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.ejs.trimmed.template",
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        },
        {
          "begin": "<%(?![=#\\-_])",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" } },
          "end": "[-_]?%>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.ejs.block.template",
          "contentName": "meta.embedded.block.javascript",
          "patterns": [ { "include": "source.js" } ]
        }
      ]
    }
  }
}
```

`syntaxes/template-markdown.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Template Markdown",
  "scopeName": "text.html.markdown.template",
  "patterns": [
    {
      "include": "#template-expressions"
    },
    {
      "include": "text.html.markdown"
    }
  ],
  "repository": {
    "template-expressions": {
      "patterns": [
        {
          "begin": "<#@\\s*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.begin"
            }
          },
          "end": "[-]?\\s*#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.end"
            }
          },
          "name": "meta.directive.template",
          "patterns": [
            {
              "name": "support.type.directive.fte",
              "match": "\\b(extend|context|alias|requireAs|deindent|chunks|includeMainChunk|useHash|noContent|noSlots|noBlocks|noPartial|noOptions|promise|callback)\\b"
            },
            { "name": "keyword.control.directive", "match": "\\w+" },
            {
              "name": "string.unquoted.directive",
              "match": "[^\\s#>]*"
            }
          ]
        },
        {
          "begin": "#{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "!{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "(?:<#-(?!\\s*(?:block|slot)\\b)|<#(?!\\s*(?:block|slot|@|end\\s*#>)|\\{))",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-]?#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<\\*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "\\*>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template"
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" }, "2": { "name": "entity.name.tag.block.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" }, "2": { "name": "entity.name.tag.block.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.begin" }, "2": { "name": "entity.name.tag.slot.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.begin" }, "2": { "name": "entity.name.tag.slot.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<%#",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template.ejs"
        },
        {
          "begin": "<%=",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%-",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%_",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%(?![=#\\-_])",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        }
      ]
    }
  }
}

```

`syntaxes/template-typescript.tmLanguage.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Template TypeScript",
  "scopeName": "source.ts.template",
  "patterns": [
    {
      "include": "#template-expressions"
    },
    {
      "include": "source.ts"
    }
  ],
  "repository": {
    "template-expressions": {
      "patterns": [
        {
          "begin": "<#@\\s*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.begin"
            }
          },
          "end": "[-]?\\s*#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.directive.end"
            }
          },
          "name": "meta.directive.template",
          "patterns": [
            {
              "name": "support.type.directive.fte",
              "match": "\\b(extend|context|alias|requireAs|deindent|chunks|includeMainChunk|useHash|noContent|noSlots|noBlocks|noPartial|noOptions|promise|callback)\\b"
            },
            {
              "name": "keyword.control.directive",
              "match": "\\w+"
            },
            {
              "name": "string.unquoted.directive",
              "match": "[^\\s#>]*"
            }
          ]
        },
        {
          "begin": "#{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.ts"
            },
            {
              "name": "support.function.fte",
              "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()"
            }
          ]
        },
        {
          "begin": "!{",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "}",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "(?:<#-(?!\\s*(?:block|slot)\\b)|<#(?!\\s*(?:block|slot|@|end\\s*#>)|\\{))",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-]?#>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "#template-expressions"
            },
            {
              "include": "source.ts"
            },
            {
              "name": "support.function.fte",
              "match": "\\b(partial|content|slot|chunkStart|chunkEnd)\\s*(?=\\()"
            }
          ]
        },
        {
          "begin": "<\\*",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "\\*>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template"
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" }, "2": { "name": "entity.name.tag.block.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*block\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.begin" }, "2": { "name": "entity.name.tag.block.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.block.end" } },
          "name": "meta.block.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.begin" }, "2": { "name": "entity.name.tag.slot.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<#\\s*-?\\s*slot\\s+(['\"`])([^'`\"]+)\\1\\s*:\\s*-?\\s*#>",
          "beginCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.begin" }, "2": { "name": "entity.name.tag.slot.template" } },
          "end": "<#\\s*-?\\s*end\\s*-?\\s*#>",
          "endCaptures": { "0": { "name": "punctuation.definition.bracket.template.slot.end" } },
          "name": "meta.slot.template",
          "patterns": [ { "include": "$self" } ]
        },
        {
          "begin": "<%#",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.comment.end"
            }
          },
          "name": "comment.block.template.ejs"
        },
        {
          "begin": "<%=",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%-",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.expression.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%_",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        },
        {
          "begin": "<%(?![=#\\-_])",
          "beginCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.begin"
            }
          },
          "end": "[-_]?%>",
          "endCaptures": {
            "0": {
              "name": "punctuation.definition.bracket.template.block.end"
            }
          },
          "contentName": "meta.embedded.block.javascript",
          "patterns": [
            {
              "include": "source.js"
            }
          ]
        }
      ]
    }
  }
}

```

`language-configuration.json`

```json
{
    "comments": {
        "lineComment": "//",
        "blockComment": [ "<*", "*>" ]
    },
	"brackets": [
		["<#", "#>"],
		["<#-", "-#>"],
		["{", "}"],
		["<*", "*>"],
		["[", "]"],
		["(", ")"],
		["#{", "}"],
		["{{", "}}"],
		["{{&", "}}"],

		["<%", "%>"],
		["<%", "-%>"],
		["<%", "_%>"],

		["<%-", "%>"],
		["<%-", "-%>"],
		["<%-", "_%>"],

		["<%=", "%>"],
		["<%=", "-%>"],
		["<%=", "_%>"],

		["<%_", "%>"],
		["<%_", "-%>"],
		["<%_", "_%>"],

		["<%#", "%>"],
		["<#@", "#>"]
	],
    "colorizedBracketPairs": [
        ["<#", "#>"],
        ["<#-", "-#>"],
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
    ],
	"autoClosingPairs": [
		["<%", "%>"],
		["{{", "}}"],
		["<*", "*>"],
		["#{", "}"],
		["!{", "}"],
		["<#", "#>"],
		["\"", "\""],
		["'", "'"],
		{ "open": "{", "close": "}" },
		{ "open": "[", "close": "]" },
		{ "open": "(", "close": ")" },
		{ "open": "'", "close": "'", "notIn": ["string", "comment"] },
		{ "open": "\"", "close": "\"", "notIn": ["string"] },
		{ "open": "`", "close": "`", "notIn": ["string", "comment"] },
		{ "open": "/**", "close": " */", "notIn": ["string"] }
	],
	"surroundingPairs": [
		["{", "}"],
		["[", "]"],
		["(", ")"],
		["'", "'"],
		["\"", "\""],
		["`", "`"],
		["#", "#"],
		["<", ">"]
	],
	"autoCloseBefore": ";:.,=}])>` \n\t",
	"folding": {
		"markers": {
			"start": "^\\s*//\\s*#?region\\b",
			"end": "^\\s*//\\s*#?endregion\\b"
		}
	}
}

```

`package-lock.json`

```json
{
  "name": "fte-js-template",
  "version": "1.2.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "fte-js-template",
      "version": "1.2.0",
      "license": "MIT",
      "workspaces": [
        "client",
        "server"
      ],
      "dependencies": {
        "vscode-languageclient": "^9.0.1",
        "vscode-languageserver": "^9.0.1",
        "vscode-languageserver-textdocument": "^1.0.11"
      },
      "engines": {
        "vscode": "^1.96.4"
      }
    },
    "client": {
      "name": "ftejs-client",
      "version": "0.0.1",
      "dependencies": {
        "vscode-languageclient": "^9.0.1"
      },
      "devDependencies": {
        "@types/node": "^20.12.8",
        "@types/vscode": "^1.96.0",
        "typescript": "^5.5.4"
      }
    },
    "node_modules/@ampproject/remapping": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/@ampproject/remapping/-/remapping-2.3.0.tgz",
      "integrity": "sha512-30iZtAPgz+LTIYoeivqYo853f02jBYSd5uGnGpkFV0M3xOt9aN73erkgYAmZU43x4VfqcnLxW9Kpg3R5LC4YYw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.27.1.tgz",
      "integrity": "sha512-cjQ7ZlQ0Mv3b47hABuTevyTuYN4i+loJKGeV9flcCgIK37cCXRh+L1bd3iBHlynerhQ7BhCkn2BPbQUL+rGqFg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.27.1",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/compat-data": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.28.0.tgz",
      "integrity": "sha512-60X7qkglvrap8mn1lh2ebxXdZYtUcpd7gsmy9kLaBJ4i/WdY8PqTSdxyA8qraikqKQK5C1KRBKXqznrVapyNaw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/core": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.28.0.tgz",
      "integrity": "sha512-UlLAnTPrFdNGoFtbSXwcGFQBtQZJCNjaN6hQNP3UPvuNXT1i82N26KL3dZeIpNalWywr9IuQuncaAfUaS1g6sQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@ampproject/remapping": "^2.2.0",
        "@babel/code-frame": "^7.27.1",
        "@babel/generator": "^7.28.0",
        "@babel/helper-compilation-targets": "^7.27.2",
        "@babel/helper-module-transforms": "^7.27.3",
        "@babel/helpers": "^7.27.6",
        "@babel/parser": "^7.28.0",
        "@babel/template": "^7.27.2",
        "@babel/traverse": "^7.28.0",
        "@babel/types": "^7.28.0",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "node_modules/@babel/core/node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/@babel/generator": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.28.0.tgz",
      "integrity": "sha512-lJjzvrbEeWrhB4P3QBsH7tey117PjLZnDbLiQEKjQ/fNJTjuq4HSqgFA+UNSwZT8D7dxxbnuSBMsa1lrWzKlQg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.28.0",
        "@babel/types": "^7.28.0",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets": {
      "version": "7.27.2",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.27.2.tgz",
      "integrity": "sha512-2+1thGUUWWjLTYTHZWK1n8Yga0ijBz1XAhUXcKy81rd5g6yh7hGqMp45v7cadSbEHc9G3OTv45SyneRN3ps4DQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.27.2",
        "@babel/helper-validator-option": "^7.27.1",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets/node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/@babel/helper-globals": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
      "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-imports": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.27.1.tgz",
      "integrity": "sha512-0gSFWUPNXNopqtIPQvlD5WgXYI5GY2kP2cCvoT8kczjbfcfuIljTbcWrulD1CIPIX2gt1wghbDy08yE1p+/r3w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/traverse": "^7.27.1",
        "@babel/types": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-transforms": {
      "version": "7.27.3",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.27.3.tgz",
      "integrity": "sha512-dSOvYwvyLsWBeIRyOeHXp5vPj5l1I011r52FM1+r1jCERv+aFXYk4whgQccYEGYxK2H3ZAIA8nuPkQ0HaUo3qg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.27.1",
        "@babel/traverse": "^7.27.3"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "node_modules/@babel/helper-plugin-utils": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.27.1.tgz",
      "integrity": "sha512-1gn1Up5YXka3YYAHGKpbideQ5Yjf1tDa9qYcgysz+cNCXukyLl6DjPXhD3VRwSb8c0J9tA4b2+rHEZtc6R0tlw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-string-parser": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz",
      "integrity": "sha512-qMlSxKbpRlAridDExk92nSobyDdpPijUq2DW6oDnUqd0iOGxmQjyqhMIihI9+zv4LPyZdRje2cavWPbCbWm3eA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-identifier": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.27.1.tgz",
      "integrity": "sha512-D2hP9eA+Sqx1kBZgzxZh0y1trbuU+JoDkiEwqhQ36nodYqJwyEIhPSdMNd7lOm/4io72luTPWH20Yda0xOuUow==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-validator-option": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz",
      "integrity": "sha512-YvjJow9FxbhFFKDSuFnVCe2WxXk1zWc22fFePVNEaWJEu8IrZVlda6N0uHwzZrUM1il7NC9Mlp4MaJYbYd9JSg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helpers": {
      "version": "7.28.2",
      "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.28.2.tgz",
      "integrity": "sha512-/V9771t+EgXz62aCcyofnQhGM8DQACbRhvzKFsXKC9QM+5MadF8ZmIm0crDMaz3+o0h0zXfJnd4EhbYbxsrcFw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.27.2",
        "@babel/types": "^7.28.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/parser": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.28.0.tgz",
      "integrity": "sha512-jVZGvOxOuNSsuQuLRTh13nU0AogFlw32w/MT+LV6D3sP5WdbW61E77RnkbaO2dUvmPAYrBDJXGn5gGS6tH4j8g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.28.0"
      },
      "bin": {
        "parser": "bin/babel-parser.js"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/plugin-syntax-async-generators": {
      "version": "7.8.4",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-async-generators/-/plugin-syntax-async-generators-7.8.4.tgz",
      "integrity": "sha512-tycmZxkGfZaxhMRbXlPXuVFpdWlXpir2W4AMhSJgRKzk/eDlIXOhb2LHWoLpDF7TEHylV5zNhykX6KAgHJmTNw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-bigint": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-bigint/-/plugin-syntax-bigint-7.8.3.tgz",
      "integrity": "sha512-wnTnFlG+YxQm3vDxpGE57Pj0srRU4sHE/mDkt1qv2YJJSeUAec2ma4WLUnUPeKjyrfntVwe/N6dCXpU+zL3Npg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-class-properties": {
      "version": "7.12.13",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-class-properties/-/plugin-syntax-class-properties-7.12.13.tgz",
      "integrity": "sha512-fm4idjKla0YahUNgFNLCB0qySdsoPiZP3iQE3rky0mBUtMZ23yDJ9SJdg6dXTSDnulOVqiF3Hgr9nbXvXTQZYA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.12.13"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-class-static-block": {
      "version": "7.14.5",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-class-static-block/-/plugin-syntax-class-static-block-7.14.5.tgz",
      "integrity": "sha512-b+YyPmr6ldyNnM6sqYeMWE+bgJcJpO6yS4QD7ymxgH34GBPNDM/THBh8iunyvKIZztiwLH4CJZ0RxTk9emgpjw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.14.5"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-import-attributes": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-import-attributes/-/plugin-syntax-import-attributes-7.27.1.tgz",
      "integrity": "sha512-oFT0FrKHgF53f4vOsZGi2Hh3I35PfSmVs4IBFLFj4dnafP+hIWDLg3VyKmUHfLoLHlyxY4C7DGtmHuJgn+IGww==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-import-meta": {
      "version": "7.10.4",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-import-meta/-/plugin-syntax-import-meta-7.10.4.tgz",
      "integrity": "sha512-Yqfm+XDx0+Prh3VSeEQCPU81yC+JWZ2pDPFSS4ZdpfZhp4MkFMaDC1UqseovEKwSUpnIL7+vK+Clp7bfh0iD7g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.10.4"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-json-strings": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-json-strings/-/plugin-syntax-json-strings-7.8.3.tgz",
      "integrity": "sha512-lY6kdGpWHvjoe2vk4WrAapEuBR69EMxZl+RoGRhrFGNYVK8mOPAW8VfbT/ZgrFbXlDNiiaxQnAtgVCZ6jv30EA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-jsx": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-jsx/-/plugin-syntax-jsx-7.27.1.tgz",
      "integrity": "sha512-y8YTNIeKoyhGd9O0Jiyzyyqk8gdjnumGTQPsz0xOZOQ2RmkVJeZ1vmmfIvFEKqucBG6axJGBZDE/7iI5suUI/w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-logical-assignment-operators": {
      "version": "7.10.4",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-logical-assignment-operators/-/plugin-syntax-logical-assignment-operators-7.10.4.tgz",
      "integrity": "sha512-d8waShlpFDinQ5MtvGU9xDAOzKH47+FFoney2baFIoMr952hKOLp1HR7VszoZvOsV/4+RRszNY7D17ba0te0ig==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.10.4"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-nullish-coalescing-operator": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-nullish-coalescing-operator/-/plugin-syntax-nullish-coalescing-operator-7.8.3.tgz",
      "integrity": "sha512-aSff4zPII1u2QD7y+F8oDsz19ew4IGEJg9SVW+bqwpwtfFleiQDMdzA/R+UlWDzfnHFCxxleFT0PMIrR36XLNQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-numeric-separator": {
      "version": "7.10.4",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-numeric-separator/-/plugin-syntax-numeric-separator-7.10.4.tgz",
      "integrity": "sha512-9H6YdfkcK/uOnY/K7/aA2xpzaAgkQn37yzWUMRK7OaPOqOpGS1+n0H5hxT9AUw9EsSjPW8SVyMJwYRtWs3X3ug==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.10.4"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-object-rest-spread": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-object-rest-spread/-/plugin-syntax-object-rest-spread-7.8.3.tgz",
      "integrity": "sha512-XoqMijGZb9y3y2XskN+P1wUGiVwWZ5JmoDRwx5+3GmEplNyVM2s2Dg8ILFQm8rWM48orGy5YpI5Bl8U1y7ydlA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-optional-catch-binding": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-optional-catch-binding/-/plugin-syntax-optional-catch-binding-7.8.3.tgz",
      "integrity": "sha512-6VPD0Pc1lpTqw0aKoeRTMiB+kWhAoT24PA+ksWSBrFtl5SIRVpZlwN3NNPQjehA2E/91FV3RjLWoVTglWcSV3Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-optional-chaining": {
      "version": "7.8.3",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-optional-chaining/-/plugin-syntax-optional-chaining-7.8.3.tgz",
      "integrity": "sha512-KoK9ErH1MBlCPxV0VANkXW2/dw4vlbGDrFgz8bmUsBGYkFRcbRwMh6cIJubdPrkxRwuGdtCk0v/wPTKbQgBjkg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.8.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-private-property-in-object": {
      "version": "7.14.5",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-private-property-in-object/-/plugin-syntax-private-property-in-object-7.14.5.tgz",
      "integrity": "sha512-0wVnp9dxJ72ZUJDV27ZfbSj6iHLoytYZmh3rFcxNnvsJF3ktkzLDZPy/mA17HGsaQT3/DQsWYX1f1QGWkCoVUg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.14.5"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-top-level-await": {
      "version": "7.14.5",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-top-level-await/-/plugin-syntax-top-level-await-7.14.5.tgz",
      "integrity": "sha512-hx++upLv5U1rgYfwe1xBQUhRmU41NEvpUvrp8jkrSCdvGSnM5/qdRMtylJ6PG5OFkBaHkbTAKTnd3/YyESRHFw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.14.5"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/plugin-syntax-typescript": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/plugin-syntax-typescript/-/plugin-syntax-typescript-7.27.1.tgz",
      "integrity": "sha512-xfYCBMxveHrRMnAWl1ZlPXOZjzkN82THFvLhQhFXFt81Z5HnN+EtUkZhv/zcKpmT3fzmWZB0ywiBrbC3vogbwQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0-0"
      }
    },
    "node_modules/@babel/template": {
      "version": "7.27.2",
      "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.27.2.tgz",
      "integrity": "sha512-LPDZ85aEJyYSd18/DkjNh4/y1ntkE5KwUHWTiqgRxruuZL2F1yuHligVHLvcHY2vMHXttKFpJn6LwfI7cw7ODw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.27.1",
        "@babel/parser": "^7.27.2",
        "@babel/types": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/traverse": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.28.0.tgz",
      "integrity": "sha512-mGe7UK5wWyh0bKRfupsUchrQGqvDbZDbKJw+kcRGSmdHVYrv+ltd0pnpDTVpiTqnaBru9iEvA8pz8W46v0Amwg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.27.1",
        "@babel/generator": "^7.28.0",
        "@babel/helper-globals": "^7.28.0",
        "@babel/parser": "^7.28.0",
        "@babel/template": "^7.27.2",
        "@babel/types": "^7.28.0",
        "debug": "^4.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/types": {
      "version": "7.28.2",
      "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.28.2.tgz",
      "integrity": "sha512-ruv7Ae4J5dUYULmeXw1gmb7rYRz57OWCPM57pHojnLq/3Z1CK2lNSLTCVjxVk1F/TZHwOZZrOWi0ur95BbLxNQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-string-parser": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@bcoe/v8-coverage": {
      "version": "0.2.3",
      "resolved": "https://registry.npmjs.org/@bcoe/v8-coverage/-/v8-coverage-0.2.3.tgz",
      "integrity": "sha512-0hYQ8SB4Db5zvZB4axdMHGwEaQjkZzFjQiN9LVYvIFB2nSUHW9tYpxWriPrWDASIxiaXax83REcLxuSdnGPZtw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@istanbuljs/load-nyc-config": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@istanbuljs/load-nyc-config/-/load-nyc-config-1.1.0.tgz",
      "integrity": "sha512-VjeHSlIzpv/NyD3N0YuHfXOPDIixcA1q2ZV98wsMqcYlPmv2n3Yb2lYP9XMElnaFVXg5A7YLTeLu6V84uQDjmQ==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "camelcase": "^5.3.1",
        "find-up": "^4.1.0",
        "get-package-type": "^0.1.0",
        "js-yaml": "^3.13.1",
        "resolve-from": "^5.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/@istanbuljs/schema": {
      "version": "0.1.3",
      "resolved": "https://registry.npmjs.org/@istanbuljs/schema/-/schema-0.1.3.tgz",
      "integrity": "sha512-ZXRY4jNvVgSVQ8DL3LTcakaAtXwTVUxE81hslsyD2AtoXW/wVob10HkOJ1X/pAlcI7D+2YoZKg5do8G/w6RYgA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/@jest/console": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/console/-/console-29.7.0.tgz",
      "integrity": "sha512-5Ni4CU7XHQi32IJ398EEP4RrB8eV09sXP2ROqD4bksHrnTree52PsxvX8tpL8LvTZ3pFzXyPbNQReSN41CAhOg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "jest-message-util": "^29.7.0",
        "jest-util": "^29.7.0",
        "slash": "^3.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/core": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/core/-/core-29.7.0.tgz",
      "integrity": "sha512-n7aeXWKMnGtDA48y8TLWJPJmLmmZ642Ceo78cYWEpiD7FzDgmNDV/GCVRorPABdXLJZ/9wzzgZAlHjXjxDHGsg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/console": "^29.7.0",
        "@jest/reporters": "^29.7.0",
        "@jest/test-result": "^29.7.0",
        "@jest/transform": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "ansi-escapes": "^4.2.1",
        "chalk": "^4.0.0",
        "ci-info": "^3.2.0",
        "exit": "^0.1.2",
        "graceful-fs": "^4.2.9",
        "jest-changed-files": "^29.7.0",
        "jest-config": "^29.7.0",
        "jest-haste-map": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-regex-util": "^29.6.3",
        "jest-resolve": "^29.7.0",
        "jest-resolve-dependencies": "^29.7.0",
        "jest-runner": "^29.7.0",
        "jest-runtime": "^29.7.0",
        "jest-snapshot": "^29.7.0",
        "jest-util": "^29.7.0",
        "jest-validate": "^29.7.0",
        "jest-watcher": "^29.7.0",
        "micromatch": "^4.0.4",
        "pretty-format": "^29.7.0",
        "slash": "^3.0.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "node-notifier": "^8.0.1 || ^9.0.0 || ^10.0.0"
      },
      "peerDependenciesMeta": {
        "node-notifier": {
          "optional": true
        }
      }
    },
    "node_modules/@jest/environment": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/environment/-/environment-29.7.0.tgz",
      "integrity": "sha512-aQIfHDq33ExsN4jP1NWGXhxgQ/wixs60gDiKO+XVMd8Mn0NWPWgc34ZQDTb2jKaUWQ7MuwoitXAsN2XVXNMpAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/fake-timers": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "jest-mock": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/expect": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/expect/-/expect-29.7.0.tgz",
      "integrity": "sha512-8uMeAMycttpva3P1lBHB8VciS9V0XAr3GymPpipdyQXbBcuhkLQOSe8E/p92RyAdToS6ZD1tFkX+CkhoECE0dQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "expect": "^29.7.0",
        "jest-snapshot": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/expect-utils": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/expect-utils/-/expect-utils-29.7.0.tgz",
      "integrity": "sha512-GlsNBWiFQFCVi9QVSx7f5AgMeLxe9YCCs5PuP2O2LdjDAA8Jh9eX7lA1Jq/xdXw3Wb3hyvlFNfZIfcRetSzYcA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "jest-get-type": "^29.6.3"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/fake-timers": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/fake-timers/-/fake-timers-29.7.0.tgz",
      "integrity": "sha512-q4DH1Ha4TTFPdxLsqDXK1d3+ioSL7yL5oCMJZgDYm6i+6CygW5E5xVr/D1HdsGxjt1ZWSfUAs9OxSB/BNelWrQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "@sinonjs/fake-timers": "^10.0.2",
        "@types/node": "*",
        "jest-message-util": "^29.7.0",
        "jest-mock": "^29.7.0",
        "jest-util": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/globals": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/globals/-/globals-29.7.0.tgz",
      "integrity": "sha512-mpiz3dutLbkW2MNFubUGUEVLkTGiqW6yLVTA+JbP6fI6J5iL9Y0Nlg8k95pcF8ctKwCS7WVxteBs29hhfAotzQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/environment": "^29.7.0",
        "@jest/expect": "^29.7.0",
        "@jest/types": "^29.6.3",
        "jest-mock": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/reporters": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/reporters/-/reporters-29.7.0.tgz",
      "integrity": "sha512-DApq0KJbJOEzAFYjHADNNxAE3KbhxQB1y5Kplb5Waqw6zVbuWatSnMjE5gs8FUgEPmNsnZA3NCWl9NG0ia04Pg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@bcoe/v8-coverage": "^0.2.3",
        "@jest/console": "^29.7.0",
        "@jest/test-result": "^29.7.0",
        "@jest/transform": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@jridgewell/trace-mapping": "^0.3.18",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "collect-v8-coverage": "^1.0.0",
        "exit": "^0.1.2",
        "glob": "^7.1.3",
        "graceful-fs": "^4.2.9",
        "istanbul-lib-coverage": "^3.0.0",
        "istanbul-lib-instrument": "^6.0.0",
        "istanbul-lib-report": "^3.0.0",
        "istanbul-lib-source-maps": "^4.0.0",
        "istanbul-reports": "^3.1.3",
        "jest-message-util": "^29.7.0",
        "jest-util": "^29.7.0",
        "jest-worker": "^29.7.0",
        "slash": "^3.0.0",
        "string-length": "^4.0.1",
        "strip-ansi": "^6.0.0",
        "v8-to-istanbul": "^9.0.1"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "node-notifier": "^8.0.1 || ^9.0.0 || ^10.0.0"
      },
      "peerDependenciesMeta": {
        "node-notifier": {
          "optional": true
        }
      }
    },
    "node_modules/@jest/schemas": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/@jest/schemas/-/schemas-29.6.3.tgz",
      "integrity": "sha512-mo5j5X+jIZmJQveBKeS/clAueipV7KgiX1vMgCxam1RNYiqE1w62n0/tJJnHtjW8ZHcQco5gY85jA3mi0L+nSA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@sinclair/typebox": "^0.27.8"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/source-map": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/@jest/source-map/-/source-map-29.6.3.tgz",
      "integrity": "sha512-MHjT95QuipcPrpLM+8JMSzFx6eHp5Bm+4XeFDJlwsvVBjmKNiIAvasGK2fxz2WbGRlnvqehFbh07MMa7n3YJnw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/trace-mapping": "^0.3.18",
        "callsites": "^3.0.0",
        "graceful-fs": "^4.2.9"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/test-result": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/test-result/-/test-result-29.7.0.tgz",
      "integrity": "sha512-Fdx+tv6x1zlkJPcWXmMDAG2HBnaR9XPSd5aDWQVsfrZmLVT3lU1cwyxLgRmXR9yrq4NBoEm9BMsfgFzTQAbJYA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/console": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/istanbul-lib-coverage": "^2.0.0",
        "collect-v8-coverage": "^1.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/test-sequencer": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/test-sequencer/-/test-sequencer-29.7.0.tgz",
      "integrity": "sha512-GQwJ5WZVrKnOJuiYiAF52UNUJXgTZx1NHjFSEB0qEMmSZKAkdMoIzw/Cj6x6NF4AvV23AUqDpFzQkN/eYCYTxw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/test-result": "^29.7.0",
        "graceful-fs": "^4.2.9",
        "jest-haste-map": "^29.7.0",
        "slash": "^3.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/transform": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/@jest/transform/-/transform-29.7.0.tgz",
      "integrity": "sha512-ok/BTPFzFKVMwO5eOHRrvnBVHdRy9IrsrW1GpMaQ9MCnilNLXQKmAX8s1YXDFaai9xJpac2ySzV0YeRRECr2Vw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.11.6",
        "@jest/types": "^29.6.3",
        "@jridgewell/trace-mapping": "^0.3.18",
        "babel-plugin-istanbul": "^6.1.1",
        "chalk": "^4.0.0",
        "convert-source-map": "^2.0.0",
        "fast-json-stable-stringify": "^2.1.0",
        "graceful-fs": "^4.2.9",
        "jest-haste-map": "^29.7.0",
        "jest-regex-util": "^29.6.3",
        "jest-util": "^29.7.0",
        "micromatch": "^4.0.4",
        "pirates": "^4.0.4",
        "slash": "^3.0.0",
        "write-file-atomic": "^4.0.2"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jest/types": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/@jest/types/-/types-29.6.3.tgz",
      "integrity": "sha512-u3UPsIilWKOM3F9CXtrG8LEJmNxwoCQC/XVj4IKYXvvpx7QIi/Kg1LI5uDmDpKlac62NUtX7eLjRh+jVZcLOzw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/schemas": "^29.6.3",
        "@types/istanbul-lib-coverage": "^2.0.0",
        "@types/istanbul-reports": "^3.0.0",
        "@types/node": "*",
        "@types/yargs": "^17.0.8",
        "chalk": "^4.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/@jridgewell/gen-mapping": {
      "version": "0.3.12",
      "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.12.tgz",
      "integrity": "sha512-OuLGC46TjB5BbN1dH8JULVVZY4WTdkF7tV9Ys6wLL1rubZnCMstOhNHueU5bLCrnRuDhKPDM4g6sw4Bel5Gzqg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.0",
        "@jridgewell/trace-mapping": "^0.3.24"
      }
    },
    "node_modules/@jridgewell/resolve-uri": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@jridgewell/sourcemap-codec": {
      "version": "1.5.4",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.4.tgz",
      "integrity": "sha512-VT2+G1VQs/9oz078bLrYbecdZKs912zQlkelYpuf+SXF+QvZDYJlbx/LSx+meSAwdDFnF8FVXW92AVjjkVmgFw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@jridgewell/trace-mapping": {
      "version": "0.3.29",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.29.tgz",
      "integrity": "sha512-uw6guiW/gcAGPDhLmd77/6lW8QLeiV5RUTsAX46Db6oLhGaVj4lhnPwb184s1bkc8kdVg/+h988dro8GRDpmYQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    },
    "node_modules/@sinclair/typebox": {
      "version": "0.27.8",
      "resolved": "https://registry.npmjs.org/@sinclair/typebox/-/typebox-0.27.8.tgz",
      "integrity": "sha512-+Fj43pSMwJs4KRrH/938Uf+uAELIgVBmQzg/q1YG10djyfA3TnrU8N8XzqCh/okZdszqBQTZf96idMfE5lnwTA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@sinonjs/commons": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/@sinonjs/commons/-/commons-3.0.1.tgz",
      "integrity": "sha512-K3mCHKQ9sVh8o1C9cxkwxaOmXoAMlDxC1mYyHrjqOWEcBjYr76t96zL2zlj5dUGZ3HSw240X1qgH3Mjf1yJWpQ==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "type-detect": "4.0.8"
      }
    },
    "node_modules/@sinonjs/fake-timers": {
      "version": "10.3.0",
      "resolved": "https://registry.npmjs.org/@sinonjs/fake-timers/-/fake-timers-10.3.0.tgz",
      "integrity": "sha512-V4BG07kuYSUkTCSBHG8G8TNhM+F19jXFWnQtzj+we8DrkpSBCee9Z3Ms8yiGer/dlmhe35/Xdgyo3/0rQKg7YA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "@sinonjs/commons": "^3.0.0"
      }
    },
    "node_modules/@types/babel__core": {
      "version": "7.20.5",
      "resolved": "https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz",
      "integrity": "sha512-qoQprZvz5wQFJwMDqeseRXWv3rqMvhgpbXFfVyWhbx9X47POIA6i/+dXefEmZKoAgOaTdaIgNSMqMIU61yRyzA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.20.7",
        "@babel/types": "^7.20.7",
        "@types/babel__generator": "*",
        "@types/babel__template": "*",
        "@types/babel__traverse": "*"
      }
    },
    "node_modules/@types/babel__generator": {
      "version": "7.27.0",
      "resolved": "https://registry.npmjs.org/@types/babel__generator/-/babel__generator-7.27.0.tgz",
      "integrity": "sha512-ufFd2Xi92OAVPYsy+P4n7/U7e68fex0+Ee8gSG9KX7eo084CWiQ4sdxktvdl0bOPupXtVJPY19zk6EwWqUQ8lg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__template": {
      "version": "7.4.4",
      "resolved": "https://registry.npmjs.org/@types/babel__template/-/babel__template-7.4.4.tgz",
      "integrity": "sha512-h/NUaSyG5EyxBIp8YRxo4RMe2/qQgvyowRwVMzhYhBCONbW8PUsg4lkFMrhgZhUe5z3L3MiLDuvyJ/CaPa2A8A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.1.0",
        "@babel/types": "^7.0.0"
      }
    },
    "node_modules/@types/babel__traverse": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz",
      "integrity": "sha512-8PvcXf70gTDZBgt9ptxJ8elBeBjcLOAcOtoO/mPJjtji1+CdGbHgm77om1GrsPxsiE+uXIpNSK64UYaIwQXd4Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/types": "^7.28.2"
      }
    },
    "node_modules/@types/graceful-fs": {
      "version": "4.1.9",
      "resolved": "https://registry.npmjs.org/@types/graceful-fs/-/graceful-fs-4.1.9.tgz",
      "integrity": "sha512-olP3sd1qOEe5dXTSaFvQG+02VdRXcdytWLAZsAq1PecU8uqQAhkrnbli7DagjtXKW/Bl7YJbUsa8MPcuc8LHEQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/node": "*"
      }
    },
    "node_modules/@types/istanbul-lib-coverage": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/@types/istanbul-lib-coverage/-/istanbul-lib-coverage-2.0.6.tgz",
      "integrity": "sha512-2QF/t/auWm0lsy8XtKVPG19v3sSOQlJe/YHZgfjb/KBBHOGSV+J2q/S671rcq9uTBrLAXmZpqJiaQbMT+zNU1w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/istanbul-lib-report": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/@types/istanbul-lib-report/-/istanbul-lib-report-3.0.3.tgz",
      "integrity": "sha512-NQn7AHQnk/RSLOxrBbGyJM/aVQ+pjj5HCgasFxc0K/KhoATfQ/47AyUl15I2yBUpihjmas+a+VJBOqecrFH+uA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/istanbul-lib-coverage": "*"
      }
    },
    "node_modules/@types/istanbul-reports": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/@types/istanbul-reports/-/istanbul-reports-3.0.4.tgz",
      "integrity": "sha512-pk2B1NWalF9toCRu6gjBzR69syFjP4Od8WRAX+0mmf9lAjCRicLOWc+ZrxZHx/0XRjotgkF9t6iaMJ+aXcOdZQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/istanbul-lib-report": "*"
      }
    },
    "node_modules/@types/node": {
      "version": "20.19.10",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-20.19.10.tgz",
      "integrity": "sha512-iAFpG6DokED3roLSP0K+ybeDdIX6Bc0Vd3mLW5uDqThPWtNos3E+EqOM11mPQHKzfWHqEBuLjIlsBQQ8CsISmQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": "~6.21.0"
      }
    },
    "node_modules/@types/stack-utils": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/@types/stack-utils/-/stack-utils-2.0.3.tgz",
      "integrity": "sha512-9aEbYZ3TbYMznPdcdr3SmIrLXwC/AKZXQeCf9Pgao5CKb8CyHuEX5jzWPTkvregvhRJHcpRO6BFoGW9ycaOkYw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/vscode": {
      "version": "1.102.0",
      "resolved": "https://registry.npmjs.org/@types/vscode/-/vscode-1.102.0.tgz",
      "integrity": "sha512-V9sFXmcXz03FtYTSUsYsu5K0Q9wH9w9V25slddcxrh5JgORD14LpnOA7ov0L9ALi+6HrTjskLJ/tY5zeRF3TFA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/@types/yargs": {
      "version": "17.0.33",
      "resolved": "https://registry.npmjs.org/@types/yargs/-/yargs-17.0.33.tgz",
      "integrity": "sha512-WpxBCKWPLr4xSsHgz511rFJAM+wS28w2zEO1QDNY5zM/S8ok70NNfztH0xwhqKyaK0OHCbN98LDAZuy1ctxDkA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/yargs-parser": "*"
      }
    },
    "node_modules/@types/yargs-parser": {
      "version": "21.0.3",
      "resolved": "https://registry.npmjs.org/@types/yargs-parser/-/yargs-parser-21.0.3.tgz",
      "integrity": "sha512-I4q9QU9MQv4oEOz4tAHJtNz1cwuLxn2F3xcc2iV5WdqLPpUnj30aUuxt1mAxYTG+oe8CZMV/+6rU4S4gRDzqtQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/ansi-escapes": {
      "version": "4.3.2",
      "resolved": "https://registry.npmjs.org/ansi-escapes/-/ansi-escapes-4.3.2.tgz",
      "integrity": "sha512-gKXj5ALrKWQLsYG9jlTRmR/xKluxHV+Z9QEwNIgCfM1/uwPMCuzVVnh5mwTd+OuBZcwSIMbqssNWRm1lE51QaQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "type-fest": "^0.21.3"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/ansi-regex": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/ansi-styles": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-convert": "^2.0.1"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/anymatch": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz",
      "integrity": "sha512-KMReFUr0B4t+D+OBkjR3KYqvocp2XaSzO55UcB6mgQMd3KbcE+mWTyvVV7D/zsdEbNnV6acZUutkiHQXvTr1Rw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "normalize-path": "^3.0.0",
        "picomatch": "^2.0.4"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/argparse": {
      "version": "1.0.10",
      "resolved": "https://registry.npmjs.org/argparse/-/argparse-1.0.10.tgz",
      "integrity": "sha512-o5Roy6tNG4SL/FOkCAN6RzjiakZS25RLYFrcMttJqbdd8BWrnA+fGz57iN5Pb06pvBGvl5gQ0B48dJlslXvoTg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "sprintf-js": "~1.0.2"
      }
    },
    "node_modules/babel-jest": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/babel-jest/-/babel-jest-29.7.0.tgz",
      "integrity": "sha512-BrvGY3xZSwEcCzKvKsCi2GgHqDqsYkOP4/by5xCgIwGXQxIEh+8ew3gmrE1y7XRR6LHZIj6yLYnUi/mm2KXKBg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/transform": "^29.7.0",
        "@types/babel__core": "^7.1.14",
        "babel-plugin-istanbul": "^6.1.1",
        "babel-preset-jest": "^29.6.3",
        "chalk": "^4.0.0",
        "graceful-fs": "^4.2.9",
        "slash": "^3.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.8.0"
      }
    },
    "node_modules/babel-plugin-istanbul": {
      "version": "6.1.1",
      "resolved": "https://registry.npmjs.org/babel-plugin-istanbul/-/babel-plugin-istanbul-6.1.1.tgz",
      "integrity": "sha512-Y1IQok9821cC9onCx5otgFfRm7Lm+I+wwxOx738M/WLPZ9Q42m4IG5W0FNX8WLL2gYMZo3JkuXIH2DOpWM+qwA==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "@babel/helper-plugin-utils": "^7.0.0",
        "@istanbuljs/load-nyc-config": "^1.0.0",
        "@istanbuljs/schema": "^0.1.2",
        "istanbul-lib-instrument": "^5.0.4",
        "test-exclude": "^6.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/babel-plugin-istanbul/node_modules/istanbul-lib-instrument": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/istanbul-lib-instrument/-/istanbul-lib-instrument-5.2.1.tgz",
      "integrity": "sha512-pzqtp31nLv/XFOzXGuvhCb8qhjmTVo5vjVk19XE4CRlSWz0KoeJ3bw9XsA7nOp9YBf4qHjwBxkDzKcME/J29Yg==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "@babel/core": "^7.12.3",
        "@babel/parser": "^7.14.7",
        "@istanbuljs/schema": "^0.1.2",
        "istanbul-lib-coverage": "^3.2.0",
        "semver": "^6.3.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/babel-plugin-istanbul/node_modules/semver": {
      "version": "6.3.1",
      "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
      "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
      "dev": true,
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      }
    },
    "node_modules/babel-plugin-jest-hoist": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/babel-plugin-jest-hoist/-/babel-plugin-jest-hoist-29.6.3.tgz",
      "integrity": "sha512-ESAc/RJvGTFEzRwOTT4+lNDk/GNHMkKbNzsvT0qKRfDyyYTskxB5rnU2njIDYVxXCBHHEI1c0YwHob3WaYujOg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/template": "^7.3.3",
        "@babel/types": "^7.3.3",
        "@types/babel__core": "^7.1.14",
        "@types/babel__traverse": "^7.0.6"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/babel-preset-current-node-syntax": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/babel-preset-current-node-syntax/-/babel-preset-current-node-syntax-1.2.0.tgz",
      "integrity": "sha512-E/VlAEzRrsLEb2+dv8yp3bo4scof3l9nR4lrld+Iy5NyVqgVYUJnDAmunkhPMisRI32Qc4iRiz425d8vM++2fg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/plugin-syntax-async-generators": "^7.8.4",
        "@babel/plugin-syntax-bigint": "^7.8.3",
        "@babel/plugin-syntax-class-properties": "^7.12.13",
        "@babel/plugin-syntax-class-static-block": "^7.14.5",
        "@babel/plugin-syntax-import-attributes": "^7.24.7",
        "@babel/plugin-syntax-import-meta": "^7.10.4",
        "@babel/plugin-syntax-json-strings": "^7.8.3",
        "@babel/plugin-syntax-logical-assignment-operators": "^7.10.4",
        "@babel/plugin-syntax-nullish-coalescing-operator": "^7.8.3",
        "@babel/plugin-syntax-numeric-separator": "^7.10.4",
        "@babel/plugin-syntax-object-rest-spread": "^7.8.3",
        "@babel/plugin-syntax-optional-catch-binding": "^7.8.3",
        "@babel/plugin-syntax-optional-chaining": "^7.8.3",
        "@babel/plugin-syntax-private-property-in-object": "^7.14.5",
        "@babel/plugin-syntax-top-level-await": "^7.14.5"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0 || ^8.0.0-0"
      }
    },
    "node_modules/babel-preset-jest": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/babel-preset-jest/-/babel-preset-jest-29.6.3.tgz",
      "integrity": "sha512-0B3bhxR6snWXJZtR/RliHTDPRgn1sNHOR0yVtq/IiQFyuOVjFS+wuio/R4gSNkyYmKmJB4wGZv2NZanmKmTnNA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "babel-plugin-jest-hoist": "^29.6.3",
        "babel-preset-current-node-syntax": "^1.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "@babel/core": "^7.0.0"
      }
    },
    "node_modules/balanced-match": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
      "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
      "license": "MIT"
    },
    "node_modules/brace-expansion": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0"
      }
    },
    "node_modules/braces": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/braces/-/braces-3.0.3.tgz",
      "integrity": "sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "fill-range": "^7.1.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/browserslist": {
      "version": "4.25.2",
      "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.25.2.tgz",
      "integrity": "sha512-0si2SJK3ooGzIawRu61ZdPCO1IncZwS8IzuX73sPZsXW6EQ/w/DAfPyKI8l1ETTCr2MnvqWitmlCUxgdul45jA==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "caniuse-lite": "^1.0.30001733",
        "electron-to-chromium": "^1.5.199",
        "node-releases": "^2.0.19",
        "update-browserslist-db": "^1.1.3"
      },
      "bin": {
        "browserslist": "cli.js"
      },
      "engines": {
        "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
      }
    },
    "node_modules/bser": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/bser/-/bser-2.1.1.tgz",
      "integrity": "sha512-gQxTNE/GAfIIrmHLUE3oJyp5FO6HRBfhjnw4/wMmA63ZGDJnWBmgY/lyQBpnDUkGmAhbSe39tx2d/iTOAfglwQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "node-int64": "^0.4.0"
      }
    },
    "node_modules/buffer-from": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.2.tgz",
      "integrity": "sha512-E+XQCRwSbaaiChtv6k6Dwgc+bx+Bs6vuKJHHl5kox/BaKbhiXzqQOwK4cO22yElGp2OCmjwVhT3HmxgyPGnJfQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/callsites": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
      "integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/camelcase": {
      "version": "5.3.1",
      "resolved": "https://registry.npmjs.org/camelcase/-/camelcase-5.3.1.tgz",
      "integrity": "sha512-L28STB170nwWS63UjtlEOE3dldQApaJXZkOI1uMFfzf3rRuPegHaHesyee+YxQ+W6SvRDQV6UrdOdRiR153wJg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/caniuse-lite": {
      "version": "1.0.30001734",
      "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001734.tgz",
      "integrity": "sha512-uhE1Ye5vgqju6OI71HTQqcBCZrvHugk0MjLak7Q+HfoBgoq5Bi+5YnwjP4fjDgrtYr/l8MVRBvzz9dPD4KyK0A==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/caniuse-lite"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "CC-BY-4.0"
    },
    "node_modules/chalk": {
      "version": "4.1.2",
      "resolved": "https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz",
      "integrity": "sha512-oKnbhFyRIXpUuez8iBMmyEa4nbj4IOQyuhc/wy9kY7/WVPcwIO9VA668Pu8RkO7+0G76SLROeyw9CpQ061i4mA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.1.0",
        "supports-color": "^7.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/chalk?sponsor=1"
      }
    },
    "node_modules/char-regex": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/char-regex/-/char-regex-1.0.2.tgz",
      "integrity": "sha512-kWWXztvZ5SBQV+eRgKFeh8q5sLuZY2+8WUIzlxWVTg+oGwY14qylx1KbKzHd8P6ZYkAg0xyIDU9JMHhyJMZ1jw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/ci-info": {
      "version": "3.9.0",
      "resolved": "https://registry.npmjs.org/ci-info/-/ci-info-3.9.0.tgz",
      "integrity": "sha512-NIxF55hv4nSqQswkAeiOi1r83xy8JldOFDTWiug55KBu9Jnblncd2U6ViHmYgHf01TPZS77NJBhBMKdWj9HQMQ==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/sibiraj-s"
        }
      ],
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/cjs-module-lexer": {
      "version": "1.4.3",
      "resolved": "https://registry.npmjs.org/cjs-module-lexer/-/cjs-module-lexer-1.4.3.tgz",
      "integrity": "sha512-9z8TZaGM1pfswYeXrUpzPrkx8UnWYdhJclsiYMm6x/w5+nN+8Tf/LnAgfLGQCm59qAOxU8WwHEq2vNwF6i4j+Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/cliui": {
      "version": "8.0.1",
      "resolved": "https://registry.npmjs.org/cliui/-/cliui-8.0.1.tgz",
      "integrity": "sha512-BSeNnyus75C4//NQ9gQt1/csTXyo/8Sb+afLAkzAptFuMsod9HFokGNudZpi/oQV73hnVK+sR+5PVRMd+Dr7YQ==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "string-width": "^4.2.0",
        "strip-ansi": "^6.0.1",
        "wrap-ansi": "^7.0.0"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/co": {
      "version": "4.6.0",
      "resolved": "https://registry.npmjs.org/co/-/co-4.6.0.tgz",
      "integrity": "sha512-QVb0dM5HvG+uaxitm8wONl7jltx8dqhfU33DcqtOZcLSVIKSDDLDi7+0LbAKiyI8hD9u42m2YxXSkMGWThaecQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "iojs": ">= 1.0.0",
        "node": ">= 0.12.0"
      }
    },
    "node_modules/collect-v8-coverage": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/collect-v8-coverage/-/collect-v8-coverage-1.0.2.tgz",
      "integrity": "sha512-lHl4d5/ONEbLlJvaJNtsF/Lz+WvB07u2ycqTYbdrq7UypDXailES4valYb2eWiJFxZlVmpGekfqoxQhzyFdT4Q==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/color-convert": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
      "integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "color-name": "~1.1.4"
      },
      "engines": {
        "node": ">=7.0.0"
      }
    },
    "node_modules/color-name": {
      "version": "1.1.4",
      "resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
      "integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/concat-map": {
      "version": "0.0.1",
      "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
      "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/convert-source-map": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/create-jest": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/create-jest/-/create-jest-29.7.0.tgz",
      "integrity": "sha512-Adz2bdH0Vq3F53KEMJOoftQFutWCukm6J24wbPWRO4k1kMY7gS7ds/uoJkNuV8wDCtWWnuwGcJwpWcih+zEW1Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "chalk": "^4.0.0",
        "exit": "^0.1.2",
        "graceful-fs": "^4.2.9",
        "jest-config": "^29.7.0",
        "jest-util": "^29.7.0",
        "prompts": "^2.0.1"
      },
      "bin": {
        "create-jest": "bin/create-jest.js"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/cross-spawn": {
      "version": "7.0.6",
      "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
      "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.1.0",
        "shebang-command": "^2.0.0",
        "which": "^2.0.1"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/debug": {
      "version": "4.4.1",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.1.tgz",
      "integrity": "sha512-KcKCqiftBJcZr++7ykoDIEwSa3XWowTfNPo92BYxjXiyYEVrUQh2aLyhxBCwww+heortUFxEJYcRzosstTEBYQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ms": "^2.1.3"
      },
      "engines": {
        "node": ">=6.0"
      },
      "peerDependenciesMeta": {
        "supports-color": {
          "optional": true
        }
      }
    },
    "node_modules/dedent": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/dedent/-/dedent-1.6.0.tgz",
      "integrity": "sha512-F1Z+5UCFpmQUzJa11agbyPVMbpgT/qA3/SKyJ1jyBgm7dUcUEa8v9JwDkerSQXfakBwFljIxhOJqGkjUwZ9FSA==",
      "dev": true,
      "license": "MIT",
      "peerDependencies": {
        "babel-plugin-macros": "^3.1.0"
      },
      "peerDependenciesMeta": {
        "babel-plugin-macros": {
          "optional": true
        }
      }
    },
    "node_modules/deepmerge": {
      "version": "4.3.1",
      "resolved": "https://registry.npmjs.org/deepmerge/-/deepmerge-4.3.1.tgz",
      "integrity": "sha512-3sUqbMEc77XqpdNO7FRyRog+eW3ph+GYCbj+rK+uYyRMuwsVy0rMiVtPn+QJlKFvWP/1PYpapqYn0Me2knFn+A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/detect-newline": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/detect-newline/-/detect-newline-3.1.0.tgz",
      "integrity": "sha512-TLz+x/vEXm/Y7P7wn1EJFNLxYpUD4TgMosxY6fAVJUnJMbupHBOncxyWUG9OpTaH9EBD7uFI5LfEgmMOc54DsA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/diff-sequences": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/diff-sequences/-/diff-sequences-29.6.3.tgz",
      "integrity": "sha512-EjePK1srD3P08o2j4f0ExnylqRs5B9tJjcp9t1krH2qRi8CCdsYfwe9JgSLurFBWwq4uOlipzfk5fHNvwFKr8Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/electron-to-chromium": {
      "version": "1.5.199",
      "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.199.tgz",
      "integrity": "sha512-3gl0S7zQd88kCAZRO/DnxtBKuhMO4h0EaQIN3YgZfV6+pW+5+bf2AdQeHNESCoaQqo/gjGVYEf2YM4O5HJQqpQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/emittery": {
      "version": "0.13.1",
      "resolved": "https://registry.npmjs.org/emittery/-/emittery-0.13.1.tgz",
      "integrity": "sha512-DeWwawk6r5yR9jFgnDKYt4sLS0LmHJJi3ZOnb5/JdbYwj3nW+FxQnHIjhBKz8YLC7oRNPVM9NQ47I3CVx34eqQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sindresorhus/emittery?sponsor=1"
      }
    },
    "node_modules/emoji-regex": {
      "version": "8.0.0",
      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz",
      "integrity": "sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/error-ex": {
      "version": "1.3.2",
      "resolved": "https://registry.npmjs.org/error-ex/-/error-ex-1.3.2.tgz",
      "integrity": "sha512-7dFHNmqeFSEt2ZBsCriorKnn3Z2pj+fd9kmI6QoWw4//DL+icEBfc0U7qJCisqrTsKTjw4fNFy2pW9OqStD84g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-arrayish": "^0.2.1"
      }
    },
    "node_modules/escalade": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
      "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/escape-string-regexp": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-2.0.0.tgz",
      "integrity": "sha512-UpzcLCXolUWcNu5HtVMHYdXJjArjsF9C0aNnquZYY4uW/Vu0miy5YoWvbV345HauVvcAUnpRuhMMcqTcGOY2+w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/esprima": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/esprima/-/esprima-4.0.1.tgz",
      "integrity": "sha512-eGuFFw7Upda+g4p+QHvnW0RyTX/SVeJBDM/gCtMARO0cLuT2HcEKnTPvhjV6aGeqrCB/sbNop0Kszm0jsaWU4A==",
      "dev": true,
      "license": "BSD-2-Clause",
      "bin": {
        "esparse": "bin/esparse.js",
        "esvalidate": "bin/esvalidate.js"
      },
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/execa": {
      "version": "5.1.1",
      "resolved": "https://registry.npmjs.org/execa/-/execa-5.1.1.tgz",
      "integrity": "sha512-8uSpZZocAZRBAPIEINJj3Lo9HyGitllczc27Eh5YYojjMFMn8yHMDMaUHE2Jqfq05D/wucwI4JGURyXt1vchyg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "cross-spawn": "^7.0.3",
        "get-stream": "^6.0.0",
        "human-signals": "^2.1.0",
        "is-stream": "^2.0.0",
        "merge-stream": "^2.0.0",
        "npm-run-path": "^4.0.1",
        "onetime": "^5.1.2",
        "signal-exit": "^3.0.3",
        "strip-final-newline": "^2.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sindresorhus/execa?sponsor=1"
      }
    },
    "node_modules/exit": {
      "version": "0.1.2",
      "resolved": "https://registry.npmjs.org/exit/-/exit-0.1.2.tgz",
      "integrity": "sha512-Zk/eNKV2zbjpKzrsQ+n1G6poVbErQxJ0LBOJXaKZ1EViLzH+hrLu9cdXI4zw9dBQJslwBEpbQ2P1oS7nDxs6jQ==",
      "dev": true,
      "engines": {
        "node": ">= 0.8.0"
      }
    },
    "node_modules/expect": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/expect/-/expect-29.7.0.tgz",
      "integrity": "sha512-2Zks0hf1VLFYI1kbh0I5jP3KHHyCHpkfyHBzsSXRFgl/Bg9mWYfMW8oD+PdMPlEwy5HNsR9JutYy6pMeOh61nw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/expect-utils": "^29.7.0",
        "jest-get-type": "^29.6.3",
        "jest-matcher-utils": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-util": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/fast-json-stable-stringify": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
      "integrity": "sha512-lhd/wF+Lk98HZoTCtlVraHtfh5XYijIjalXck7saUtuanSDyLMxnHhSXEDJqHxD7msR8D0uCmqlkwjCV8xvwHw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/fb-watchman": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/fb-watchman/-/fb-watchman-2.0.2.tgz",
      "integrity": "sha512-p5161BqbuCaSnB8jIbzQHOlpgsPmK5rJVDfDKO91Axs5NC1uu3HRQm6wt9cd9/+GtQQIO53JdGXXoyDpTAsgYA==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "bser": "2.1.1"
      }
    },
    "node_modules/fill-range": {
      "version": "7.1.1",
      "resolved": "https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz",
      "integrity": "sha512-YsGpe3WHLK8ZYi4tWDg2Jy3ebRz2rXowDxnld4bkQB00cc/1Zw9AWnC0i9ztDJitivtQvaI9KaLyKrc+hBW0yg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "to-regex-range": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/find-up": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/find-up/-/find-up-4.1.0.tgz",
      "integrity": "sha512-PpOwAdQ/YlXQ2vj8a3h8IipDuYRi3wceVQQGYWxNINccq40Anw7BlsEXCMbt1Zt+OLA6Fq9suIpIWD0OsnISlw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "locate-path": "^5.0.0",
        "path-exists": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/fs.realpath": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/fs.realpath/-/fs.realpath-1.0.0.tgz",
      "integrity": "sha512-OO0pH2lK6a0hZnAdau5ItzHPI6pUlvI7jMVnxUQRtw4owF2wk8lOSabtGDCTP4Ggrg2MbGnWO9X8K1t4+fGMDw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "node_modules/ftejs-client": {
      "resolved": "client",
      "link": true
    },
    "node_modules/ftejs-server": {
      "resolved": "server",
      "link": true
    },
    "node_modules/function-bind": {
      "version": "1.1.2",
      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/gensync": {
      "version": "1.0.0-beta.2",
      "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
      "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/get-caller-file": {
      "version": "2.0.5",
      "resolved": "https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz",
      "integrity": "sha512-DyFP3BM/3YHTQOCUL/w0OZHR0lpKeGrxotcHWcqNEdnltqFwXVfhEBQ94eIo34AfQpo0rGki4cyIiftY06h2Fg==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": "6.* || 8.* || >= 10.*"
      }
    },
    "node_modules/get-package-type": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/get-package-type/-/get-package-type-0.1.0.tgz",
      "integrity": "sha512-pjzuKtY64GYfWizNAJ0fr9VqttZkNiK2iS430LtIHzjBEr6bX8Am2zm4sW4Ro5wjWW5cAlRL1qAMTcXbjNAO2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8.0.0"
      }
    },
    "node_modules/get-stream": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/get-stream/-/get-stream-6.0.1.tgz",
      "integrity": "sha512-ts6Wi+2j3jQjqi70w5AlN8DFnkSwC+MqmxEzdEALB2qXZYV3X/b1CTfgPLGJNMeAWxdPfU8FO1ms3NUfaHCPYg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/glob": {
      "version": "7.2.3",
      "resolved": "https://registry.npmjs.org/glob/-/glob-7.2.3.tgz",
      "integrity": "sha512-nFR0zLpU2YCaRxwoCJvL6UvCH2JFyFVIvwTLsIf21AuHlMskA1hhTdk+LlYJtOlYt9v6dvszD2BGRqBL+iQK9Q==",
      "deprecated": "Glob versions prior to v9 are no longer supported",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "fs.realpath": "^1.0.0",
        "inflight": "^1.0.4",
        "inherits": "2",
        "minimatch": "^3.1.1",
        "once": "^1.3.0",
        "path-is-absolute": "^1.0.0"
      },
      "engines": {
        "node": "*"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "node_modules/glob/node_modules/brace-expansion": {
      "version": "1.1.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.12.tgz",
      "integrity": "sha512-9T9UjW3r0UW5c1Q7GTwllptXwhvYmEzFhzMfZ9H7FQWt+uZePjZPjBP/W1ZEyZ1twGWom5/56TF4lPcqjnDHcg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/glob/node_modules/minimatch": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.2.tgz",
      "integrity": "sha512-J7p63hRiAjw1NDEww1W7i37+ByIrOWO5XQQAzZ3VOcL0PNybwpfmV/N05zFAzwQ9USyEcX6t3UO+K5aqBQOIHw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/graceful-fs": {
      "version": "4.2.11",
      "resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz",
      "integrity": "sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/has-flag": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
      "integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/hasown": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.2.tgz",
      "integrity": "sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "function-bind": "^1.1.2"
      },
      "engines": {
        "node": ">= 0.4"
      }
    },
    "node_modules/html-escaper": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/html-escaper/-/html-escaper-2.0.2.tgz",
      "integrity": "sha512-H2iMtd0I4Mt5eYiapRdIDjp+XzelXQ0tFE4JS7YFwFevXXMmOp9myNrUvCg0D6ws8iqkRPBfKHgbwig1SmlLfg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/human-signals": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/human-signals/-/human-signals-2.1.0.tgz",
      "integrity": "sha512-B4FFZ6q/T2jhhksgkbEW3HBvWIfDW85snkQgawt07S7J5QXTk6BkNV+0yAeZrM5QpMAdYlocGoljn0sJ/WQkFw==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=10.17.0"
      }
    },
    "node_modules/import-local": {
      "version": "3.2.0",
      "resolved": "https://registry.npmjs.org/import-local/-/import-local-3.2.0.tgz",
      "integrity": "sha512-2SPlun1JUPWoM6t3F0dw0FkCF/jWY8kttcY4f599GLTSjh2OCuuhdTkJQsEcZzBqbXZGKMK2OqW1oZsjtf/gQA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "pkg-dir": "^4.2.0",
        "resolve-cwd": "^3.0.0"
      },
      "bin": {
        "import-local-fixture": "fixtures/cli.js"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/imurmurhash": {
      "version": "0.1.4",
      "resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
      "integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.8.19"
      }
    },
    "node_modules/inflight": {
      "version": "1.0.6",
      "resolved": "https://registry.npmjs.org/inflight/-/inflight-1.0.6.tgz",
      "integrity": "sha512-k92I/b08q4wvFscXCLvqfsHCrjrF7yiXsQuIVvVE7N82W3+aqpzuUdBbfhWcy/FZR3/4IgflMgKLOsvPDrGCJA==",
      "deprecated": "This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "once": "^1.3.0",
        "wrappy": "1"
      }
    },
    "node_modules/inherits": {
      "version": "2.0.4",
      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/is-arrayish": {
      "version": "0.2.1",
      "resolved": "https://registry.npmjs.org/is-arrayish/-/is-arrayish-0.2.1.tgz",
      "integrity": "sha512-zz06S8t0ozoDXMG+ube26zeCTNXcKIPJZJi8hBrF4idCLms4CG9QtK7qBl1boi5ODzFpjswb5JPmHCbMpjaYzg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/is-core-module": {
      "version": "2.16.1",
      "resolved": "https://registry.npmjs.org/is-core-module/-/is-core-module-2.16.1.tgz",
      "integrity": "sha512-UfoeMA6fIJ8wTYFEUjelnaGI67v6+N7qXJEvQuIGa99l4xsCruSYOVSQ0uPANn4dAzm8lkYPaKLrrijLq7x23w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "hasown": "^2.0.2"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/is-fullwidth-code-point": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz",
      "integrity": "sha512-zymm5+u+sCsSWyD9qNaejV3DFvhCKclKdizYaJUuHA83RLjb7nSuGnddCHGv0hk+KY7BMAlsWeK4Ueg6EV6XQg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/is-generator-fn": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/is-generator-fn/-/is-generator-fn-2.1.0.tgz",
      "integrity": "sha512-cTIB4yPYL/Grw0EaSzASzg6bBy9gqCofvWN8okThAYIxKJZC+udlRAmGbM0XLeniEJSs8uEgHPGuHSe1XsOLSQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/is-number": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
      "integrity": "sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.12.0"
      }
    },
    "node_modules/is-stream": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/is-stream/-/is-stream-2.0.1.tgz",
      "integrity": "sha512-hFoiJiTl63nn+kstHGBtewWSKnQLpyb155KHheA1l39uvtO9nWIop1p3udqPcUd/xbF1VLMO4n7OI6p7RbngDg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/isexe": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
      "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/istanbul-lib-coverage": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/istanbul-lib-coverage/-/istanbul-lib-coverage-3.2.2.tgz",
      "integrity": "sha512-O8dpsF+r0WV/8MNRKfnmrtCWhuKjxrq2w+jpzBL5UZKTi2LeVWnWOmWRxFlesJONmc+wLAGvKQZEOanko0LFTg==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/istanbul-lib-instrument": {
      "version": "6.0.3",
      "resolved": "https://registry.npmjs.org/istanbul-lib-instrument/-/istanbul-lib-instrument-6.0.3.tgz",
      "integrity": "sha512-Vtgk7L/R2JHyyGW07spoFlB8/lpjiOLTjMdms6AFMraYt3BaJauod/NGrfnVG/y4Ix1JEuMRPDPEj2ua+zz1/Q==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "@babel/core": "^7.23.9",
        "@babel/parser": "^7.23.9",
        "@istanbuljs/schema": "^0.1.3",
        "istanbul-lib-coverage": "^3.2.0",
        "semver": "^7.5.4"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/istanbul-lib-report": {
      "version": "3.0.1",
      "resolved": "https://registry.npmjs.org/istanbul-lib-report/-/istanbul-lib-report-3.0.1.tgz",
      "integrity": "sha512-GCfE1mtsHGOELCU8e/Z7YWzpmybrx/+dSTfLrvY8qRmaY6zXTKWn6WQIjaAFw069icm6GVMNkgu0NzI4iPZUNw==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "istanbul-lib-coverage": "^3.0.0",
        "make-dir": "^4.0.0",
        "supports-color": "^7.1.0"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/istanbul-lib-source-maps": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/istanbul-lib-source-maps/-/istanbul-lib-source-maps-4.0.1.tgz",
      "integrity": "sha512-n3s8EwkdFIJCG3BPKBYvskgXGoy88ARzvegkitk60NxRdwltLOTaH7CUiMRXvwYorl0Q712iEjcWB+fK/MrWVw==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "debug": "^4.1.1",
        "istanbul-lib-coverage": "^3.0.0",
        "source-map": "^0.6.1"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/istanbul-reports": {
      "version": "3.1.7",
      "resolved": "https://registry.npmjs.org/istanbul-reports/-/istanbul-reports-3.1.7.tgz",
      "integrity": "sha512-BewmUXImeuRk2YY0PVbxgKAysvhRPUQE0h5QRM++nVWyubKGV0l8qQ5op8+B2DOmwSe63Jivj0BjkPQVf8fP5g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "html-escaper": "^2.0.0",
        "istanbul-lib-report": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/jest": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest/-/jest-29.7.0.tgz",
      "integrity": "sha512-NIy3oAFp9shda19hy4HK0HRTWKtPJmGdnvywu01nOqNC2vZg+Z+fvJDxpMQA88eb2I9EcafcdjYgsDthnYTvGw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/core": "^29.7.0",
        "@jest/types": "^29.6.3",
        "import-local": "^3.0.2",
        "jest-cli": "^29.7.0"
      },
      "bin": {
        "jest": "bin/jest.js"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "node-notifier": "^8.0.1 || ^9.0.0 || ^10.0.0"
      },
      "peerDependenciesMeta": {
        "node-notifier": {
          "optional": true
        }
      }
    },
    "node_modules/jest-changed-files": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-changed-files/-/jest-changed-files-29.7.0.tgz",
      "integrity": "sha512-fEArFiwf1BpQ+4bXSprcDc3/x4HSzL4al2tozwVpDFpsxALjLYdyiIK4e5Vz66GQJIbXJ82+35PtysofptNX2w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "execa": "^5.0.0",
        "jest-util": "^29.7.0",
        "p-limit": "^3.1.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-circus": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-circus/-/jest-circus-29.7.0.tgz",
      "integrity": "sha512-3E1nCMgipcTkCocFwM90XXQab9bS+GMsjdpmPrlelaxwD93Ad8iVEjX/vvHPdLPnFf+L40u+5+iutRdA1N9myw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/environment": "^29.7.0",
        "@jest/expect": "^29.7.0",
        "@jest/test-result": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "co": "^4.6.0",
        "dedent": "^1.0.0",
        "is-generator-fn": "^2.0.0",
        "jest-each": "^29.7.0",
        "jest-matcher-utils": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-runtime": "^29.7.0",
        "jest-snapshot": "^29.7.0",
        "jest-util": "^29.7.0",
        "p-limit": "^3.1.0",
        "pretty-format": "^29.7.0",
        "pure-rand": "^6.0.0",
        "slash": "^3.0.0",
        "stack-utils": "^2.0.3"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-cli": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-cli/-/jest-cli-29.7.0.tgz",
      "integrity": "sha512-OVVobw2IubN/GSYsxETi+gOe7Ka59EFMR/twOU3Jb2GnKKeMGJB5SGUUrEz3SFVmJASUdZUzy83sLNNQ2gZslg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/core": "^29.7.0",
        "@jest/test-result": "^29.7.0",
        "@jest/types": "^29.6.3",
        "chalk": "^4.0.0",
        "create-jest": "^29.7.0",
        "exit": "^0.1.2",
        "import-local": "^3.0.2",
        "jest-config": "^29.7.0",
        "jest-util": "^29.7.0",
        "jest-validate": "^29.7.0",
        "yargs": "^17.3.1"
      },
      "bin": {
        "jest": "bin/jest.js"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "node-notifier": "^8.0.1 || ^9.0.0 || ^10.0.0"
      },
      "peerDependenciesMeta": {
        "node-notifier": {
          "optional": true
        }
      }
    },
    "node_modules/jest-config": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-config/-/jest-config-29.7.0.tgz",
      "integrity": "sha512-uXbpfeQ7R6TZBqI3/TxCU4q4ttk3u0PJeC+E0zbfSoSjq6bJ7buBPxzQPL0ifrkY4DNu4JUdk0ImlBUYi840eQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.11.6",
        "@jest/test-sequencer": "^29.7.0",
        "@jest/types": "^29.6.3",
        "babel-jest": "^29.7.0",
        "chalk": "^4.0.0",
        "ci-info": "^3.2.0",
        "deepmerge": "^4.2.2",
        "glob": "^7.1.3",
        "graceful-fs": "^4.2.9",
        "jest-circus": "^29.7.0",
        "jest-environment-node": "^29.7.0",
        "jest-get-type": "^29.6.3",
        "jest-regex-util": "^29.6.3",
        "jest-resolve": "^29.7.0",
        "jest-runner": "^29.7.0",
        "jest-util": "^29.7.0",
        "jest-validate": "^29.7.0",
        "micromatch": "^4.0.4",
        "parse-json": "^5.2.0",
        "pretty-format": "^29.7.0",
        "slash": "^3.0.0",
        "strip-json-comments": "^3.1.1"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "peerDependencies": {
        "@types/node": "*",
        "ts-node": ">=9.0.0"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "ts-node": {
          "optional": true
        }
      }
    },
    "node_modules/jest-diff": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-diff/-/jest-diff-29.7.0.tgz",
      "integrity": "sha512-LMIgiIrhigmPrs03JHpxUh2yISK3vLFPkAodPeo0+BuF7wA2FoQbkEg1u8gBYBThncu7e1oEDUfIXVuTqLRUjw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "chalk": "^4.0.0",
        "diff-sequences": "^29.6.3",
        "jest-get-type": "^29.6.3",
        "pretty-format": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-docblock": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-docblock/-/jest-docblock-29.7.0.tgz",
      "integrity": "sha512-q617Auw3A612guyaFgsbFeYpNP5t2aoUNLwBUbc/0kD1R4t9ixDbyFTHd1nok4epoVFpr7PmeWHrhvuV3XaJ4g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "detect-newline": "^3.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-each": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-each/-/jest-each-29.7.0.tgz",
      "integrity": "sha512-gns+Er14+ZrEoC5fhOfYCY1LOHHr0TI+rQUHZS8Ttw2l7gl+80eHc/gFf2Ktkw0+SIACDTeWvpFcv3B04VembQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "chalk": "^4.0.0",
        "jest-get-type": "^29.6.3",
        "jest-util": "^29.7.0",
        "pretty-format": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-environment-node": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-environment-node/-/jest-environment-node-29.7.0.tgz",
      "integrity": "sha512-DOSwCRqXirTOyheM+4d5YZOrWcdu0LNZ87ewUoywbcb2XR4wKgqiG8vNeYwhjFMbEkfju7wx2GYH0P2gevGvFw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/environment": "^29.7.0",
        "@jest/fake-timers": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "jest-mock": "^29.7.0",
        "jest-util": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-get-type": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/jest-get-type/-/jest-get-type-29.6.3.tgz",
      "integrity": "sha512-zrteXnqYxfQh7l5FHyL38jL39di8H8rHoecLH3JNxH3BwOrBsNeabdap5e0I23lD4HHI8W5VFBZqG4Eaq5LNcw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-haste-map": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-haste-map/-/jest-haste-map-29.7.0.tgz",
      "integrity": "sha512-fP8u2pyfqx0K1rGn1R9pyE0/KTn+G7PxktWidOBTqFPLYX0b9ksaMFkhK5vrS3DVun09pckLdlx90QthlW7AmA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "@types/graceful-fs": "^4.1.3",
        "@types/node": "*",
        "anymatch": "^3.0.3",
        "fb-watchman": "^2.0.0",
        "graceful-fs": "^4.2.9",
        "jest-regex-util": "^29.6.3",
        "jest-util": "^29.7.0",
        "jest-worker": "^29.7.0",
        "micromatch": "^4.0.4",
        "walker": "^1.0.8"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      },
      "optionalDependencies": {
        "fsevents": "^2.3.2"
      }
    },
    "node_modules/jest-leak-detector": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-leak-detector/-/jest-leak-detector-29.7.0.tgz",
      "integrity": "sha512-kYA8IJcSYtST2BY9I+SMC32nDpBT3J2NvWJx8+JCuCdl/CR1I4EKUJROiP8XtCcxqgTTBGJNdbB1A8XRKbTetw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "jest-get-type": "^29.6.3",
        "pretty-format": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-matcher-utils": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-matcher-utils/-/jest-matcher-utils-29.7.0.tgz",
      "integrity": "sha512-sBkD+Xi9DtcChsI3L3u0+N0opgPYnCRPtGcQYrgXmR+hmt/fYfWAL0xRXYU8eWOdfuLgBe0YCW3AFtnRLagq/g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "chalk": "^4.0.0",
        "jest-diff": "^29.7.0",
        "jest-get-type": "^29.6.3",
        "pretty-format": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-message-util": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-message-util/-/jest-message-util-29.7.0.tgz",
      "integrity": "sha512-GBEV4GRADeP+qtB2+6u61stea8mGcOT4mCtrYISZwfu9/ISHFJ/5zOMXYbpBE9RsS5+Gb63DW4FgmnKJ79Kf6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.12.13",
        "@jest/types": "^29.6.3",
        "@types/stack-utils": "^2.0.0",
        "chalk": "^4.0.0",
        "graceful-fs": "^4.2.9",
        "micromatch": "^4.0.4",
        "pretty-format": "^29.7.0",
        "slash": "^3.0.0",
        "stack-utils": "^2.0.3"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-mock": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-mock/-/jest-mock-29.7.0.tgz",
      "integrity": "sha512-ITOMZn+UkYS4ZFh83xYAOzWStloNzJFO2s8DWrE4lhtGD+AorgnbkiKERe4wQVBydIGPx059g6riW5Btp6Llnw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "jest-util": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-pnp-resolver": {
      "version": "1.2.3",
      "resolved": "https://registry.npmjs.org/jest-pnp-resolver/-/jest-pnp-resolver-1.2.3.tgz",
      "integrity": "sha512-+3NpwQEnRoIBtx4fyhblQDPgJI0H1IEIkX7ShLUjPGA7TtUTvI1oiKi3SR4oBR0hQhQR80l4WAe5RrXBwWMA8w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      },
      "peerDependencies": {
        "jest-resolve": "*"
      },
      "peerDependenciesMeta": {
        "jest-resolve": {
          "optional": true
        }
      }
    },
    "node_modules/jest-regex-util": {
      "version": "29.6.3",
      "resolved": "https://registry.npmjs.org/jest-regex-util/-/jest-regex-util-29.6.3.tgz",
      "integrity": "sha512-KJJBsRCyyLNWCNBOvZyRDnAIfUiRJ8v+hOBQYGn8gDyF3UegwiP4gwRR3/SDa42g1YbVycTidUF3rKjyLFDWbg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-resolve": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-resolve/-/jest-resolve-29.7.0.tgz",
      "integrity": "sha512-IOVhZSrg+UvVAshDSDtHyFCCBUl/Q3AAJv8iZ6ZjnZ74xzvwuzLXid9IIIPgTnY62SJjfuupMKZsZQRsCvxEgA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "chalk": "^4.0.0",
        "graceful-fs": "^4.2.9",
        "jest-haste-map": "^29.7.0",
        "jest-pnp-resolver": "^1.2.2",
        "jest-util": "^29.7.0",
        "jest-validate": "^29.7.0",
        "resolve": "^1.20.0",
        "resolve.exports": "^2.0.0",
        "slash": "^3.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-resolve-dependencies": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-resolve-dependencies/-/jest-resolve-dependencies-29.7.0.tgz",
      "integrity": "sha512-un0zD/6qxJ+S0et7WxeI3H5XSe9lTBBR7bOHCHXkKR6luG5mwDDlIzVQ0V5cZCuoTgEdcdwzTghYkTWfubi+nA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "jest-regex-util": "^29.6.3",
        "jest-snapshot": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-runner": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-runner/-/jest-runner-29.7.0.tgz",
      "integrity": "sha512-fsc4N6cPCAahybGBfTRcq5wFR6fpLznMg47sY5aDpsoejOcVYFb07AHuSnR0liMcPTgBsA3ZJL6kFOjPdoNipQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/console": "^29.7.0",
        "@jest/environment": "^29.7.0",
        "@jest/test-result": "^29.7.0",
        "@jest/transform": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "emittery": "^0.13.1",
        "graceful-fs": "^4.2.9",
        "jest-docblock": "^29.7.0",
        "jest-environment-node": "^29.7.0",
        "jest-haste-map": "^29.7.0",
        "jest-leak-detector": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-resolve": "^29.7.0",
        "jest-runtime": "^29.7.0",
        "jest-util": "^29.7.0",
        "jest-watcher": "^29.7.0",
        "jest-worker": "^29.7.0",
        "p-limit": "^3.1.0",
        "source-map-support": "0.5.13"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-runtime": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-runtime/-/jest-runtime-29.7.0.tgz",
      "integrity": "sha512-gUnLjgwdGqW7B4LvOIkbKs9WGbn+QLqRQQ9juC6HndeDiezIwhDP+mhMwHWCEcfQ5RUXa6OPnFF8BJh5xegwwQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/environment": "^29.7.0",
        "@jest/fake-timers": "^29.7.0",
        "@jest/globals": "^29.7.0",
        "@jest/source-map": "^29.6.3",
        "@jest/test-result": "^29.7.0",
        "@jest/transform": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "cjs-module-lexer": "^1.0.0",
        "collect-v8-coverage": "^1.0.0",
        "glob": "^7.1.3",
        "graceful-fs": "^4.2.9",
        "jest-haste-map": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-mock": "^29.7.0",
        "jest-regex-util": "^29.6.3",
        "jest-resolve": "^29.7.0",
        "jest-snapshot": "^29.7.0",
        "jest-util": "^29.7.0",
        "slash": "^3.0.0",
        "strip-bom": "^4.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-snapshot": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-snapshot/-/jest-snapshot-29.7.0.tgz",
      "integrity": "sha512-Rm0BMWtxBcioHr1/OX5YCP8Uov4riHvKPknOGs804Zg9JGZgmIBkbtlxJC/7Z4msKYVbIJtfU+tKb8xlYNfdkw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/core": "^7.11.6",
        "@babel/generator": "^7.7.2",
        "@babel/plugin-syntax-jsx": "^7.7.2",
        "@babel/plugin-syntax-typescript": "^7.7.2",
        "@babel/types": "^7.3.3",
        "@jest/expect-utils": "^29.7.0",
        "@jest/transform": "^29.7.0",
        "@jest/types": "^29.6.3",
        "babel-preset-current-node-syntax": "^1.0.0",
        "chalk": "^4.0.0",
        "expect": "^29.7.0",
        "graceful-fs": "^4.2.9",
        "jest-diff": "^29.7.0",
        "jest-get-type": "^29.6.3",
        "jest-matcher-utils": "^29.7.0",
        "jest-message-util": "^29.7.0",
        "jest-util": "^29.7.0",
        "natural-compare": "^1.4.0",
        "pretty-format": "^29.7.0",
        "semver": "^7.5.3"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-util": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-util/-/jest-util-29.7.0.tgz",
      "integrity": "sha512-z6EbKajIpqGKU56y5KBUgy1dt1ihhQJgWzUlZHArA/+X2ad7Cb5iF+AK1EWVL/Bo7Rz9uurpqw6SiBCefUbCGA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "chalk": "^4.0.0",
        "ci-info": "^3.2.0",
        "graceful-fs": "^4.2.9",
        "picomatch": "^2.2.3"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-validate": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-validate/-/jest-validate-29.7.0.tgz",
      "integrity": "sha512-ZB7wHqaRGVw/9hST/OuFUReG7M8vKeq0/J2egIGLdvjHCmYqGARhzXmtgi+gVeZ5uXFF219aOc3Ls2yLg27tkw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/types": "^29.6.3",
        "camelcase": "^6.2.0",
        "chalk": "^4.0.0",
        "jest-get-type": "^29.6.3",
        "leven": "^3.1.0",
        "pretty-format": "^29.7.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-validate/node_modules/camelcase": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/camelcase/-/camelcase-6.3.0.tgz",
      "integrity": "sha512-Gmy6FhYlCY7uOElZUSbxo2UCDH8owEk996gkbrpsgGtrJLM3J7jGxl9Ic7Qwwj4ivOE5AWZWRMecDdF7hqGjFA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/jest-watcher": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-watcher/-/jest-watcher-29.7.0.tgz",
      "integrity": "sha512-49Fg7WXkU3Vl2h6LbLtMQ/HyB6rXSIX7SqvBLQmssRBGN9I0PNvPmAmCWSOY6SOvrjhI/F7/bGAv9RtnsPA03g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/test-result": "^29.7.0",
        "@jest/types": "^29.6.3",
        "@types/node": "*",
        "ansi-escapes": "^4.2.1",
        "chalk": "^4.0.0",
        "emittery": "^0.13.1",
        "jest-util": "^29.7.0",
        "string-length": "^4.0.1"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-worker": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/jest-worker/-/jest-worker-29.7.0.tgz",
      "integrity": "sha512-eIz2msL/EzL9UFTFFx7jBTkeZfku0yUAyZZZmJ93H2TYEiroIx2PQjEXcwYtYl8zXCxb+PAmA2hLIt/6ZEkPHw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/node": "*",
        "jest-util": "^29.7.0",
        "merge-stream": "^2.0.0",
        "supports-color": "^8.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/jest-worker/node_modules/supports-color": {
      "version": "8.1.1",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-8.1.1.tgz",
      "integrity": "sha512-MpUEN2OodtUzxvKQl72cUF7RQ5EiHsGvSsVG0ia9c5RbWGL2CI4C7EpPS8UTBIplnlzZiNuV56w+FuNxy3ty2Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/supports-color?sponsor=1"
      }
    },
    "node_modules/js-tokens": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
      "integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/js-yaml": {
      "version": "3.14.1",
      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-3.14.1.tgz",
      "integrity": "sha512-okMH7OXXJ7YrN9Ok3/SXrnu4iX9yOk+25nqX4imS2npuvTYDmo/QEZoqwZkYaIDk3jVvBOTOIEgEhaLOynBS9g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "argparse": "^1.0.7",
        "esprima": "^4.0.0"
      },
      "bin": {
        "js-yaml": "bin/js-yaml.js"
      }
    },
    "node_modules/jsesc": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
      "integrity": "sha512-/sM3dO2FOzXjKQhJuo0Q173wf2KOo8t4I8vHy6lF9poUp7bKT0/NHE8fPX23PwfhnykfqnC2xRxOnVw5XuGIaA==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "jsesc": "bin/jsesc"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/json-parse-even-better-errors": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/json-parse-even-better-errors/-/json-parse-even-better-errors-2.3.1.tgz",
      "integrity": "sha512-xyFwyhro/JEof6Ghe2iz2NcXoj2sloNsWr/XsERDK/oiPCfaNhl5ONfp+jQdAZRQQ0IJWNzH9zIZF7li91kh2w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/json5": {
      "version": "2.2.3",
      "resolved": "https://registry.npmjs.org/json5/-/json5-2.2.3.tgz",
      "integrity": "sha512-XmOWe7eyHYH14cLdVPoyg+GOH3rYX++KpzrylJwSW98t3Nk+U8XOl8FWKOgwtzdb8lXGf6zYwDUzeHMWfxasyg==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "json5": "lib/cli.js"
      },
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/kleur": {
      "version": "3.0.3",
      "resolved": "https://registry.npmjs.org/kleur/-/kleur-3.0.3.tgz",
      "integrity": "sha512-eTIzlVOSUR+JxdDFepEYcBMtZ9Qqdef+rnzWdRZuMbOywu5tO2w2N7rqjoANZ5k9vywhL6Br1VRjUIgTQx4E8w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/leven": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/leven/-/leven-3.1.0.tgz",
      "integrity": "sha512-qsda+H8jTaUaN/x5vzW2rzc+8Rw4TAQ/4KjB46IwK5VH+IlVeeeje/EoZRpiXvIqjFgK84QffqPztGI3VBLG1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/lines-and-columns": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/lines-and-columns/-/lines-and-columns-1.2.4.tgz",
      "integrity": "sha512-7ylylesZQ/PV29jhEDl3Ufjo6ZX7gCqJr5F7PKrqc93v7fzSymt1BpwEU8nAUXs8qzzvqhbjhK5QZg6Mt/HkBg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/locate-path": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-5.0.0.tgz",
      "integrity": "sha512-t7hw9pI+WvuwNJXwk5zVHpyhIqzg2qTlklJOf0mVxGSbe3Fp2VieZcduNYjaLDoy6p9uGpQEGWG87WpMKlNq8g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-locate": "^4.1.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/lru-cache": {
      "version": "5.1.1",
      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
      "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "yallist": "^3.0.2"
      }
    },
    "node_modules/make-dir": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/make-dir/-/make-dir-4.0.0.tgz",
      "integrity": "sha512-hXdUTZYIVOt1Ex//jAQi+wTZZpUpwBj/0QsOzqegb3rGMMeJiSEu5xLHnYfBrRV4RH2+OCSOO95Is/7x1WJ4bw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "semver": "^7.5.3"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/makeerror": {
      "version": "1.0.12",
      "resolved": "https://registry.npmjs.org/makeerror/-/makeerror-1.0.12.tgz",
      "integrity": "sha512-JmqCvUhmt43madlpFzG4BQzG2Z3m6tvQDNKdClZnO3VbIudJYmxsT0FNJMeiB2+JTSlTQTSbU8QdesVmwJcmLg==",
      "dev": true,
      "license": "BSD-3-Clause",
      "dependencies": {
        "tmpl": "1.0.5"
      }
    },
    "node_modules/merge-stream": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/merge-stream/-/merge-stream-2.0.0.tgz",
      "integrity": "sha512-abv/qOcuPfk3URPfDzmZU1LKmuw8kT+0nIHvKrKgFrwifol/doWcdA4ZqsWQ8ENrFKkd67Mfpo/LovbIUsbt3w==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/micromatch": {
      "version": "4.0.8",
      "resolved": "https://registry.npmjs.org/micromatch/-/micromatch-4.0.8.tgz",
      "integrity": "sha512-PXwfBhYu0hBCPw8Dn0E+WDYb7af3dSLVWKi3HGv84IdF4TyFoC0ysxFd0Goxw7nSv4T/PzEJQxsYsEiFCKo2BA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "braces": "^3.0.3",
        "picomatch": "^2.3.1"
      },
      "engines": {
        "node": ">=8.6"
      }
    },
    "node_modules/mimic-fn": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/mimic-fn/-/mimic-fn-2.1.0.tgz",
      "integrity": "sha512-OqbOk5oEQeAZ8WXWydlu9HJjz9WVdEIvamMCcXmuqUYjTknH/sqsWvhQ3vgwKFRR1HpjvNBKQ37nbJgYzGqGcg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/minimatch": {
      "version": "5.1.6",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-5.1.6.tgz",
      "integrity": "sha512-lKwV/1brpG6mBUFHtb7NUmtABCb2WZZmm2wNiOA5hAb8VdCS4B3dtMWyvcoViccwAW/COERjXLt0zP1zXUN26g==",
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^2.0.1"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/ms": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
      "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/natural-compare": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
      "integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/node-int64": {
      "version": "0.4.0",
      "resolved": "https://registry.npmjs.org/node-int64/-/node-int64-0.4.0.tgz",
      "integrity": "sha512-O5lz91xSOeoXP6DulyHfllpq+Eg00MWitZIbtPfoSEvqIHdl5gfcY6hYzDWnj0qD5tz52PI08u9qUvSVeUBeHw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/node-releases": {
      "version": "2.0.19",
      "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.19.tgz",
      "integrity": "sha512-xxOWJsBKtzAq7DY0J+DTzuz58K8e7sJbdgwkbMWQe8UYB6ekmsQ45q0M/tJDsGaZmbC+l7n57UV8Hl5tHxO9uw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/normalize-path": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz",
      "integrity": "sha512-6eZs5Ls3WtCisHWp9S2GUy8dqkpGi4BVSz3GaqiE6ezub0512ESztXUwUB6C6IKbQkY2Pnb/mD4WYojCRwcwLA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/npm-run-path": {
      "version": "4.0.1",
      "resolved": "https://registry.npmjs.org/npm-run-path/-/npm-run-path-4.0.1.tgz",
      "integrity": "sha512-S48WzZW777zhNIrn7gxOlISNAqi9ZC/uQFnRdbeIHhZhCA6UqpkOT8T1G7BvfdgP4Er8gF4sUbaS0i7QvIfCWw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "path-key": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/onetime": {
      "version": "5.1.2",
      "resolved": "https://registry.npmjs.org/onetime/-/onetime-5.1.2.tgz",
      "integrity": "sha512-kbpaSSGJTWdAY5KPVeMOKXSrPtr8C8C7wodJbcsd51jRnmD+GZu8Y0VoU6Dm5Z4vWr0Ig/1NKuWRKf7j5aaYSg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "mimic-fn": "^2.1.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-limit": {
      "version": "3.1.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "yocto-queue": "^0.1.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-locate": {
      "version": "4.1.0",
      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-4.1.0.tgz",
      "integrity": "sha512-R79ZZ/0wAxKGu3oYMlz8jy/kbhsNrS7SKZ7PxEHBgJ5+F2mtFW2fK2cOtBh1cHYkQsbzFV7I+EoRKe6Yt0oK7A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-limit": "^2.2.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/p-locate/node_modules/p-limit": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-2.3.0.tgz",
      "integrity": "sha512-//88mFWSJx8lxCzwdAABTJL2MyWB12+eIY7MDL2SqLmAkeKU9qxRvWuSyTjm3FUmpBEMuFfckAIqEaVGUDxb6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "p-try": "^2.0.0"
      },
      "engines": {
        "node": ">=6"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/p-try": {
      "version": "2.2.0",
      "resolved": "https://registry.npmjs.org/p-try/-/p-try-2.2.0.tgz",
      "integrity": "sha512-R4nPAVTAU0B9D35/Gk3uJf/7XYbQcyohSKdvAxIRSNghFl4e71hVoGnBNQz9cWaXxO2I10KTC+3jMdvvoKw6dQ==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/parse-json": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/parse-json/-/parse-json-5.2.0.tgz",
      "integrity": "sha512-ayCKvm/phCGxOkYRSCM82iDwct8/EonSEgCSxWxD7ve6jHggsFl4fZVQBPRNgQoKiuV/odhFrGzQXZwbifC8Rg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/code-frame": "^7.0.0",
        "error-ex": "^1.3.1",
        "json-parse-even-better-errors": "^2.3.0",
        "lines-and-columns": "^1.1.6"
      },
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/path-exists": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-is-absolute": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz",
      "integrity": "sha512-AVbw3UJ2e9bq64vSaS9Am0fje1Pa8pbGqTTsmXfaIiMpnr5DlDhfJOuLj9Sf95ZPVDAUerDfEk88MPmPe7UCQg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/path-key": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
      "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/path-parse": {
      "version": "1.0.7",
      "resolved": "https://registry.npmjs.org/path-parse/-/path-parse-1.0.7.tgz",
      "integrity": "sha512-LDJzPVEEEPR+y48z93A0Ed0yXb8pAByGWo/k5YYdYgpY2/2EsOsksJrq7lOHxryrVOn1ejG6oAp8ahvOIQD8sw==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/picocolors": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/picomatch": {
      "version": "2.3.1",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-2.3.1.tgz",
      "integrity": "sha512-JU3teHTNjmE2VCGFzuY8EXzCDVwEqB2a8fsIvwaStHhAWJEeVd1o1QD80CU6+ZdEXXSLbSsuLwJjkCBWqRQUVA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8.6"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "node_modules/pirates": {
      "version": "4.0.7",
      "resolved": "https://registry.npmjs.org/pirates/-/pirates-4.0.7.tgz",
      "integrity": "sha512-TfySrs/5nm8fQJDcBDuUng3VOUKsd7S+zqvbOTiGXHfxX4wK31ard+hoNuvkicM/2YFzlpDgABOevKSsB4G/FA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/pkg-dir": {
      "version": "4.2.0",
      "resolved": "https://registry.npmjs.org/pkg-dir/-/pkg-dir-4.2.0.tgz",
      "integrity": "sha512-HRDzbaKjC+AOWVXxAU/x54COGeIv9eb+6CkDSQoNTt4XyWoIJvuPsXizxu/Fr23EiekbtZwmh1IcIG/l/a10GQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "find-up": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/prettier": {
      "version": "3.6.2",
      "resolved": "https://registry.npmjs.org/prettier/-/prettier-3.6.2.tgz",
      "integrity": "sha512-I7AIg5boAr5R0FFtJ6rCfD+LFsWHp81dolrFD8S79U9tb8Az2nGrJncnMSnys+bpQJfRUzqs9hnA81OAA3hCuQ==",
      "license": "MIT",
      "bin": {
        "prettier": "bin/prettier.cjs"
      },
      "engines": {
        "node": ">=14"
      },
      "funding": {
        "url": "https://github.com/prettier/prettier?sponsor=1"
      }
    },
    "node_modules/pretty-format": {
      "version": "29.7.0",
      "resolved": "https://registry.npmjs.org/pretty-format/-/pretty-format-29.7.0.tgz",
      "integrity": "sha512-Pdlw/oPxN+aXdmM9R00JVC9WVFoCLTKJvDVLgmJ+qAffBMxsV85l/Lu7sNx4zSzPyoL2euImuEwHhOXdEgNFZQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jest/schemas": "^29.6.3",
        "ansi-styles": "^5.0.0",
        "react-is": "^18.0.0"
      },
      "engines": {
        "node": "^14.15.0 || ^16.10.0 || >=18.0.0"
      }
    },
    "node_modules/pretty-format/node_modules/ansi-styles": {
      "version": "5.2.0",
      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-5.2.0.tgz",
      "integrity": "sha512-Cxwpt2SfTzTtXcfOlzGEee8O+c+MmUgGrNiBcXnuWxuFJHe6a5Hz7qwhwe5OgaSYI0IJvkLqWX1ASG+cJOkEiA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
      }
    },
    "node_modules/prompts": {
      "version": "2.4.2",
      "resolved": "https://registry.npmjs.org/prompts/-/prompts-2.4.2.tgz",
      "integrity": "sha512-NxNv/kLguCA7p3jE8oL2aEBsrJWgAakBpgmgK6lpPWV+WuOmY6r2/zbAVnP+T8bQlA0nzHXSJSJW0Hq7ylaD2Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "kleur": "^3.0.3",
        "sisteransi": "^1.0.5"
      },
      "engines": {
        "node": ">= 6"
      }
    },
    "node_modules/pure-rand": {
      "version": "6.1.0",
      "resolved": "https://registry.npmjs.org/pure-rand/-/pure-rand-6.1.0.tgz",
      "integrity": "sha512-bVWawvoZoBYpp6yIoQtQXHZjmz35RSVHnUOTefl8Vcjr8snTPY1wnpSPMWekcFwbxI6gtmT7rSYPFvz71ldiOA==",
      "dev": true,
      "funding": [
        {
          "type": "individual",
          "url": "https://github.com/sponsors/dubzzz"
        },
        {
          "type": "opencollective",
          "url": "https://opencollective.com/fast-check"
        }
      ],
      "license": "MIT"
    },
    "node_modules/react-is": {
      "version": "18.3.1",
      "resolved": "https://registry.npmjs.org/react-is/-/react-is-18.3.1.tgz",
      "integrity": "sha512-/LLMVyas0ljjAtoYiPqYiL8VWXzUUdThrmU5+n20DZv+a+ClRoevUzw5JxU+Ieh5/c87ytoTBV9G1FiKfNJdmg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/require-directory": {
      "version": "2.1.1",
      "resolved": "https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz",
      "integrity": "sha512-fGxEI7+wsG9xrvdjsrlmL22OMTTiHRwAMroiEeMgq8gzoLC/PQr7RsRDSTLUg/bZAZtF+TVIkHc6/4RIKrui+Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/resolve": {
      "version": "1.22.10",
      "resolved": "https://registry.npmjs.org/resolve/-/resolve-1.22.10.tgz",
      "integrity": "sha512-NPRy+/ncIMeDlTAsuqwKIiferiawhefFJtkNSW0qZJEqMEb+qBt/77B/jGeeek+F0uOeN05CDa6HXbbIgtVX4w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-core-module": "^2.16.0",
        "path-parse": "^1.0.7",
        "supports-preserve-symlinks-flag": "^1.0.0"
      },
      "bin": {
        "resolve": "bin/resolve"
      },
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/resolve-cwd": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/resolve-cwd/-/resolve-cwd-3.0.0.tgz",
      "integrity": "sha512-OrZaX2Mb+rJCpH/6CpSqt9xFVpN++x01XnN2ie9g6P5/3xelLAkXWVADpdz1IHD/KFfEXyE6V0U01OQ3UO2rEg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "resolve-from": "^5.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/resolve-from": {
      "version": "5.0.0",
      "resolved": "https://registry.npmjs.org/resolve-from/-/resolve-from-5.0.0.tgz",
      "integrity": "sha512-qYg9KP24dD5qka9J47d0aVky0N+b4fTU89LN9iDnjB5waksiC49rvMB0PrUJQGoTmH50XPiqOvAjDfaijGxYZw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/resolve.exports": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/resolve.exports/-/resolve.exports-2.0.3.tgz",
      "integrity": "sha512-OcXjMsGdhL4XnbShKpAcSqPMzQoYkYyhbEaeSko47MjRP9NfEQMhZkXL1DoFlt9LWQn4YttrdnV6X2OiyzBi+A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/semver": {
      "version": "7.7.2",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.7.2.tgz",
      "integrity": "sha512-RF0Fw+rO5AMf9MAyaRXI4AV0Ulj5lMHqVxxdSgiVbixSCXoEmmX/jk0CuJw4+3SqroYO9VoUh+HcuJivvtJemA==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/shebang-command": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
      "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "shebang-regex": "^3.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/shebang-regex": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
      "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/signal-exit": {
      "version": "3.0.7",
      "resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-3.0.7.tgz",
      "integrity": "sha512-wnD2ZE+l+SPC/uoS0vXeE9L1+0wuaMqKlfz9AMUo38JsyLSBWSFcHR1Rri62LZc12vLr1gb3jl7iwQhgwpAbGQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/sisteransi": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/sisteransi/-/sisteransi-1.0.5.tgz",
      "integrity": "sha512-bLGGlR1QxBcynn2d5YmDX4MGjlZvy2MRBDRNHLJ8VI6l6+9FUiyTFNJ0IveOSP0bcXgVDPRcfGqA0pjaqUpfVg==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/slash": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/slash/-/slash-3.0.0.tgz",
      "integrity": "sha512-g9Q1haeby36OSStwb4ntCGGGaKsaVSjQ68fBxoQcutl5fS1vuY18H3wSt3jFyFtrkx+Kz0V1G85A4MyAdDMi2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/source-map": {
      "version": "0.6.1",
      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "node_modules/source-map-support": {
      "version": "0.5.13",
      "resolved": "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.13.tgz",
      "integrity": "sha512-SHSKFHadjVA5oR4PPqhtAVdcBWwRYVd6g6cAXnIbRiIwc2EhPrTuKUBdSLvlEKyIP3GCf89fltvcZiP9MMFA1w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "buffer-from": "^1.0.0",
        "source-map": "^0.6.0"
      }
    },
    "node_modules/sprintf-js": {
      "version": "1.0.3",
      "resolved": "https://registry.npmjs.org/sprintf-js/-/sprintf-js-1.0.3.tgz",
      "integrity": "sha512-D9cPgkvLlV3t3IzL0D0YLvGA9Ahk4PcvVwUbN0dSGr1aP0Nrt4AEnTUbuGvquEC0mA64Gqt1fzirlRs5ibXx8g==",
      "dev": true,
      "license": "BSD-3-Clause"
    },
    "node_modules/stack-utils": {
      "version": "2.0.6",
      "resolved": "https://registry.npmjs.org/stack-utils/-/stack-utils-2.0.6.tgz",
      "integrity": "sha512-XlkWvfIm6RmsWtNJx+uqtKLS8eqFbxUg0ZzLXqY0caEy9l7hruX8IpiDnjsLavoBgqCCR71TqWO8MaXYheJ3RQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "escape-string-regexp": "^2.0.0"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/string-length": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/string-length/-/string-length-4.0.2.tgz",
      "integrity": "sha512-+l6rNN5fYHNhZZy41RXsYptCjA2Igmq4EG7kZAYFQI1E1VTXarr6ZPXBg6eq7Y6eK4FEhY6AJlyuFIb/v/S0VQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "char-regex": "^1.0.2",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/string-width": {
      "version": "4.2.3",
      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "emoji-regex": "^8.0.0",
        "is-fullwidth-code-point": "^3.0.0",
        "strip-ansi": "^6.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-ansi": {
      "version": "6.0.1",
      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-regex": "^5.0.1"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-bom": {
      "version": "4.0.0",
      "resolved": "https://registry.npmjs.org/strip-bom/-/strip-bom-4.0.0.tgz",
      "integrity": "sha512-3xurFv5tEgii33Zi8Jtp55wEIILR9eh34FAW00PZf+JnSsTmV/ioewSgQl97JHvgjoRGwPShsWm+IdrxB35d0w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/strip-final-newline": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/strip-final-newline/-/strip-final-newline-2.0.0.tgz",
      "integrity": "sha512-BrpvfNAE3dcvq7ll3xVumzjKjZQ5tI1sEUIKr3Uoks0XUl45St3FlatVqef9prk4jRDzhW6WZg+3bk93y6pLjA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6"
      }
    },
    "node_modules/strip-json-comments": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz",
      "integrity": "sha512-6fPc+R4ihwqP6N/aIv2f1gMH8lOVtWQHoqC4yK6oSDVVocumAsfCqjkXnqiYMhmMwS/mEHLp7Vehlt3ql6lEig==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=8"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/supports-color": {
      "version": "7.2.0",
      "resolved": "https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz",
      "integrity": "sha512-qpCAvRl9stuOHveKsn7HncJRvv501qIacKzQlO/+Lwxc9+0q2wLyv4Dfvt80/DPn2pqOBsJdDiogXGR9+OvwRw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "has-flag": "^4.0.0"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/supports-preserve-symlinks-flag": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/supports-preserve-symlinks-flag/-/supports-preserve-symlinks-flag-1.0.0.tgz",
      "integrity": "sha512-ot0WnXS9fgdkgIcePe6RHNk1WA8+muPa6cSjeR3V8K27q9BB1rTE3R1p7Hv0z1ZyAc8s6Vvv8DIyWf681MAt0w==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">= 0.4"
      },
      "funding": {
        "url": "https://github.com/sponsors/ljharb"
      }
    },
    "node_modules/test-exclude": {
      "version": "6.0.0",
      "resolved": "https://registry.npmjs.org/test-exclude/-/test-exclude-6.0.0.tgz",
      "integrity": "sha512-cAGWPIyOHU6zlmg88jwm7VRyXnMN7iV68OGAbYDk/Mh/xC/pzVPlQtY6ngoIH/5/tciuhGfvESU8GrHrcxD56w==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "@istanbuljs/schema": "^0.1.2",
        "glob": "^7.1.4",
        "minimatch": "^3.0.4"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/test-exclude/node_modules/brace-expansion": {
      "version": "1.1.12",
      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.12.tgz",
      "integrity": "sha512-9T9UjW3r0UW5c1Q7GTwllptXwhvYmEzFhzMfZ9H7FQWt+uZePjZPjBP/W1ZEyZ1twGWom5/56TF4lPcqjnDHcg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "balanced-match": "^1.0.0",
        "concat-map": "0.0.1"
      }
    },
    "node_modules/test-exclude/node_modules/minimatch": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.2.tgz",
      "integrity": "sha512-J7p63hRiAjw1NDEww1W7i37+ByIrOWO5XQQAzZ3VOcL0PNybwpfmV/N05zFAzwQ9USyEcX6t3UO+K5aqBQOIHw==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "brace-expansion": "^1.1.7"
      },
      "engines": {
        "node": "*"
      }
    },
    "node_modules/tmpl": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/tmpl/-/tmpl-1.0.5.tgz",
      "integrity": "sha512-3f0uOEAQwIqGuWW2MVzYg8fV/QNnc/IpuJNG837rLuczAaLVHslWHZQj4IGiEl5Hs3kkbhwL9Ab7Hrsmuj+Smw==",
      "dev": true,
      "license": "BSD-3-Clause"
    },
    "node_modules/to-regex-range": {
      "version": "5.0.1",
      "resolved": "https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz",
      "integrity": "sha512-65P7iz6X5yEr1cwcgvQxbbIw7Uk3gOy5dIdtZ4rDveLqhrdJP+Li/Hx6tyK0NEb+2GCyneCMJiGqrADCSNk8sQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "is-number": "^7.0.0"
      },
      "engines": {
        "node": ">=8.0"
      }
    },
    "node_modules/type-detect": {
      "version": "4.0.8",
      "resolved": "https://registry.npmjs.org/type-detect/-/type-detect-4.0.8.tgz",
      "integrity": "sha512-0fr/mIH1dlO+x7TlcMy+bIDqKPsw/70tVyeHW787goQjhmqaZe10uwLujubK9q9Lg6Fiho1KUKDYz0Z7k7g5/g==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=4"
      }
    },
    "node_modules/type-fest": {
      "version": "0.21.3",
      "resolved": "https://registry.npmjs.org/type-fest/-/type-fest-0.21.3.tgz",
      "integrity": "sha512-t0rzBq87m3fVcduHDUFhKmyyX+9eo6WQjZvf51Ea/M0Q7+T374Jp1aUiyUl0GKxp8M/OETVHSDvmkyPgvX+X2w==",
      "dev": true,
      "license": "(MIT OR CC0-1.0)",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "node_modules/typescript": {
      "version": "5.9.2",
      "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.2.tgz",
      "integrity": "sha512-CWBzXQrc/qOkhidw1OzBTQuYRbfyxDXJMVJ1XNwUHGROVmuaeiEm3OslpZ1RV96d7SKKjZKrSJu3+t/xlw3R9A==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "tsc": "bin/tsc",
        "tsserver": "bin/tsserver"
      },
      "engines": {
        "node": ">=14.17"
      }
    },
    "node_modules/undici-types": {
      "version": "6.21.0",
      "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
      "integrity": "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
      "dev": true,
      "license": "MIT"
    },
    "node_modules/update-browserslist-db": {
      "version": "1.1.3",
      "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.1.3.tgz",
      "integrity": "sha512-UxhIZQ+QInVdunkDAaiazvvT/+fXL5Osr0JZlJulepYu6Jd7qJtDZjlur0emRlT71EN3ScPoE7gvsuIKKNavKw==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/browserslist"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/browserslist"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "escalade": "^3.2.0",
        "picocolors": "^1.1.1"
      },
      "bin": {
        "update-browserslist-db": "cli.js"
      },
      "peerDependencies": {
        "browserslist": ">= 4.21.0"
      }
    },
    "node_modules/v8-to-istanbul": {
      "version": "9.3.0",
      "resolved": "https://registry.npmjs.org/v8-to-istanbul/-/v8-to-istanbul-9.3.0.tgz",
      "integrity": "sha512-kiGUalWN+rgBJ/1OHZsBtU4rXZOfj/7rKQxULKlIzwzQSvMJUUNgPwJEEh7gU6xEVxC0ahoOBvN2YI8GH6FNgA==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "@jridgewell/trace-mapping": "^0.3.12",
        "@types/istanbul-lib-coverage": "^2.0.1",
        "convert-source-map": "^2.0.0"
      },
      "engines": {
        "node": ">=10.12.0"
      }
    },
    "node_modules/vscode-jsonrpc": {
      "version": "8.2.0",
      "resolved": "https://registry.npmjs.org/vscode-jsonrpc/-/vscode-jsonrpc-8.2.0.tgz",
      "integrity": "sha512-C+r0eKJUIfiDIfwJhria30+TYWPtuHJXHtI7J0YlOmKAo7ogxP20T0zxB7HZQIFhIyvoBPwWskjxrvAtfjyZfA==",
      "license": "MIT",
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "node_modules/vscode-languageclient": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/vscode-languageclient/-/vscode-languageclient-9.0.1.tgz",
      "integrity": "sha512-JZiimVdvimEuHh5olxhxkht09m3JzUGwggb5eRUkzzJhZ2KjCN0nh55VfiED9oez9DyF8/fz1g1iBV3h+0Z2EA==",
      "license": "MIT",
      "dependencies": {
        "minimatch": "^5.1.0",
        "semver": "^7.3.7",
        "vscode-languageserver-protocol": "3.17.5"
      },
      "engines": {
        "vscode": "^1.82.0"
      }
    },
    "node_modules/vscode-languageserver": {
      "version": "9.0.1",
      "resolved": "https://registry.npmjs.org/vscode-languageserver/-/vscode-languageserver-9.0.1.tgz",
      "integrity": "sha512-woByF3PDpkHFUreUa7Hos7+pUWdeWMXRd26+ZX2A8cFx6v/JPTtd4/uN0/jB6XQHYaOlHbio03NTHCqrgG5n7g==",
      "license": "MIT",
      "dependencies": {
        "vscode-languageserver-protocol": "3.17.5"
      },
      "bin": {
        "installServerIntoExtension": "bin/installServerIntoExtension"
      }
    },
    "node_modules/vscode-languageserver-protocol": {
      "version": "3.17.5",
      "resolved": "https://registry.npmjs.org/vscode-languageserver-protocol/-/vscode-languageserver-protocol-3.17.5.tgz",
      "integrity": "sha512-mb1bvRJN8SVznADSGWM9u/b07H7Ecg0I3OgXDuLdn307rl/J3A9YD6/eYOssqhecL27hK1IPZAsaqh00i/Jljg==",
      "license": "MIT",
      "dependencies": {
        "vscode-jsonrpc": "8.2.0",
        "vscode-languageserver-types": "3.17.5"
      }
    },
    "node_modules/vscode-languageserver-textdocument": {
      "version": "1.0.12",
      "resolved": "https://registry.npmjs.org/vscode-languageserver-textdocument/-/vscode-languageserver-textdocument-1.0.12.tgz",
      "integrity": "sha512-cxWNPesCnQCcMPeenjKKsOCKQZ/L6Tv19DTRIGuLWe32lyzWhihGVJ/rcckZXJxfdKCFvRLS3fpBIsV/ZGX4zA==",
      "license": "MIT"
    },
    "node_modules/vscode-languageserver-types": {
      "version": "3.17.5",
      "resolved": "https://registry.npmjs.org/vscode-languageserver-types/-/vscode-languageserver-types-3.17.5.tgz",
      "integrity": "sha512-Ld1VelNuX9pdF39h2Hgaeb5hEZM2Z3jUrrMgWQAu82jMtZp7p3vJT3BzToKtZI7NgQssZje5o0zryOrhQvzQAg==",
      "license": "MIT"
    },
    "node_modules/walker": {
      "version": "1.0.8",
      "resolved": "https://registry.npmjs.org/walker/-/walker-1.0.8.tgz",
      "integrity": "sha512-ts/8E8l5b7kY0vlWLewOkDXMmPdLcVV4GmOQLyxuSswIJsweeFZtAsMF7k1Nszz+TYBQrlYRmzOnr398y1JemQ==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "makeerror": "1.0.12"
      }
    },
    "node_modules/which": {
      "version": "2.0.2",
      "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
      "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "isexe": "^2.0.0"
      },
      "bin": {
        "node-which": "bin/node-which"
      },
      "engines": {
        "node": ">= 8"
      }
    },
    "node_modules/wrap-ansi": {
      "version": "7.0.0",
      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "ansi-styles": "^4.0.0",
        "string-width": "^4.1.0",
        "strip-ansi": "^6.0.0"
      },
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/write-file-atomic": {
      "version": "4.0.2",
      "resolved": "https://registry.npmjs.org/write-file-atomic/-/write-file-atomic-4.0.2.tgz",
      "integrity": "sha512-7KxauUdBmSdWnmpaGFg+ppNjKF8uNLry8LyzjauQDOVONfFLNKrKvQOxZ/VuTIcS/gge/YNahf5RIIQWTSarlg==",
      "dev": true,
      "license": "ISC",
      "dependencies": {
        "imurmurhash": "^0.1.4",
        "signal-exit": "^3.0.7"
      },
      "engines": {
        "node": "^12.13.0 || ^14.15.0 || >=16.0.0"
      }
    },
    "node_modules/y18n": {
      "version": "5.0.8",
      "resolved": "https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz",
      "integrity": "sha512-0pfFzegeDWJHJIAmTLRP2DwHjdF5s7jo9tuztdQxAhINCdvS+3nGINqPd00AphqJR/0LhANUS6/+7SCb98YOfA==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/yallist": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
      "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
      "dev": true,
      "license": "ISC"
    },
    "node_modules/yargs": {
      "version": "17.7.2",
      "resolved": "https://registry.npmjs.org/yargs/-/yargs-17.7.2.tgz",
      "integrity": "sha512-7dSzzRQ++CKnNI/krKnYRV7JKKPUXMEh61soaHKg9mrWEhzFWhFnxPxGl+69cD1Ou63C13NUPCnmIcrvqCuM6w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "cliui": "^8.0.1",
        "escalade": "^3.1.1",
        "get-caller-file": "^2.0.5",
        "require-directory": "^2.1.1",
        "string-width": "^4.2.3",
        "y18n": "^5.0.5",
        "yargs-parser": "^21.1.1"
      },
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yargs-parser": {
      "version": "21.1.1",
      "resolved": "https://registry.npmjs.org/yargs-parser/-/yargs-parser-21.1.1.tgz",
      "integrity": "sha512-tVpsJW7DdjecAiFpbIB1e3qxIQsE6NoPc5/eTdrbbIC4h0LVsWhnoa3g+m2HclBIujHzsxZ4VJVA+GUuc2/LBw==",
      "dev": true,
      "license": "ISC",
      "engines": {
        "node": ">=12"
      }
    },
    "node_modules/yocto-queue": {
      "version": "0.1.0",
      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=10"
      },
      "funding": {
        "url": "https://github.com/sponsors/sindresorhus"
      }
    },
    "server": {
      "name": "ftejs-server",
      "version": "0.0.1",
      "dependencies": {
        "prettier": "^3.6.2",
        "vscode-languageserver": "^9.0.1",
        "vscode-languageserver-textdocument": "^1.0.11"
      },
      "devDependencies": {
        "@types/node": "^20.12.8",
        "jest": "^29.7.0",
        "typescript": "^5.5.4"
      }
    }
  }
}

```

`package.json`

```json
{
  "name": "fte-js-template",
  "publisher": "alex-vedmedenko",
  "displayName": "fte.js-template",
  "repository": {
    "type": "git",
    "url": "https://github.com/vedmalex/vscode-ftejs-lang.git"
  },
  "description": "fte.js templates: syntax highlight + language server",
  "license": "MIT",
  "homepage": "https://github.com/vedmalex/vscode-ftejs-lang#readme",
  "bugs": {
    "url": "https://github.com/vedmalex/vscode-ftejs-lang/issues"
  },
  "keywords": [
    "fte.js",
    "template",
    "syntax",
    "highlighting",
    "textmate",
    "vscode-extension"
  ],
  "version": "1.2.0",
  "workspaces": ["client", "server"],
  "engines": {
    "vscode": "^1.96.4"
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "npm --workspace server run build && npm --workspace client run build",
    "watch": "npm --workspace server run watch & npm --workspace client run watch",
    "docs:sync-usage": "node tools/sync-usage.js",
    "test": "npm --workspace server run test",
    "package": "vsce package --no-yarn",
    "publish:vsce": "vsce publish",
    "publish:openvsx": "ovsx publish",
    "release:patch": "npm version patch && git push --follow-tags",
    "release:minor": "npm version minor && git push --follow-tags",
    "release:major": "npm version major && git push --follow-tags"
  },
  "main": "./client/out/extension.js",
  "activationEvents": [
    "onLanguage:template-js",
    "onLanguage:template-html",
    "onLanguage:template-typescript",
    "onLanguage:template-markdown",
    "onCommand:ftejs.convertToTemplate",
    "onCommand:ftejs.toggleTrimVisualizer"
  ],
  "categories": [
    "Programming Languages"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [ { "id": "ftejs", "title": "fte.js", "icon": "" } ]
    },
    "configuration": {
      "title": "fte.js",
      "properties": {

        "ftejs.format.textFormatter": {
          "type": "boolean",
          "default": true,
          "description": "Format non-template text segments using Prettier (html/markdown/js/ts)"
        },
        "ftejs.format.keepBlankLines": {
          "type": "number",
          "default": 1,
          "description": "Maximum consecutive blank lines to keep in formatted output (use -1 to disable)"
        },
        "ftejs.format.codeFormatter": {
          "type": "boolean",
          "default": true,
          "description": "Indent template code blocks and align control structures (does not change generated text)"
        },
        "ftejs.docs.usagePath": {
          "type": "string",
          "default": "",
          "description": "Path to USAGE.md providing function/directive documentation for hovers"
        }
      }
    },
    "commands": [
      { "command": "ftejs.scaffold.block", "title": "fte.js: Insert Block" },
      { "command": "ftejs.scaffold.slot", "title": "fte.js: Insert Slot" },
      { "command": "ftejs.scaffold.chunkPair", "title": "fte.js: Insert chunkStart/chunkEnd" },
      { "command": "ftejs.scaffold.partial", "title": "fte.js: Create Partial and Insert Call" },
      { "command": "ftejs.debug.syntaxScopes", "title": "fte.js: Debug Syntax Scopes (experimental)" },
      { "command": "ftejs.generator.nhtmlPage", "title": "fte.js: Generate .nhtml Page" },
      { "command": "ftejs.generator.ntsClass", "title": "fte.js: Generate .nts Class" },
      { "command": "ftejs.preview.chunks", "title": "fte.js: Preview Chunks (static)" },
      { "command": "ftejs.convertToTemplate", "title": "fte.js: Create template from this file" },
      { "command": "ftejs.toggleTrimVisualizer", "title": "fte.js: Toggle Trimmed Whitespace Visualizer" }
    ],
    "menus": {
      "editor/context": [
        { "command": "ftejs.scaffold.block", "group": "navigation@10", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.scaffold.slot", "group": "navigation@11", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.scaffold.chunkPair", "group": "navigation@12", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.scaffold.partial", "group": "navigation@13", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.generator.nhtmlPage", "group": "navigation@20", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.generator.ntsClass", "group": "navigation@21", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.preview.chunks", "group": "navigation@30", "when": "editorLangId =~ /template-/" },
        { "command": "ftejs.convertToTemplate", "group": "3_modification@15", "when": "editorLangId == markdown || editorLangId == html || editorLangId == typescript || editorLangId == javascript || editorLangId == typescriptreact || editorLangId == javascriptreact" }
      ]
    },
    "languages": [
      {
        "id": "template-js",
        "extensions": [
          ".njs"
        ],
        "configuration": "./language-configuration.json",
        "embeddedLanguages": {
          "source.js": "javascript",
          "text.template": "template"
        }
      },
      {
        "id": "template-html",
        "extensions": [
          ".nhtml"
        ],
        "configuration": "./language-configuration.json",
        "embeddedLanguages": {
          "text.html.basic": "html",
          "text.template": "template"
        }
      },
      {
        "id": "template-typescript",
        "extensions": [
          ".nts"
        ],
        "configuration": "./language-configuration.json",
        "embeddedLanguages": {
          "source.ts": "typescript",
          "text.template": "template"
        }
      },
      {
        "id": "template-markdown",
        "extensions": [
          ".nmd"
        ],
        "configuration": "./language-configuration.json",
        "embeddedLanguages": {
          "text.html.markdown": "markdown",
          "text.template": "template"
        }
      }
    ],
    "grammars": [
      {
        "language": "template-js",
        "scopeName": "source.js.template",
        "path": "./syntaxes/template-js.tmLanguage.json",
        "embeddedLanguages": {
          "meta.embedded.block.javascript": "javascript"
        }
      },
      {
        "language": "template-html",
        "scopeName": "text.html.template",
        "path": "./syntaxes/template-html.tmLanguage.json",
        "embeddedLanguages": {
          "meta.embedded.block.html": "html",
          "meta.embedded.block.javascript": "javascript"
        }
      },
      {
        "language": "template-typescript",
        "scopeName": "source.ts.template",
        "path": "./syntaxes/template-typescript.tmLanguage.json",
        "embeddedLanguages": {
          "meta.embedded.block.typescript": "typescript",
          "meta.embedded.block.javascript": "javascript"
        }
      },
      {
        "language": "template-markdown",
        "scopeName": "text.html.markdown.template",
        "path": "./syntaxes/template-markdown.tmLanguage.json",
        "embeddedLanguages": {
          "meta.embedded.block.markdown": "markdown",
          "meta.embedded.block.javascript": "javascript"
        }
      },
      {
        "scopeName": "text.html.template.inline",
        "path": "./syntaxes/template-inline.tmLanguage.json",
        "injectTo": [
          "source.js",
          "source.ts"
        ],
        "embeddedLanguages": {
          "meta.embedded.block.javascript": "javascript"
        }
      },
      {
        "scopeName": "fte.template.inject.html",
        "path": "./syntaxes/template-inject-html.tmLanguage.json",
        "injectTo": [
          "text.html.basic",
          "text.html.markdown"
        ]
      },
      {
        "scopeName": "fte.template.inject.generic",
        "path": "./syntaxes/template-inject-generic.tmLanguage.json",
        "injectTo": [
          "source.python",
          "source.swift",
          "source.ruby",
          "source.go",
          "source.php"
        ]
      }
    ]
  }
  ,
  "dependencies": {
    "vscode-languageclient": "^9.0.1",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11"
  }
}

```

`tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "client" },
    { "path": "server" }
  ]
}

```



## Сгенерировано командой:

```
prompt-fs-to-ai ./ -p "**/*.{ts,json}" -e "node_modules/**" "dist/**" "dev/**" "types/**" "src/demo/**" "src/dev/**" "src/test/**" ".specstory/**" "custom_modes/**" "memory-bank/**" "integration/**" "**/**/*.test.{ts,js}" -o "undefined"
```
