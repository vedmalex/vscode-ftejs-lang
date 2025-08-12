import { Position } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
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

// AST traversal utility to eliminate duplication across server.ts
export function walkAstNodes(ast: any, callback: (node: any) => void | boolean): void {
  if (!ast || !Array.isArray(ast.main)) return;
  
  for (const node of ast.main as any[]) {
    const result = callback(node);
    if (result === false) break; // Allow early termination
  }
}

// Template path variants utility to eliminate 4x duplication
export function getTemplatePathVariants(basePath: string): string[] {
  // Defer to shared mapping to ensure client/server parity
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const shared = require('../../shared/template-extensions.js');
    const variants = shared.getTemplatePathVariants?.(basePath);
    if (Array.isArray(variants)) return variants as string[];
  } catch {}
  // Fallback to built-in list if shared module is unavailable
  return [basePath, basePath + '.njs', basePath + '.nhtml', basePath + '.nts'];
}

// Compute LSP Position from character offset
export function posFromOffset(text: string, offset: number): Position {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 10 /*\n*/ ) { line++; col = 0; } else { col++; }
  }
  return Position.create(line, col);
}

// Resolve parent template path from <#@ extend ... #> in given text
export function getExtendTargetFrom(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any
): string | null {
  const ast = parseContent(text);
  if (ast && Array.isArray(ast.main)) {
    for (const node of ast.main as any[]) {
      if (node.type === 'directive' && node.content) {
        const content = String(node.content).trim();
        if (content.startsWith('extend')) {
          const match = content.match(/extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s+(["'`])([^"'`]+)\3)/);
          const rel = (match?.[2] || match?.[4])?.trim();
          if (rel) return resolveTemplatePath(rel, docUri);
        }
      }
    }
  }
  const m = text.match(/<#@\s*extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s*(["'`])([^"'`]+)\3)\s*#>/);
  const rel = (m?.[2] || m?.[4])?.trim();
  if (!rel) return null;
  return resolveTemplatePath(rel, docUri);
}

export function resolveTemplatePath(rel: string, docUri?: string): string | null {
  try {
    const currentDir = docUri && docUri.startsWith('file:') ? path.dirname(url.fileURLToPath(docUri)) : process.cwd();
    const workspaceRoots: string[] = []; // caller may prefer passing explicit bases
    const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
    for (const base of bases) {
      const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
      const variants = getTemplatePathVariants(p);
      for (const v of variants) { if (fs.existsSync(v)) return v; }
    }
  } catch {}
  return null;
}

// Resolve a template relative to current doc and workspace roots
export function resolveTemplateRel(rel: string, docUri: string | undefined, workspaceRoots: string[]): string | null {
  try {
    const currentDir = docUri && docUri.startsWith('file:') ? path.dirname(url.fileURLToPath(docUri)) : process.cwd();
    const bases = [currentDir, ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
    for (const base of bases) {
      const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
      const variants = getTemplatePathVariants(p);
      for (const v of variants) { if (fs.existsSync(v)) return v; }
    }
  } catch {}
  return null;
}

// Detect if a line contains template delimiters that should not be treated as plain JS/HTML for indent purposes
export function isTemplateTagLine(line: string): boolean {
  return /<#|#>|\#\{|!\{|<%|%>/.test(line);
}

// Remove strings and comments for lightweight JS structure analysis
export function stripStringsAndComments(line: string): string {
  let res = line.replace(/\/\/.*$/, '');
  res = res.replace(/'(?:\\.|[^'\\])*'/g, "'");
  res = res.replace(/"(?:\\.|[^"\\])*"/g, '"');
  res = res.replace(/`(?:\\.|[^`\\])*`/g, '`');
  return res;
}

// Compute JS indent delta and whether to dedent first for a line
export function computeJsCodeDelta(line: string): { dedentFirst: number; delta: number } {
  const trimmed = line.trimStart();
  let dedentFirst = /^(}|\)|\]|case\b|default\b)/.test(trimmed) ? 1 : 0;
  if (/^default\b/.test(trimmed)) {
    dedentFirst = 1;
  }
  const safe = stripStringsAndComments(line);
  const opens = (safe.match(/[\{\(\[]/g) || []).length;
  const closes = (safe.match(/[\}\)\]]/g) || []).length;
  const delta = opens - closes;
  return { dedentFirst, delta };
}

