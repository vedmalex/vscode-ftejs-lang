import { Parser } from './parser'

export const semanticTokenTypes = [
  'namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter',
  'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method',
  'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'
] as const

export type TokenType = typeof semanticTokenTypes[number]

export const semanticTokenModifiers = [
  'declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'
] as const

export type TokenModifier = typeof semanticTokenModifiers[number]

export type BuiltToken = { line: number; char: number; length: number; type: TokenType; modifiers?: TokenModifier[] }

export function buildSemanticTokensFromText(text: string): BuiltToken[] {
  const ast: any = Parser.parse(text)
  return buildSemanticTokensFromAst(text, ast)
}

export function buildSemanticTokensFromAst(text: string, ast: any): BuiltToken[] {
  if (!ast || !Array.isArray(ast.main)) return []
  const tokens: BuiltToken[] = []

  const add = (from: number, to: number, type: TokenType, mods?: TokenModifier[]) => {
    if (from >= to) return
    const start = offsetToPos(text, from)
    tokens.push({ line: start.line, char: start.character, length: Math.max(1, to - from), type, modifiers: mods })
  }

  for (const node of (ast as any).tokens || ast.main) {
    const startLen = (node.start || '').length
    const contentLen = (node.content || '').length
    const endLen = (node.end || '').length
    const startOff = node.pos ?? 0

    const contentOff = startOff + startLen
    const endOff = contentOff + contentLen

    switch (node.type) {
      case 'directive':
        // <#@ ... #>
        add(startOff, startOff + startLen, 'operator')
        // highlight directive name as keyword within content
        {
          const c = String(node.content || '')
          const m = c.match(/^\s*(\w+)/)
          if (m) {
            const kwStart = contentOff + (m.index || 0)
            add(kwStart, kwStart + m[1].length, 'macro', ['declaration'])
          }
        }
        add(endOff, endOff + endLen, 'operator')
        break
      case 'expression':
        // #{ ... } and !{ ... }
        add(startOff, startOff + startLen, 'operator')
        add(endOff, endOff + endLen, 'operator')
        break
      case 'blockStart':
      case 'slotStart': {
        // <# block 'name' : #>
        add(startOff, startOff + startLen, 'operator')
        const c = String(node.content || '')
        // keyword
        {
          const m = c.match(/^(\s*)(block|slot)\b/)
          if (m) {
            const kwStart = contentOff + (m[1]?.length || 0)
            add(kwStart, kwStart + (m[2]?.length || 0), 'keyword', ['declaration'])
          }
        }
        // quoted name as string
        const nameMatch = c.match(/['"`][^'"`]+['"`]/)
        if (nameMatch) {
          const nameStart = contentOff + (nameMatch.index || 0)
          add(nameStart, nameStart + nameMatch[0].length, 'string')
        }
        add(endOff, endOff + endLen, 'operator')
        break
      }
      case 'blockEnd':
        add(startOff, startOff + startLen, 'operator')
        // 'end' keyword in content
        {
          const c = String(node.content || '')
          const m = c.match(/\bend\b/)
          if (m) {
            const kwStart = contentOff + (m.index || 0)
            add(kwStart, kwStart + 3, 'keyword')
          }
        }
        add(endOff, endOff + endLen, 'operator')
        break
      case 'comments':
        add(startOff, endOff + endLen, 'comment')
        break
      case 'code': {
        // Recognize helper function names as functions
        const c = String(node.content || '')
        const helpers = ['partial', 'content', 'slot', 'chunkStart', 'chunkEnd']
        for (const h of helpers) {
          const re = new RegExp(String.raw`\b${h}\b`, 'g')
          let m: RegExpExecArray | null
          while ((m = re.exec(c))) {
            const s = contentOff + (m.index || 0)
            add(s, s + h.length, 'function')
          }
        }
        break
      }
      default:
        break
    }
  }

  return tokens
}

function offsetToPos(text: string, offset: number): { line: number; character: number } {
  let line = 0
  let character = 0
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (ch === 10 /*\n*/) { line++; character = 0 } else { character++ }
  }
  return { line, character }
}
