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