// Collect all segments from AST in document order for formatting fallback or reconstruction
export function collectAllASTSegments(ast: any): any[] {
  if (!ast) return [];
  const allSegments: any[] = [];
  const segmentsByPos: Array<{ pos: number; segment: any; source: string }> = [];
  for (const item of ast.main || []) {
    segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'main' });
  }
  for (const [blockName, block] of Object.entries<any>(ast.blocks || {})) {
    const blockContent = block.main || [];
    if (blockContent.length > 0) {
      const firstItem = blockContent[0];
      const lastItem = blockContent[blockContent.length - 1];
      const blockStartPos = Math.max(0, (firstItem.pos || 0) - 50);
      segmentsByPos.push({
        pos: blockStartPos,
        segment: { type: 'blockStart', content: ` block '${blockName}' : `, start: '<#', end: '#>', pos: blockStartPos },
        source: 'block-start'
      });
      for (const item of blockContent) {
        segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'block-content' });
      }
      const blockEndPos = (lastItem.pos || 0) + (lastItem.content?.length || 0) + 10;
      segmentsByPos.push({
        pos: blockEndPos,
        segment: { type: 'blockEnd', content: ' end ', start: '<#', end: '#>', pos: blockEndPos },
        source: 'block-end'
      });
    }
  }
  for (const [slotName, slot] of Object.entries<any>(ast.slots || {})) {
    const slotContent = slot.main || [];
    if (slotContent.length > 0) {
      const firstItem = slotContent[0];
      const lastItem = slotContent[slotContent.length - 1];
      const slotStartPos = Math.max(0, (firstItem.pos || 0) - 50);
      segmentsByPos.push({
        pos: slotStartPos,
        segment: { type: 'slotStart', content: ` slot '${slotName}' : `, start: '<#', end: '#>', pos: slotStartPos },
        source: 'slot-start'
      });
      for (const item of slotContent) {
        segmentsByPos.push({ pos: item.pos || 0, segment: item, source: 'slot-content' });
      }
      const slotEndPos = (lastItem.pos || 0) + (lastItem.content?.length || 0) + 10;
      segmentsByPos.push({
        pos: slotEndPos,
        segment: { type: 'slotEnd', content: ' end ', start: '<#', end: '#>', pos: slotEndPos },
        source: 'slot-end'
      });
    }
  }
  segmentsByPos.sort((a, b) => a.pos - b.pos);
  return segmentsByPos.map(item => item.segment);
}

export type BlockInfo = { name: string; startPos: number; endPos: number };
export type SlotInfo = { name: string; startPos: number; endPos: number };

export function extractBlockAndSlotSymbols(ast: any): { blocks: BlockInfo[]; slots: SlotInfo[] } {
  const blocks: BlockInfo[] = [];
  const slots: SlotInfo[] = [];
  if (!ast) return { blocks, slots };
  for (const [name, block] of Object.entries<any>(ast.blocks || {})) {
    const first = block.main?.[0];
    const last = block.main?.[block.main.length - 1];
    if (first && last) {
      blocks.push({ name: String(name), startPos: first.pos, endPos: last.pos + (last.content?.length || 0) });
    }
  }
  for (const [name, slot] of Object.entries<any>(ast.slots || {})) {
    const first = slot.main?.[0];
    const last = slot.main?.[slot.main.length - 1];
    if (first && last) {
      slots.push({ name: String(name), startPos: first.pos, endPos: last.pos + (last.content?.length || 0) });
    }
  }
  return { blocks, slots };
}


// Compute open blocks from full text using provided parser
export function computeOpenBlocksFromText(
  text: string,
  upTo: number | undefined,
  parseContent: (t: string) => any
): OpenBlock[] {
  const ast = parseContent(text) as any;
  const limit = typeof upTo === 'number' ? upTo : text.length;
  if (ast && Array.isArray(ast.main)) {
    return computeOpenBlocksFromAst(ast.main as any[], limit);
  }
  return [];
}

