import * as fs from 'fs';
import * as path from 'path';
import { TextDocument, Position, Range, DiagnosticSeverity, Diagnostic } from 'vscode-languageserver/node';
import { getTemplatePathVariants, resolveTemplateRel } from './astUtils';

export type FileIndexLite = {
  requireAs: Map<string, string>
  path?: string
};

export function computeDiagnostics(
  doc: TextDocument,
  deps: {
    parseContent: (text: string) => any
    getExtendTargetFrom: (text: string, docUri?: string) => string | null
    fileIndex: Map<string, FileIndexLite>
    workspaceRoots: string[]
    logError?: (e: unknown, context: string) => void
  }
): Diagnostic[] {
  const text = doc.getText();
  const diags: Diagnostic[] = [];

  const { parseContent, getExtendTargetFrom, fileIndex, workspaceRoots } = deps;
  const logError = deps.logError || (() => {});

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
      if (Array.isArray((ast as any).errors)) {
        for (const e of (ast as any).errors) {
          const pos = doc.positionAt(e.pos || 0);
          diags.push({ severity: DiagnosticSeverity.Error, range: { start: pos, end: pos }, message: e.message, source: 'fte.js' });
        }
      }
    } catch {}
  }

  // Unknown content('name') references + partial resolution
  try {
    const ast2 = parseContent(text) as any;
    const known = new Set<string>(Object.keys(ast2?.blocks || {}));
    const parentAbs = getExtendTargetFrom(text, doc.uri);
    if (parentAbs) {
      try {
        const src = fs.readFileSync(parentAbs, 'utf8');
        const pAst = parseContent(src) as any;
        for (const k of Object.keys(pAst?.blocks || {})) known.add(k);
      } catch {}
    }
    const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
    const partialRe = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
    type Hit = { index: number; match: RegExpExecArray };
    const contentHits: Hit[] = [];
    const partialHits: Hit[] = [];
    if (ast2?.main) {
      for (const n of ast2.main as any[]) {
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
    for (const ph of partialHits) {
      const key = ph.match[2];
      const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g; let d: RegExpExecArray | null; const local = new Map<string,string>();
      while ((d = dirRe.exec(text))) {
        const params = d[1].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''));
        if (params.length >= 2) local.set(params[1], params[0]);
      }
      let target = local.get(key) || key;
      if (target === key) {
        for (const [, info] of fileIndex) { const mapped = info.requireAs.get(key); if (mapped) { target = mapped; break; } }
      }
      const resolvedPartial = resolveTemplateRel(target, doc.uri, workspaceRoots);
      if (!resolvedPartial) {
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

  // Directive validation and trim hints
  try {
    const DIRECTIVES = [
      'extend', 'context', 'alias', 'deindent', 'chunks', 'includeMainChunk', 'useHash',
      'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs', 'lang'
    ];
    const leftRx = /(\n?)([ \t]*)<#/g;
    let ml: RegExpExecArray | null;
    while ((ml = leftRx.exec(text))) {
      if (text.slice(ml.index, ml.index + 3) === '<#@') continue;
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
      const openPos = text.lastIndexOf('<#', mr.index);
      if (openPos >= 0 && text[openPos + 2] === '@') continue;
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

    // Directive arguments validation/unknown directives
    const dirRe = /<#@([\s\S]*?)#>/g; let d: RegExpExecArray | null;
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
      let params: string[] = [];
      const paren = paramsRaw.match(/^\(([^)]*)\)/);
      if (paren) {
        params = paren[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s.replace(/^["'`]|["'`]$/g, ''));
      } else if (paramsRaw.length) {
        params = paramsRaw
          .split(/\s+/)
          .map(s => s.trim().replace(/^["'`]|["'`]$/g, ''))
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
  } catch {}

  // Validate extend directive and parent template existence
  try {
    const ast3 = parseContent(text) as any;
    if (ast3 && Array.isArray(ast3.main)) {
      for (const node of ast3.main as any[]) {
        if (node.type === 'directive' && node.content) {
          const content = String(node.content).trim();
          if (content.startsWith('extend')) {
            const match = content.match(/extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s+(["'`])([^"'`]+)\3)/);
            const rel = (match?.[2] || match?.[4])?.trim();
            if (rel) {
              const resolved = resolveTemplateRel(rel, doc.uri, workspaceRoots);
              if (!resolved) {
                const start = doc.positionAt(node.pos);
                const end = doc.positionAt(node.pos + (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length));
                diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: `Parent template not found: ${rel}`, source: 'fte.js' });
              } else {
                try { fs.accessSync(resolved, fs.constants.R_OK); } catch {
                  const start = doc.positionAt(node.pos);
                  const end = doc.positionAt(node.pos + (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length));
                  diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: `Parent template is not accessible: ${resolved}`, source: 'fte.js' });
                }
              }
            }
          }
        }
      }
    }
  } catch (e) { logError(e, 'computeDiagnostics.extendValidation'); }

  // Validate blocks used in child templates exist in parent chain
  try {
    const ast4 = parseContent(text) as any;
    const parentAbs = getExtendTargetFrom(text, doc.uri);
    if (parentAbs && ast4?.main) {
      const parentBlocks = new Set<string>();
      try {
        const parentSrc = fs.readFileSync(parentAbs, 'utf8');
        const parentAst = parseContent(parentSrc) as any;
        if (parentAst?.blocks) {
          for (const blockName of Object.keys(parentAst.blocks)) { parentBlocks.add(blockName); }
        }
      } catch {}
      const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
      let m: RegExpExecArray | null;
      while ((m = contentRe.exec(text))) {
        const blockName = m[2];
        const localBlock = ast4?.blocks?.[blockName];
        if (!localBlock && !parentBlocks.has(blockName)) {
          const start = doc.positionAt(m.index);
          const end = doc.positionAt(m.index + m[0].length);
          diags.push({ severity: DiagnosticSeverity.Error, range: { start, end }, message: `Block '${blockName}' is not defined in this template or parent template chain`, source: 'fte.js' });
        }
      }
      if (ast4?.blocks && parentBlocks.size > 0) {
        for (const [blockName, blockInfo] of Object.entries(ast4.blocks)) {
          if (!parentBlocks.has(blockName)) {
            const blockNode = (blockInfo as any);
            if (blockNode && blockNode.declPos !== undefined) {
              const start = doc.positionAt(blockNode.declPos);
              const end = doc.positionAt(blockNode.declPos + 10);
              diags.push({ severity: DiagnosticSeverity.Information, range: { start, end }, message: `Block '${blockName}' is declared in child template but does not exist in parent template. This creates a new block.`, source: 'fte.js' });
            }
          }
        }
      }
    }
  } catch (e) { logError(e, 'computeDiagnostics.parentBlockValidation'); }

  return diags;
}
