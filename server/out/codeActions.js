"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCodeActions = buildCodeActions;
const node_1 = require("vscode-languageserver/node");
const astUtils_1 = require("./astUtils");
function buildCodeActions(params) {
    const { text, uri, range, diagnostics, doc, indentSize, parseContent } = params;
    const actions = [];
    const hasUnmatchedEnd = diagnostics.some(d => /Unmatched end/.test(d.message));
    if (hasUnmatchedEnd) {
        actions.push({
            title: 'Remove unmatched end',
            kind: 'quickfix',
            edit: { changes: { [uri]: [node_1.TextEdit.del(range)] } }
        });
    }
    for (const d of diagnostics) {
        const m = d.message.match(/^Invalid (block|slot) name: (.+)$/);
        if (m) {
            const kind = m[1];
            const bad = m[2];
            const sanitized = bad
                .replace(/[^A-Za-z0-9_.-]/g, '_')
                .replace(/^[^A-Za-z_]+/, '_');
            const docText = text;
            const startOff = doc.offsetAt(d.range.start);
            const searchFrom = Math.max(0, startOff - 200);
            const searchTo = Math.min(docText.length, startOff + 200);
            const snippet = docText.slice(searchFrom, searchTo);
            const declRe = new RegExp(String.raw `<#\s*-?\s*${kind}\s+(["'\`])([^"'\`]+)\1\s*:\s*-?\s*#>`);
            const local = declRe.exec(snippet);
            if (local) {
                const nameStartLocal = local.index + local[0].indexOf(local[2]);
                const from = doc.positionAt(searchFrom + nameStartLocal);
                const to = doc.positionAt(searchFrom + nameStartLocal + local[2].length);
                actions.push({
                    title: `Rename ${kind} to '${sanitized}'`,
                    kind: 'quickfix',
                    diagnostics: [d],
                    edit: { changes: { [uri]: [node_1.TextEdit.replace({ start: from, end: to }, sanitized)] } }
                });
            }
        }
    }
    for (const d of diagnostics) {
        if (d.message.includes("Consider '<#-")) {
            actions.push({
                title: "Apply left trim '<#-'",
                kind: 'quickfix',
                diagnostics: [d],
                edit: { changes: { [uri]: [node_1.TextEdit.replace(d.range, '<#-')] } }
            });
        }
        if (d.message.includes("Consider '-#>")) {
            actions.push({
                title: "Apply right trim '-#>'",
                kind: 'quickfix',
                diagnostics: [d],
                edit: { changes: { [uri]: [node_1.TextEdit.replace(d.range, '-#>')] } }
            });
        }
    }
    const offset = doc.offsetAt(range.end);
    const stack = (0, astUtils_1.computeOpenBlocksFromText)(text, offset, parseContent);
    if (stack.length) {
        const indent = ' '.repeat(range.start.character);
        const tags = stack.map(s => `<#${s.trimmedOpen ? '-' : ''} end ${s.trimmedClose ? '-' : ''}#>`).join(`\n${indent}`);
        actions.push({
            title: 'Close open template blocks here',
            kind: 'quickfix',
            edit: { changes: { [uri]: [node_1.TextEdit.insert(range.end, `\n${indent}${tags}`)] } }
        });
    }
    const selectionText = text.slice(doc.offsetAt(range.start), doc.offsetAt(range.end));
    if (selectionText && selectionText.length > 0) {
        actions.push({
            title: 'Wrap with <#- ... -#>',
            kind: 'refactor.rewrite',
            edit: { changes: { [uri]: [node_1.TextEdit.replace(range, `<#- ${selectionText} -#>`)] } }
        });
        actions.push({
            title: 'Wrap with <# ... #>',
            kind: 'refactor.rewrite',
            edit: { changes: { [uri]: [node_1.TextEdit.replace(range, `<# ${selectionText} #>`)] } }
        });
        actions.push({ title: 'Transform to block (prompt name)', kind: 'refactor.extract', command: { title: 'transform', command: 'ftejs.refactor.toBlock', arguments: [{ uri, range }] } });
        actions.push({ title: 'Transform to slot (prompt name)', kind: 'refactor.extract', command: { title: 'transform', command: 'ftejs.refactor.toSlot', arguments: [{ uri, range }] } });
        actions.push({ title: 'Transform to partial (prompt name)', kind: 'refactor.rewrite', command: { title: 'transform', command: 'ftejs.refactor.toPartial', arguments: [{ uri, range }] } });
    }
    const curOffset = doc.offsetAt(range.start);
    const before = text.slice(0, curOffset);
    const after = text.slice(curOffset);
    const openIdx = before.lastIndexOf('#{');
    const openBangIdx = before.lastIndexOf('!{');
    const open = Math.max(openIdx, openBangIdx);
    const closeRel = after.indexOf('}');
    if (open >= 0 && closeRel >= 0) {
        const exprStart = open + 2;
        const exprEnd = curOffset + closeRel;
        const exprText = text.slice(exprStart, exprEnd);
        if (exprText.trim().length > 20) {
            let idx = 1;
            let varName = `_expr${idx}`;
            while (text.includes(varName)) {
                idx += 1;
                varName = `_expr${idx}`;
            }
            const lineStart = node_1.Position.create(range.start.line, 0);
            const insertDecl = node_1.TextEdit.insert(lineStart, `<# const ${varName} = ${exprText.trim()} #>\n`);
            const replaceRange = node_1.Range.create(doc.positionAt(exprStart), doc.positionAt(exprEnd));
            const replaceExpr = node_1.TextEdit.replace(replaceRange, ` ${varName} `);
            actions.push({
                title: 'Extract expression to const and use in template',
                kind: 'refactor.extract',
                edit: { changes: { [uri]: [insertDecl, replaceExpr] } }
            });
        }
    }
    for (const d of diagnostics) {
        const m = d.message.match(/^Unknown block name: (.+)$/);
        if (m) {
            const name = m[1];
            const insertAt = node_1.Position.create(0, 0);
            const scaffold = `<# block '${name}' : #>\n<# end #>\n`;
            actions.push({
                title: `Create block '${name}' at file start`,
                kind: 'quickfix',
                edit: { changes: { [uri]: [node_1.TextEdit.insert(insertAt, scaffold)] } }
            });
            const curInsert = range.start;
            actions.push({
                title: `Insert block '${name}' here`,
                kind: 'quickfix',
                edit: { changes: { [uri]: [node_1.TextEdit.insert(curInsert, scaffold)] } }
            });
        }
    }
    return actions;
}