export function validateStructureAndCollectErrors(
  text: string,
  parseContent: (t: string) => any
): { unmatchedEnds: Array<{ pos: number; len: number }>; unclosed: Array<{ name: string; pos: number }>; parserErrors: Array<{ pos: number; message: string }> } {
  const ast: any = parseContent(text);
  const unmatchedEnds: Array<{ pos: number; len: number }> = [];
  const unclosed: Array<{ name: string; pos: number }> = [];
  const parserErrors: Array<{ pos: number; message: string }> = [];
  if (!ast || !Array.isArray(ast.main)) {
    parserErrors.push({ pos: 0, message: 'Parse error' });
    return { unmatchedEnds, unclosed, parserErrors };
  }
  type StackItem = { name: string; pos: number };
  const stack: StackItem[] = [];
  for (const n of ast.main as any[]) {
    if (n.type === 'blockStart' || n.type === 'slotStart') {
      const name = String(n.name || n.blockName || n.slotName || '');
      stack.push({ name, pos: n.pos });
    } else if (n.type === 'end') {
      if (stack.length === 0) {
        const len = (text.slice(n.pos).match(/^<#-?\s*end\s*-?#>/)?.[0]?.length) || 5;
        unmatchedEnds.push({ pos: n.pos, len });
      } else {
        stack.pop();
      }
    }
  }
  for (const it of stack) unclosed.push({ name: it.name, pos: it.pos });
  if (Array.isArray((ast as any).errors)) {
    for (const e of (ast as any).errors) parserErrors.push({ pos: e.pos || 0, message: e.message });
  }
  return { unmatchedEnds, unclosed, parserErrors };
}

// Scan AST-bound expr/code nodes to collect content('name') references that are unknown
export function collectUnknownContentRefs(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any,
  getExtendTargetFrom: (t: string, uri?: string) => string | null
): Array<{ index: number; length: number; name: string }> {
  const ast: any = parseContent(text);
  const result: Array<{ index: number; length: number; name: string }> = [];
  const known = new Set<string>(Object.keys(ast?.blocks || {}));
  const parentAbs = getExtendTargetFrom(text, docUri);
  if (parentAbs) {
    try {
      const src = fs.readFileSync(parentAbs, 'utf8');
      const pAst = parseContent(src) as any;
      for (const k of Object.keys(pAst?.blocks || {})) known.add(k);
    } catch {}
  }
  const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
  if (ast?.main) {
    for (const n of ast.main as any[]) {
      if (n && (n.type === 'expr' || n.type === 'code')) {
        contentRe.lastIndex = 0;
        let mm: RegExpExecArray | null;
        while ((mm = contentRe.exec(String(n.content || '')))) {
          const glob = (n.pos || 0) + (String(n.start || '').length) + mm.index;
          const name = mm[2];
          if (!known.has(name)) {
            result.push({ index: glob, length: mm[0].length, name });
          }
        }
      }
    }
  }
  return result;
}

// Scan for partial(..., 'name') and verify target can be resolved using local requireAs and workspace index
export function collectUnresolvedPartials(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any,
  fileIndex: Map<string, { requireAs: Map<string, string> }>,
  workspaceRoots: string[]
): Array<{ index: number; length: number; key: string }> {
  const ast: any = parseContent(text);
  const res: Array<{ index: number; length: number; key: string }> = [];
  const partialRe = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
  const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
  const local = new Map<string, string>();
  let d: RegExpExecArray | null;
  while ((d = dirRe.exec(text))) {
    const params = d[1].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''));
    if (params.length >= 2) local.set(params[1], params[0]);
  }
  if (ast?.main) {
    for (const n of ast.main as any[]) {
      if (n && (n.type === 'expr' || n.type === 'code')) {
        partialRe.lastIndex = 0;
        let mm: RegExpExecArray | null;
        while ((mm = partialRe.exec(String(n.content || '')))) {
          const glob = (n.pos || 0) + (String(n.start || '').length) + mm.index;
          const key = mm[2];
          let target = local.get(key) || key;
          if (target === key) {
            for (const [, info] of fileIndex) { const mapped = info.requireAs.get(key); if (mapped) { target = mapped; break; } }
          }
          const resolved = resolveTemplateRel(target, docUri, workspaceRoots);
          if (!resolved) res.push({ index: glob, length: mm[0].length, key });
        }
      }
    }
  }
  return res;
}

