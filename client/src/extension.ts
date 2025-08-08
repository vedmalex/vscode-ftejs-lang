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
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
