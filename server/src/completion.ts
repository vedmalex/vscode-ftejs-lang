import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, Range, Location } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';

export function getCompletions(
  docText: string,
  docUri: string,
  position: Position,
  deps: {
    usageDocs: { functions: Record<string, string>; directives: Record<string, string> }
    parseContent: (text: string) => any
    getExtendTargetFrom: (text: string, docUri?: string) => string | null
    fileIndex: Map<string, { blocks: Map<string, any> }>
  }
): CompletionItem[] {
  const text = docText;
  const offset = (() => {
    // approximate: compute offset by counting characters up to position
    const lines = text.split(/\r?\n/);
    let acc = 0;
    for (let i = 0; i < position.line; i++) acc += lines[i]?.length ?? 0, acc += 1; // add newline
    acc += position.character;
    return acc;
  })();

  const prefix = text.slice(Math.max(0, offset - 50), offset);
  const before = text.slice(0, offset);

  const items: CompletionItem[] = [];
  const { usageDocs, parseContent, getExtendTargetFrom, fileIndex } = deps;

  // directive completion inside <#@ ... #>
  if (/<#@\s+[\w-]*$/.test(prefix)) {
    items.push(
      ...Object.keys(usageDocs.directives).map((d) => ({
        label: d,
        kind: CompletionItemKind.Keyword,
        documentation: usageDocs.directives[d] || undefined
      }))
    );
  }

  // block/slot keywords
  if (/<#-?\s*(block|slot)\s+['"`][^'"`]*$/.test(prefix)) {
    items.push({ label: 'end', kind: CompletionItemKind.Keyword });
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
      const parentAbs = getExtendTargetFrom(text, docUri);
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
}
