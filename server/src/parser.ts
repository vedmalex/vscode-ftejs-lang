// Local copy of fte.js-parser essential parts for AST-based parsing
// This ensures all syntax parsing operations use consistent AST approach

export type ResultTypes =
  | 'unknown'
  | 'expression'
  | 'uexpression'
  | 'expression2'
  | 'uexpression2'
  | 'code'
  | 'directive'
  | 'comments'
  | 'slotStart'
  | 'blockStart'
  | 'blockEnd'
  | 'text'
  | 'skip'
  | 'empty'

export interface ParserResult {
  data: string
  pos: number
  line: number
  column: number
  type: ResultTypes
  start: string
  end: string
  eol: boolean
}

export interface Items {
  content: string
  indent?: string
  pos: number
  line: number
  column: number
  start: string
  end: string
  eol: boolean
  type: ResultTypes
  name?: string
}

export interface ParserError { message: string; pos: number; line: number; column: number }

type StateDefinition = {
  start?: Array<string>
  end?: Array<string>
  skip?: {
    start?: Array<string>
    end?: Array<string>
  }
  states?: Array<ResultTypes>
  curly?: 0 | 1 | 2
  type?: { [key: string]: ResultTypes }
}

const globalStates: { [key: string]: StateDefinition } = {
  text: {
    states: [
      'unknown',
      'expression',
      'uexpression',
      'code',
      'directive',
      'slotStart',
      'blockStart',
      'blockEnd',
      'comments',
    ],
  },
  unknown: {
    start: ['<%', '<%=', '<%-', '<%_', '<%#'],
    end: ['%>', '-%>', '_%>'],
    skip: {
      start: ['<%%'],
      end: ['%%>'],
    },
    type: {
      '<%': 'code',
      '<%=': 'uexpression',
      '<%-': 'expression',
      '<%#': 'comments',
      '<%_': 'code',
    },
  },
  expression: {
    start: ['#{'],
    end: ['}'],
    curly: 1,
  },
  uexpression: {
    start: ['!{'],
    end: ['}'],
    curly: 1,
  },
  code: {
    start: ['<#', '<#-'],
    end: ['#>', '-#>'],
    skip: {
      start: ['<#@', '<# block', '<# slot', '<# end #>', '<#{'],
    },
  },
  directive: {
    start: ['<#@'],
    end: ['#>', '-#>'],
  },
  comments: {
    start: ['<*'],
    end: ['*>'],
  },
  blockStart: {
    start: ['<# block', '<#- block'],
    end: ['#>', '-#>'],
  },
  slotStart: {
    start: ['<# slot', '<#- slot'],
    end: ['#>', '-#>'],
  },
  blockEnd: {
    start: ['<# end #>', '<#- end #>', '<# end -#>', '<#- end -#>'],
  },
}

export class CodeBlock {
  name!: string
  main: Array<Items> = []
  slots: { [slot: string]: CodeBlock } = {}
  blocks: { [block: string]: CodeBlock } = {}
  // Declaration info for navigation
  declPos?: number
  declStart?: string
  declContent?: string
  declEnd?: string
  
  constructor(init?: ParserResult) {
    if (init) {
      this.name = this.unquote(init.data)
      this.declPos = init.pos
      this.declStart = init.start
      this.declContent = init.data
      this.declEnd = init.end
    }
  }
  
  addBlock(block: CodeBlock) {
    this.blocks[block.name] = block
  }
  
  addSlot(slot: CodeBlock) {
    this.slots[slot.name] = slot
  }
  
  private unquote(str?: string) {
    if (str) {
      let res = str.trim()
      res = res.match(/['"`]([^`'"].*)[`'"]/)?.[1] ?? res
      return res
    }
    return ''
  }
}

function sub(buffer: string, str: string, pos: number = 0, size?: number) {
  if (!size) {
    size = buffer.length
  }
  const len = str.length
  const from = pos
  const to = pos + len
  if (to <= size) {
    let res = ''
    for (let i = from; i < to; i += 1) {
      res += buffer[i]
    }
    return res
  }
  return ''
}

// Expose SUB for compatibility tests with upstream fte.js-parser
export function SUB(buffer: string, str: string, pos: number = 0, size?: number) {
  return sub(buffer, str, pos, size)
}

export class Parser {
  private buffer: string
  private size: number
  private static INITIAL_STATE: ResultTypes = 'text'
  private globalState: ResultTypes
  private actualState?: ResultTypes | null
  private globalToken!: ParserResult
  private pos = 0
  private line = 1
  private column = 1
  private curlyAware: 0 | 1 | 2 | undefined = 0
  private curlyBalance: Array<number> = []
  private result: Array<ParserResult> = []
  private errors: Array<ParserError> = []

  public static parse(text: string, options: { indent?: number } = {}) {
    const parser = new Parser(text, options)
    parser.parse()
    return parser.process()
  }

  private constructor(value: string, options: { indent?: number }) {
    this.globalState = Parser.INITIAL_STATE
    this.buffer = value.toString()
    this.size = this.buffer.length
  }

  private collect() {
    const { term, eol } = this.symbol()
    if (eol) {
      this.globalToken.eol = true
      this.term()
    } else {
      this.globalToken.data += term
    }
  }

