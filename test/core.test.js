import { describe, expect, it } from 'vitest'
import { countLines, isBinary } from '../src/count.js'
import { detectLanguage } from '../src/languages.js'
import { summarize } from '../src/scan.js'
import { fromFileList, walk } from '../src/walk.js'

describe('detectLanguage', () => {
  it.each([
    ['main.ts', 'TypeScript'],
    ['types.d.ts', 'TypeScript'],
    ['app.js', 'JavaScript'],
    ['lib.rs', 'Rust'],
    ['foo.h', 'C'],
    ['View.m', 'Objective-C'],
    ['README.md', 'Markdown'],
    ['config.yml', 'YAML'],
    ['Dockerfile', 'Dockerfile'],
    ['Makefile', 'Makefile'],
    ['Main.JAVA', 'Java'],
    ['index.html', 'HTML'],
    ['analysis.R', 'R'],
    ['parser.ml', 'OCaml'],
  ])('%s -> %s', (name, expected) => {
    expect(detectLanguage(name)?.name).toBe(expected)
  })

  it('returns null for unknown files', () => {
    expect(detectLanguage('photo.jpeg')).toBeNull()
    expect(detectLanguage('LICENSE-weird')).toBeNull()
  })
})

describe('countLines', () => {
  it('counts code, comments and blanks; a mixed line counts as both', () => {
    const js = 'const a = 1\n\n// comment\n/* block\n  more */\nconst b = 2 // trailing\n'
    expect(countLines(js, 'x.js', 'JavaScript')).toEqual({ total: 6, code: 2, comment: 4, blank: 1 })
  })

  it('handles CRLF and aliased extensions', () => {
    expect(countLines('# c\r\necho hi\r\n\r\n', 'run.sh', 'Shell')).toEqual({ total: 3, code: 1, comment: 1, blank: 1 })
    expect(countLines('x\n// y\n', 'a.mts', 'TypeScript')).toEqual({ total: 2, code: 1, comment: 1, blank: 0 })
  })

  it('falls back to non-blank lines when syntax is unknown', () => {
    expect(countLines('a\n\nb', 'notes.zig', 'Zig')).toEqual({ total: 3, code: 2, comment: null, blank: 1 })
  })

  it('counts an empty file as zero lines', () => {
    expect(countLines('', 'a.py', 'Python')).toEqual({ total: 0, code: 0, comment: 0, blank: 0 })
  })
})

describe('isBinary', () => {
  it('detects NUL bytes', () => {
    expect(isBinary(new Uint8Array([65, 0, 66]))).toBe(true)
    expect(isBinary(new TextEncoder().encode('plain text'))).toBe(false)
  })
})

describe('walk', () => {
  const tree = (paths) =>
    fromFileList(Object.entries(paths).map(([path, text]) => {
      const f = new File([text], path.split('/').pop())
      Object.defineProperty(f, 'webkitRelativePath', { value: path })
      return f
    }))

  const collect = async (root, opts) => {
    const out = []
    for await (const { path } of walk(root, opts)) out.push(path)
    return out
  }

  const root = tree({
    'proj/.gitignore': 'secret.txt\nlogs/\n',
    'proj/src/a.js': '',
    'proj/src/.gitignore': '*.gen.js\n!keep.gen.js\n',
    'proj/src/x.gen.js': '',
    'proj/src/keep.gen.js': '',
    'proj/secret.txt': '',
    'proj/logs/today.log': '',
    'proj/node_modules/lib/index.js': '',
  })

  it('honours nested .gitignore files and default skips', async () => {
    expect(await collect(root)).toEqual(['.gitignore', 'src/.gitignore', 'src/a.js', 'src/keep.gen.js'])
  })

  it('can turn both filters off', async () => {
    expect(await collect(root, { useGitignore: false, skipDefaults: false })).toHaveLength(8)
  })
})

describe('summarize', () => {
  it('aggregates per language and tracks unknown comment syntax', () => {
    const rows = summarize([
      { language: 'Go', type: 'programming', total: 10, code: 7, comment: 1, blank: 2 },
      { language: 'Go', type: 'programming', total: 5, code: 4, comment: 0, blank: 1 },
      { language: 'Zig', type: 'programming', total: 3, code: 3, comment: null, blank: 0 },
    ])
    expect(rows.map((r) => [r.language, r.files, r.code, r.comment, r.commentKnown])).toEqual([
      ['Go', 2, 11, 1, true],
      ['Zig', 1, 3, 0, false],
    ])
  })
})
