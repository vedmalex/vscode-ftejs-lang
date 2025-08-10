import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

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
    },
    initializationOptions: {
      parserPath: vscode.workspace.getConfiguration('ftejs').get('parserPath')
    }
  };

  client = new LanguageClient('ftejsLanguageServer', 'fte.js Language Server', serverOptions, clientOptions);
  await client.start();
  context.subscriptions.push({ dispose: () => client?.stop() });

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
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