  private run(currentState: ResultTypes) {
    const init_pos = this.pos
    const state = globalStates[currentState]
    this.curlyAware = state.curly
    
    if (state.start) {
      if (state.skip?.start) {
        for (let i = 0; i < state.skip.start.length; i += 1) {
          if (this.SUB(state.skip.start[i]) == state.skip.start[i]) {
            return false
          }
        }
      }
      
      let foundStart = false
      let foundEnd = false
      for (let i = state.start.length - 1; i >= 0; i -= 1) {
        const p = state.start[i]
        const subs = this.SUB(p).toLowerCase()
        if (subs == p) {
          foundStart = true
          this.globalState = currentState
          this.actualState = state.type?.[p] ?? currentState
          this.term({ start: p })
          this.SKIP(p)
          break
        }
      }
      
      if (foundStart)
        do {
          if (state.end) {
            let i
            for (i = state.end.length - 1; i >= 0; i -= 1) {
              const p = state.end[i]
              if (state.curly == 1 && p.indexOf('}') > -1) {
                if (this.curlyBalance.length > 0) {
                  break
                }
              }
              const subs = this.SUB(p).toLowerCase()
              if (subs == p) {
                this.SKIP(p)
                foundEnd = true
                break
              }
            }
            if (!foundEnd) {
              this.collect()
            } else {
              this.globalToken.end = state.end[i]
              this.actualState = null
            }
          } else {
            foundEnd = true
          }
        } while (!foundEnd && this.pos < this.size)
    } else if (state.states) {
      let found = false
      for (let i = state.states.length - 1; i >= 0; i -= 1) {
        const name = state.states[i]
        found = this.run(name)
        if (found) {
          this.globalState = currentState
          this.actualState = null
          this.term()
          break
        }
      }
      if (!found) {
        this.collect()
      }
    }
    return init_pos != this.pos
  }

  private parse() {
    if (this.size > 0) {
      this.term()
      do {
        this.run(this.globalState)
      } while (this.pos < this.size)
      this.term()
    }
  }

  private process() {
    const content = new CodeBlock()
    const resultSize = this.result.length
    let curr = content
    const tokens: Items[] = []
    const stack: Array<{ type: 'block' | 'slot'; name: string; pos: number; line: number; column: number }> = []
    const unquote = (str?: string) => {
      if (!str) return ''
      const m = str.match(/['"`]\s*([^'"`]+?)\s*['"`]/)
      return m ? m[1] : str.trim()
    }

    for (let i = 0; i < resultSize; i += 1) {
      const r = this.result[i]
      let data = r.data
      const { pos, line, column, start, end, eol, type } = r

      switch (type) {
        case 'blockStart':
          // push token for opener with extracted name
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
            name: unquote(data),
          })
          curr = new CodeBlock(r)
          content.addBlock(curr)
          // track for error reporting
          stack.push({ type: 'block', name: unquote(data), pos, line, column })
          break
        case 'slotStart':
          // push token for slot opener with extracted name
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
            name: unquote(data),
          })
          curr = new CodeBlock(r)
          content.addSlot(curr)
          stack.push({ type: 'slot', name: unquote(data), pos, line, column })
          break
        case 'blockEnd':
          // push token for end
          tokens.push({
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type,
            eol,
          })
          if (stack.length === 0) {
            this.errors.push({ message: 'Unmatched end tag', pos, line, column })
          } else {
            stack.pop()
          }
          curr = content
          break
        case 'code':
        case 'expression':
        case 'uexpression':
        case 'text':
        case 'directive':
        case 'comments':
          const item: Items = {
            content: data,
            pos,
            line,
            column,
            start,
            end,
            type: type === 'uexpression' ? 'expression' : type,
            eol,
          }
          // push into flat token stream preserving order
          tokens.push(item)
          curr.main.push(item)
          break
      }
    }
    ;(content as any).tokens = tokens
    // any unclosed blocks/slots
    if (stack.length > 0) {
      for (const it of stack) {
        const kind = it.type === 'slot' ? 'slot' : 'block'
        this.errors.push({ message: `Unclosed ${kind}: '${it.name}'`, pos: it.pos, line: it.line, column: it.column })
      }
    }
    ;(content as any).errors = this.errors
    return content
  }

  private symbol() {
    const res = this.buffer[this.pos]
    if (this.curlyAware == 1) {
      if (~res.indexOf('{')) {
        this.curlyBalance.push(this.pos)
      } else if (~res.indexOf('}')) {
        this.curlyBalance.pop()
      }
    }
    return this.SKIP(res)
  }

  private SKIP(term: string) {
    let eol = false
    if (term.length == 1) {
      if (term == '\n' || term == '\r' || term == '\u2028' || term == '\u2029') {
        if (term == '\r' && this.SUB('\r\n') == '\r\n') {
          term = '\r\n'
        }
        this.column = 1
        this.line += 1
        eol = true
      } else if (term == '\t') {
        this.column += 2 // default tab size
      } else {
        this.column += 1
      }
      this.pos += term.length
    } else {
      const startPos = this.pos
      let nTerm = ''
      do {
        nTerm += this.SKIP(this.buffer[this.pos])
      } while (this.pos < startPos + term.length)
      term = nTerm
    }
    return { term, eol }
  }

  private block(extra: Partial<ParserResult> = {}): ParserResult {
    const { pos, line, column, globalState, actualState } = this
    return {
      data: '',
      pos,
      line,
      column,
      type: actualState || globalState,
      start: '',
      end: '',
      eol: false,
      ...extra,
    }
  }

  private SUB(str: string) {
    return sub(this.buffer, str, this.pos, this.size)
  }

  private term(extra = {}) {
    this.globalToken = this.block(extra)
    this.result.push(this.globalToken)
  }
}
