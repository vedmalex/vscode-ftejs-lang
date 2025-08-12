import { Position, Range, Location, CompletionItemKind } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { posFromOffset, resolveTemplateRel } from './astUtils';

function offsetFromPosition(text: string, position: Position): number {
  let off = 0;
  let line = 0;
  const len = text.length;
  for (let i = 0; i < len && line < position.line; i++) {
    if (text.charCodeAt(i) === 10 /*\n*/) {
      line += 1;
    }
    off = i + 1;
  }
  return off + position.character;
}

export function getDefinition(
  docText: string,
  docUri: string,
  position: Position,
  deps: {
    parseContent: (text: string) => any
    getExtendTargetFrom: (text: string, docUri?: string) => string | null
    fileIndex: Map<string, { requireAs: Map<string,string>; path?: string }>
    workspaceRoots: string[]
  }
): Location | null {
  const { parseContent, getExtendTargetFrom, fileIndex, workspaceRoots } = deps;
  const text = docText;
  const offset = offsetFromPosition(text, position);
  const winStart = Math.max(0, offset - 200);
  const winEnd = Math.min(text.length, offset + 200);
  const around = text.slice(winStart, winEnd);

  // Check if cursor is on block name inside content('block_name') string literal
  const contentRegex = /content\(\s*(["'`])([^"'`]+)\1/g;
  let contentMatch: RegExpExecArray | null;
  while ((contentMatch = contentRegex.exec(around)) !== null) {
    const blockName = contentMatch[2];
    const contentStart = contentMatch.index;
    const quoteStart = winStart + contentStart + contentMatch[0].indexOf(contentMatch[1]) + 1;
    const quoteEnd = quoteStart + blockName.length;
    if (offset >= quoteStart && offset <= quoteEnd) {
      const ast = parseContent(text) as any;
      if ((ast as any)?.blocks?.[blockName]) {
        const block = (ast as any).blocks[blockName];
        if (block.declPos !== undefined) {
          const declStart = posFromOffset(text, block.declPos);
          const declLength = (block.declStart || '').length + (block.declContent || '').length + (block.declEnd || '').length;
          const declEnd = posFromOffset(text, block.declPos + declLength);
          return Location.create(docUri, Range.create(declStart, declEnd));
        }
        const first = (ast as any).blocks[blockName]?.main?.[0];
        if (first) {
          return Location.create(docUri, Range.create(posFromOffset(text, first.pos), posFromOffset(text, first.pos + (first.content?.length || 0))));
        }
      }
      const parentAbs = getExtendTargetFrom(text, docUri);
      if (parentAbs) {
        try {
          const src = fs.readFileSync(parentAbs, 'utf8');
          const pAst = parseContent(src) as any;
          if (pAst?.blocks?.[blockName]) {
            const parentBlock = pAst.blocks[blockName];
            if (parentBlock.declPos !== undefined) {
              const uri = 'file://' + parentAbs;
              const declStart = posFromOffset(src, parentBlock.declPos);
              const declLength = (parentBlock.declStart || '').length + (parentBlock.declContent || '').length + (parentBlock.declEnd || '').length;
              const declEnd = posFromOffset(src, parentBlock.declPos + declLength);
              return Location.create(uri, Range.create(declStart, declEnd));
            }
            const first = pAst.blocks[blockName]?.main?.[0];
            if (first) {
              const uri = 'file://' + parentAbs;
              return Location.create(uri, Range.create(posFromOffset(src, first.pos), posFromOffset(src, first.pos + (first.content?.length || 0))));
            }
          }
        } catch {}
      }
      break;
    }
  }

  // partial(..., 'name') definition (resolve to file start)
  const mp = around.match(/partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/);
  if (mp) {
    const key = mp[2];
    const aliasMap: Record<string, string> = {};
    const dirRe = /<#@\s*requireAs\s*\(([^)]*)\)\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = dirRe.exec(text))) {
      const params = d[1].split(',').map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''));
      if (params.length >= 2) aliasMap[params[1]] = params[0];
    }
    let target = aliasMap[key] || key;
    if (target === key) {
      for (const [, info] of fileIndex) {
        const mapped = info.requireAs.get(key);
        if (mapped) { target = mapped; break; }
      }
    }
    const resolved = resolveTemplateRel(target, docUri, workspaceRoots);
    if (resolved) {
      const uri = 'file://' + resolved;
      return Location.create(uri, Range.create(Position.create(0,0), Position.create(0,0)));
    }
  }

  // block/slot declaration name itself: navigate to parent override if exists, else self
  const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(text))) {
    const nameStart = match.index + match[0].indexOf(match[3]);
    const nameEnd = nameStart + match[3].length;
    if (offset >= nameStart && offset <= nameEnd) {
      const parentAbs = getExtendTargetFrom(text, docUri);
      if (parentAbs) {
        try {
          const src = fs.readFileSync(parentAbs, 'utf8');
          const escaped = match[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = '<#\\s*-?\\s*(?:block|slot)\\s+(["\'`])' + escaped + '\\1\\s*:\\s*-?\\s*#>';
          const declRe = new RegExp(pattern, 'g');
          const dm = declRe.exec(src);
          if (dm) {
            const uri = 'file://' + parentAbs;
            return Location.create(uri, Range.create(posFromOffset(src, dm.index), posFromOffset(src, dm.index + dm[0].length)));
          }
        } catch {}
      }
      return Location.create(docUri, Range.create(posFromOffset(text, match.index), posFromOffset(text, match.index + match[0].length)));
    }
  }

  return null;
}

