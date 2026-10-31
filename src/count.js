import sloc from 'sloc'

const SUPPORTED = new Set(sloc.extensions)

// Extensions sloc does not know, mapped to one with the same comment syntax.
const ALIASES = {
  cjs: 'js', mjs: 'js', cts: 'ts', mts: 'ts',
  yml: 'yaml', hh: 'hpp', 'c++': 'cpp', 'h++': 'hpp', ipp: 'hpp',
  pyw: 'py', pyi: 'py', rake: 'rb', gemspec: 'rb',
  svelte: 'html', xhtml: 'html', xsd: 'xml', xsl: 'xml', plist: 'xml',
  gradle: 'groovy', sc: 'scala', erb: 'html',
  // '#' comments only, like R
  sh: 'r', bash: 'r', zsh: 'r', fish: 'r', toml: 'r', ini: 'r', cfg: 'r',
  conf: 'r', ps1: 'r', tf: 'r', cmake: 'r', mk: 'r', pm: 'pl',
}

// Languages whose comment syntax follows from the name rather than an extension.
const LANGUAGE_ALIASES = {
  Makefile: 'r', Dockerfile: 'r', Shell: 'r', CMake: 'r', TOML: 'r', YAML: 'yaml',
}

function slocType(fileName, languageName) {
  const dot = fileName.lastIndexOf('.')
  if (dot > 0) {
    const ext = fileName.slice(dot + 1).toLowerCase()
    if (SUPPORTED.has(ext)) return ext
    if (ALIASES[ext]) return ALIASES[ext]
  }
  return LANGUAGE_ALIASES[languageName] ?? null
}

/**
 * Counts lines in one file. `comment` is null when the comment syntax is
 * unknown; `code` is then every non-blank line.
 */
export function countLines(text, fileName, languageName) {
  if (text === '') return { total: 0, code: 0, comment: 0, blank: 0 }
  const normalized = text.replace(/\r\n?/g, '\n')
  const type = slocType(fileName, languageName)
  if (type) {
    try {
      const r = sloc(normalized, type)
      return { total: r.total, code: r.source, comment: r.comment, blank: r.empty }
    } catch {
      // fall through to the syntax-agnostic count
    }
  }
  const lines = normalized.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const blank = lines.filter((l) => l.trim() === '').length
  return { total: lines.length, code: lines.length - blank, comment: null, blank }
}

export function isBinary(bytes) {
  const n = Math.min(bytes.length, 8000)
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true
  return false
}