// Duplicate block/slot declarations
export function collectDuplicateDeclarations(
  text: string,
  parseContent: (t: string) => any
): Array<{ name: string; pos: number; length: number }> {
  const ast: any = parseContent(text);
  const out: Array<{ name: string; pos: number; length: number }> = [];
  const seen: Record<string, number> = {};
  if (ast?.main) {
    for (const n of ast.main as any[]) {
      if (n.type === 'blockStart' || n.type === 'slotStart') {
        const name = String(n.name || n.blockName || n.slotName || '');
        seen[name] = (seen[name] || 0) + 1;
        if (seen[name] > 1) {
          out.push({ name, pos: n.pos || 0, length: (String(n.start || '').length) || 1 });
        }
      }
    }
  }
  return out;
}

// Whitespace trim hints around template tags
export function collectTrimWhitespaceHints(text: string): Array<{ start: number; end: number; kind: 'left' | 'right' }> {
  const hints: Array<{ start: number; end: number; kind: 'left' | 'right' }> = [];
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
      if (atLineStart && (ml[2]?.length ?? 0) >= 0) {
        hints.push({ start: ml.index, end: ml.index + 2, kind: 'left' });
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
      hints.push({ start: mr.index, end: mr.index + 2, kind: 'right' });
    }
  } catch {}
  return hints;
}

