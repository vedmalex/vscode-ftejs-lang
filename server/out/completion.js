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
exports.getCompletions = getCompletions;
const node_1 = require("vscode-languageserver/node");
const fs = __importStar(require("fs"));
function getCompletions(docText, docUri, position, deps) {
    const text = docText;
    const offset = (() => {
        // approximate: compute offset by counting characters up to position
        const lines = text.split(/\r?\n/);
        let acc = 0;
        for (let i = 0; i < position.line; i++)
            acc += lines[i]?.length ?? 0, acc += 1; // add newline
        acc += position.character;
        return acc;
    })();
    const prefix = text.slice(Math.max(0, offset - 50), offset);
    const before = text.slice(0, offset);
    const items = [];
    const { usageDocs, parseContent, getExtendTargetFrom, fileIndex } = deps;
    // directive completion inside <#@ ... #>
    if (/<#@\s+[\w-]*$/.test(prefix)) {
        items.push(...Object.keys(usageDocs.directives).map((d) => ({
            label: d,
            kind: node_1.CompletionItemKind.Keyword,
            documentation: usageDocs.directives[d] || undefined
        })));
    }
    // block/slot keywords
    if (/<#-?\s*(block|slot)\s+['"`][^'"`]*$/.test(prefix)) {
        items.push({ label: 'end', kind: node_1.CompletionItemKind.Keyword });
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
            const parentAbs = getExtendTargetFrom(text, docUri);
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
}
