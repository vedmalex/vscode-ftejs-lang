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


