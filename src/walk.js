import ignore from 'ignore'

// Skipped even without a .gitignore: VCS metadata and dependency or build
// output that would drown the project's own code.
export const ALWAYS_SKIP = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'vendor',
  '.venv', 'venv', '__pycache__', '.gradle', '.idea', '.next', '.nuxt',
  'dist', 'build', 'target', 'out', 'coverage', '.cache', 'Pods',
])

/*
 * Every source is adapted to the same shape:
 *   { name, kind: 'file' | 'directory', children(): Promise<Node[]>, file(): Promise<File> }
 */

export function fromHandle(handle) {
  return {
    name: handle.name,
    kind: handle.kind,
    async children() {
      const out = []
      for await (const child of handle.values()) out.push(fromHandle(child))
      return out
    },
    file: () => handle.getFile(),
  }
}

export function fromEntry(entry) {
  return {
    name: entry.name,
    kind: entry.isDirectory ? 'directory' : 'file',
    async children() {
      const reader = entry.createReader()
      const out = []
      // readEntries returns at most ~100 entries per call; read until empty.
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
        if (batch.length === 0) return out
        out.push(...batch.map(fromEntry))
      }
    },
    file: () => new Promise((resolve, reject) => entry.file(resolve, reject)),
  }
}

/** Builds a tree from an <input webkitdirectory> FileList. */
export function fromFileList(files) {
  const root = { name: '', kind: 'directory', map: new Map() }
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    let dir = root
    for (const part of parts.slice(0, -1)) {
      if (!dir.map.has(part)) dir.map.set(part, { name: part, kind: 'directory', map: new Map() })
      dir = dir.map.get(part)
    }
    dir.map.set(file.name, { name: file.name, kind: 'file', value: file })
  }
  const adapt = (n) => ({
    name: n.name,
    kind: n.kind,
    children: async () => [...n.map.values()].map(adapt),
    file: async () => n.value,
  })
  // The list's single top-level folder is the root the user picked.
  const top = [...root.map.values()]
  return top.length === 1 && top[0].kind === 'directory' ? adapt(top[0]) : adapt(root)
}

/**
 * Yields { path, node } for every file under `root`, honouring ALWAYS_SKIP
 * and, when `useGitignore` is set, each directory's .gitignore.
 */
export async function* walk(root, { useGitignore = true, skipDefaults = true } = {}) {
  async function* visit(dir, prefix, rules) {
    const children = await dir.children()
    let scoped = rules
    if (useGitignore) {
      const gi = children.find((c) => c.kind === 'file' && c.name === '.gitignore')
      if (gi) {
        const text = await (await gi.file()).text()
        scoped = [...rules, { base: prefix, ig: ignore().add(text) }]
      }
    }
    const ignored = (path, isDir) =>
      scoped.some(({ base, ig }) => {
        const rel = path.slice(base.length) + (isDir ? '/' : '')
        return rel !== '' && ig.ignores(rel)
      })

    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      const path = prefix + child.name
      if (child.kind === 'directory') {
        if (skipDefaults && ALWAYS_SKIP.has(child.name)) continue
        if (ignored(path, true)) continue
        yield* visit(child, path + '/', scoped)
      } else if (!ignored(path, false)) {
        yield { path, node: child }
      }
    }
  }
  yield* visit(root, '', [])
}
