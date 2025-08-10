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
      // suggest folder near current file
      const docUri = editor.document.uri;
      const baseDir = path.dirname(docUri.fsPath);
      const filePath = path.join(baseDir, `${name}.njs`);
      // create file if not exists with minimal scaffold
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
        // insert call into current editor
        editor.insertSnippet(new vscode.SnippetString(`#{partial(context, '${name}')}\n`));
        // optionally open the new partial
        const open = await vscode.window.showQuickPick(['Open partial', 'Skip'], { placeHolder: 'Open created partial?' });
        if (open === 'Open partial') {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to create partial: ${e}`);
      }
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
