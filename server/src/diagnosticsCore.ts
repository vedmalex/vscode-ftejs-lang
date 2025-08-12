import * as fs from 'fs';
import * as path from 'path';
import { getTemplatePathVariants } from './astUtils';

export type SimpleDiagnostic = {
  severity: 'error' | 'warning' | 'hint'
  message: string
};

export function computeDiagnosticsFromText(text: string, workspaceRoots: string[] = []): SimpleDiagnostic[] {
  const diags: SimpleDiagnostic[] = [];

  // Unmatched end: more end tags than opened
  try {
    const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
    const endRe = /<#\s*-?\s*end\s*-?\s*#>/g;
    let opens = 0;
    let ends = 0;
    while (openRe.exec(text)) opens += 1;
    while (endRe.exec(text)) ends += 1;
    if (ends > opens) {
      diags.push({ severity: 'error', message: 'Unmatched end' });
    }
  } catch {}

  // Duplicate block/slot declarations
  try {
    const seen: Record<string, number> = {};
    const kind: Record<string, 'block' | 'slot'> = {};
    const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = rxDecl.exec(text))) {
      const name = d[3];
      seen[name] = (seen[name] || 0) + 1;
      kind[name] = (d[1] as 'block' | 'slot');
    }
    for (const n of Object.keys(seen)) {
      if (seen[n] > 1) {
        diags.push({ severity: 'warning', message: `Duplicate ${kind[n]} declaration: ${n}` });
      }
    }
  } catch {}

  // Unknown content('name') references
  try {
    const declared = new Set<string>();
    const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
    let d: RegExpExecArray | null;
    while ((d = rxDecl.exec(text))) {
      declared.add(d[3]);
    }
    const rxUse = /content\(\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = rxUse.exec(text))) {
      const name = m[2];
      if (!declared.has(name)) {
        diags.push({ severity: 'warning', message: `Unknown block name: ${name}` });
      }
    }
  } catch {}

  // Unresolved partial alias/path
  try {
    const rp = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = rp.exec(text))) {
      const key = m[2];
      const bases = [ ...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates')) ];
      const exists = (rel: string) => {
        for (const base of bases) {
          const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
          const variants = getTemplatePathVariants(p);
          for (const v of variants) { if (fs.existsSync(v)) return true; }
        }
        return false;
      };
      if (!exists(key)) {
        diags.push({ severity: 'warning', message: `Unresolved partial: ${key}` });
      }
    }
  } catch {}

  return diags;
}