// Directive validation in text
export function validateDirectivesInText(text: string): Array<{ start: number; end: number; message: string; severity: 'warning' | 'error' }> {
  const issues: Array<{ start: number; end: number; message: string; severity: 'warning' | 'error' }> = [];
  try {
    const DIRECTIVES = [
      'extend', 'context', 'alias', 'deindent', 'chunks', 'includeMainChunk', 'useHash',
      'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback', 'requireAs', 'lang'
    ];
    const dirRe = /<#@([\s\S]*?)#>/g; let d: RegExpExecArray | null;
    while ((d = dirRe.exec(text))) {
      const content = d[1].trim();
      const startPos = d.index;
      const endPos = d.index + d[0].length;
      const nameMatch = content.match(/^(\w+)/);
      if (!nameMatch) {
        issues.push({ start: startPos, end: endPos, message: 'Empty directive', severity: 'warning' });
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
      const requireNoParams = ['includeMainChunk', 'useHash', 'noContent', 'noSlots', 'noBlocks', 'noPartial', 'noOptions', 'promise', 'callback'];
      const range = { start: startPos, end: endPos };
      switch (name) {
        case 'extend':
        case 'context':
          if (params.length < 1) issues.push({ ...range, message: `Directive ${name} requires 1 parameter`, severity: 'warning' });
          break;
        case 'alias':
          if (params.length < 1) issues.push({ ...range, message: 'Directive alias requires at least 1 parameter', severity: 'warning' });
          break;
        case 'requireAs':
          if (params.length !== 2) issues.push({ ...range, message: 'Directive requireAs requires exactly 2 parameters', severity: 'warning' });
          break;
        case 'deindent':
          if (params.length > 1) {
            issues.push({ ...range, message: 'Directive deindent accepts at most 1 numeric parameter', severity: 'warning' });
          } else if (params.length === 1 && Number.isNaN(Number(params[0]))) {
            issues.push({ ...range, message: 'Directive deindent parameter must be a number', severity: 'warning' });
          }
          break;
        case 'lang':
          if (params.length < 1) issues.push({ ...range, message: 'Directive lang requires 1 parameter or assignment', severity: 'warning' });
          break;
        default:
          if (!DIRECTIVES.includes(name)) {
            issues.push({ ...range, message: `Unknown directive: ${name}`, severity: 'warning' });
          } else if (requireNoParams.includes(name) && params.length > 0) {
            issues.push({ ...range, message: `Directive ${name} does not accept parameters`, severity: 'warning' });
          }
      }
    }
  } catch {}
  return issues;
}


// Validate extend directive resolves to an accessible parent template
export function collectExtendParentIssues(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any,
  workspaceRoots: string[]
): Array<{ start: number; end: number; message: string; severity: 'error' }> {
  const issues: Array<{ start: number; end: number; message: string; severity: 'error' }> = [];
  try {
    const ast = parseContent(text) as any;
    if (ast && Array.isArray(ast.main)) {
      for (const node of ast.main as any[]) {
        if (node?.type === 'directive' && node.content) {
          const content = String(node.content).trim();
          if (content.startsWith('extend')) {
            const match = content.match(/extend\s*(?:\(\s*(["'`])([^"'`]+)\1\s*\)|\s+(["'`])([^"'`]+)\3)/);
            const rel = (match?.[2] || match?.[4])?.trim();
            if (rel) {
              const resolved = resolveTemplateRel(rel, docUri, workspaceRoots);
              const start = node.pos || 0;
              const length = (String(node.start || '').length + String(node.content || '').length + String(node.end || '').length) || content.length;
              const range = { start, end: start + length };
              if (!resolved) {
                issues.push({ start: range.start, end: range.end, message: `Parent template not found: ${rel}`, severity: 'error' });
              } else {
                try { fs.accessSync(resolved, fs.constants.R_OK); } catch {
                  issues.push({ start: range.start, end: range.end, message: `Parent template is not accessible: ${resolved}`, severity: 'error' });
                }
              }
            }
          }
        }
      }
    }
  } catch {}
  return issues;
}

// Find content('name') usages that are not locally declared nor in parent
export function collectUnknownContentAgainstParent(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any,
  getExtendTargetFrom: (t: string, uri?: string) => string | null
): Array<{ index: number; length: number; name: string }> {
  const out: Array<{ index: number; length: number; name: string }> = [];
  try {
    const ast = parseContent(text) as any;
    const parentAbs = getExtendTargetFrom(text, docUri);
    const parentBlocks = new Set<string>();
    if (parentAbs) {
      try {
        const parentSrc = fs.readFileSync(parentAbs, 'utf8');
        const parentAst = parseContent(parentSrc) as any;
        for (const k of Object.keys(parentAst?.blocks || {})) parentBlocks.add(k);
      } catch {}
    }
    const contentRe = /content\(\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = contentRe.exec(text))) {
      const blockName = m[2];
      const localBlock = ast?.blocks?.[blockName];
      if (!localBlock && !parentBlocks.has(blockName)) {
        out.push({ index: m.index, length: m[0].length, name: blockName });
      }
    }
  } catch {}
  return out;
}

// Find child-declared blocks that do not exist in parent
export function collectChildBlocksMissingInParent(
  text: string,
  docUri: string | undefined,
  parseContent: (t: string) => any,
  getExtendTargetFrom: (t: string, uri?: string) => string | null
): Array<{ start: number; end: number; name: string }> {
  const res: Array<{ start: number; end: number; name: string }> = [];
  try {
    const ast = parseContent(text) as any;
    const parentAbs = getExtendTargetFrom(text, docUri);
    if (!parentAbs || !ast?.blocks) return res;
    const parentBlocks = new Set<string>();
    try {
      const parentSrc = fs.readFileSync(parentAbs, 'utf8');
      const parentAst = parseContent(parentSrc) as any;
      for (const k of Object.keys(parentAst?.blocks || {})) parentBlocks.add(k);
    } catch {}
    if (parentBlocks.size === 0) return res;
    for (const [blockName, blockInfo] of Object.entries<any>(ast.blocks)) {
      if (!parentBlocks.has(blockName)) {
        const declPos = (blockInfo as any).declPos ?? (blockInfo as any).pos ?? 0;
        res.push({ start: declPos, end: declPos + 10, name: String(blockName) });
      }
    }
  } catch {}
  return res;
}


