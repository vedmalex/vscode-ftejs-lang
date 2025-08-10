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
    vscode.commands.registerCommand('ftejs.scaffold.chunkPair', () => insert(`<#- chunkStart('\${1:path}'); -#>\n$0\n<# chunkEnd(); -#>`))
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