export function getReferences(
  docText: string,
  docUri: string,
  position: Position,
  deps: {
    fileIndex: Map<string, { path?: string }>
  }
): Location[] {
  const text = docText;
  const offset = offsetFromPosition(text, position);
  const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
  let selected: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(text))) {
    const nameStart = match.index + match[0].indexOf(match[3]);
    const nameEnd = nameStart + match[3].length;
    if (offset >= nameStart && offset <= nameEnd) {
      selected = match[3];
      break;
    }
  }
  if (!selected) return [];

  const res: Location[] = [];
  if (match) {
    res.push(Location.create(docUri, Range.create(posFromOffset(text, match.index), posFromOffset(text, match.index + match[0].length))));
  }
  const usageRe = new RegExp(String.raw`content\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
  const slotRe = new RegExp(String.raw`slot\(\s*(["'\`])${selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\1`, 'g');
  let u: RegExpExecArray | null;
  while ((u = usageRe.exec(text))) {
    res.push(Location.create(docUri, Range.create(posFromOffset(text, u.index), posFromOffset(text, u.index + u[0].length))));
  }
  while ((u = slotRe.exec(text))) {
    res.push(Location.create(docUri, Range.create(posFromOffset(text, u.index), posFromOffset(text, u.index + u[0].length))));
  }
  for (const [uri, info] of deps.fileIndex) {
    if (uri === docUri) continue;
    const p = info.path ? fs.readFileSync(info.path, 'utf8') : '';
    if (!p) continue;
    let mu: RegExpExecArray | null;
    usageRe.lastIndex = 0;
    while ((mu = usageRe.exec(p))) {
      res.push(Location.create(uri, Range.create(posFromOffset(p, mu.index), posFromOffset(p, mu.index + mu[0].length))));
    }
    slotRe.lastIndex = 0;
    while ((mu = slotRe.exec(p))) {
      res.push(Location.create(uri, Range.create(posFromOffset(p, mu.index), posFromOffset(p, mu.index + mu[0].length))));
    }
  }
  return res;
}

export function getHover(
  docText: string,
  position: Position,
  deps: {
    usageDocs: { functions: Record<string, string>; directives: Record<string, string> }
    parseContent: (text: string) => any
  }
): { contents: { kind: 'markdown' | 'plaintext'; value: string } } | null {
  const { usageDocs, parseContent } = deps;
  const text = docText;
  const offset = offsetFromPosition(text, position);
  const ast = parseContent(text);
  if (!ast) return null;
  const hit = (ast.main as any[])?.find((n: any) => offset >= n.pos && offset <= (n.pos + (n.content?.length || 0)));
  if (hit) {
    const around = text.slice(Math.max(0, offset - 40), Math.min(text.length, offset + 40));
    const func = around.match(/\b(partial|content|slot|chunkStart|chunkEnd)\b/);
    if (func) {
      const key = func[1];
      const info = usageDocs.functions[key] || usageDocs.functions[key === 'chunkEnd' ? 'chunkStart' : key];
      if (info) return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
    }
    const dir = around.match(/<#@\s*(\w+)/);
    if (dir) {
      const info = usageDocs.directives[dir[1]];
      if (info) return { contents: { kind: 'markdown', value: info + "\n\nSee also: USAGE.md" } };
    }
    if (hit.type === 'blockStart' || hit.type === 'slotStart') {
      return { contents: { kind: 'markdown', value: `Declared ${hit.type === 'blockStart' ? 'block' : 'slot'}` } } as any;
    }
    return { contents: { kind: 'plaintext', value: `fte.js: ${hit.type}` } } as any;
  }
  return null;
}
