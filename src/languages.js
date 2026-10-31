import * as linguist from 'linguist-languages'

// Extensions several languages claim, settled in favour of the one most
// projects mean. Anything not listed falls back to detectRanking below.
const PREFERRED = {
  '.h': 'C',
  '.m': 'Objective-C',
  '.md': 'Markdown',
  '.pl': 'Perl',
  '.t': 'Perl',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.json': 'JSON',
  '.sql': 'SQL',
  '.v': 'Verilog',
  '.cs': 'C#',
  '.fs': 'F#',
  '.rs': 'Rust',
  '.d': 'D',
  '.txt': 'Text',
  '.inc': 'PHP',
  '.l': 'Lex',
  '.ts': 'TypeScript',
  '.pro': 'Prolog',
  '.mod': 'Modula-2',
  '.cls': 'Apex',
  '.html': 'HTML',
  '.r': 'R',
  '.ml': 'OCaml',
  '.f': 'Fortran',
  '.asm': 'Assembly',
  '.scm': 'Scheme',
  '.st': 'Smalltalk',
  '.as': 'ActionScript',
  '.ls': 'LiveScript',
  '.e': 'Eiffel',
  '.nu': 'Nushell',
  '.lean': 'Lean 4',
  '.plist': 'XML Property List',
  '.cue': 'CUE',
}

const TYPE_RANK = { programming: 0, markup: 1, data: 2, prose: 3 }

const byName = new Map()
const byExtension = new Map()
const byFilename = new Map()

for (const lang of Object.values(linguist)) {
  byName.set(lang.name, lang)
  for (const filename of lang.filenames ?? []) {
    if (!byFilename.has(filename)) byFilename.set(filename, lang)
  }
  for (const ext of lang.extensions ?? []) {
    const key = ext.toLowerCase()
    if (!byExtension.has(key)) byExtension.set(key, [])
    byExtension.get(key).push(lang)
  }
}

function rank(ext, lang) {
  const primary = lang.extensions[0].toLowerCase() === ext ? 0 : 1
  return primary * 10 + (TYPE_RANK[lang.type] ?? 9)
}

const resolved = new Map()
for (const [ext, langs] of byExtension) {
  const preferred = PREFERRED[ext] && byName.get(PREFERRED[ext])
  resolved.set(ext, preferred ?? [...langs].sort((a, b) => rank(ext, a) - rank(ext, b))[0])
}

/**
 * Returns the linguist language for a file name, or null when none matches.
 * Longest compound extension wins, so `x.d.ts` can match before `.ts`.
 */
export function detectLanguage(fileName) {
  const exact = byFilename.get(fileName)
  if (exact) return exact
  const lower = fileName.toLowerCase()
  for (let i = lower.indexOf('.', 1); i !== -1; i = lower.indexOf('.', i + 1)) {
    const lang = resolved.get(lower.slice(i))
    if (lang) return lang
  }
  return null
}

export const LANGUAGE_TYPES = ['programming', 'markup', 'data', 'prose']
