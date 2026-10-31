import { detectLanguage } from './languages.js'
import { walk } from './walk.js'

function createPool(size) {
  const workers = Array.from({ length: size }, () =>
    new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }))
  const pending = new Map()
  let next = 0
  for (const w of workers) {
    w.onmessage = ({ data }) => {
      pending.get(data.id)(data)
      pending.delete(data.id)
    }
  }
  return {
    run(message) {
      const id = next++
      return new Promise((resolve) => {
        pending.set(id, resolve)
        workers[id % size].postMessage({ ...message, id })
      })
    },
    terminate: () => workers.forEach((w) => w.terminate()),
  }
}

/**
 * Scans a tree (see walk.js) and returns
 *   { files: [{ path, language, type, color, total, code, comment, blank }], skipped: [{ path, reason }] }
 * `onProgress({ found, done })` is called as files are discovered and counted.
 */
export async function scan(root, options, onProgress = () => {}, signal) {
  const size = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8))
  const pool = createPool(size)
  // Bounds how many files are read at once so large trees do not load into memory together.
  const limit = size * 4
  let inFlight = 0
  let wake = null
  const files = []
  const skipped = []
  const jobs = []
  let found = 0
  let done = 0
  try {
    for await (const { path, node } of walk(root, options)) {
      if (signal?.aborted) break
      const lang = detectLanguage(node.name)
      if (!lang) {
        skipped.push({ path, reason: 'unknown language' })
        continue
      }
      found++
      while (inFlight >= limit) await new Promise((r) => (wake = r))
      inFlight++
      const job = node.file()
        .then((file) => pool.run({ file, name: node.name, language: lang.name }))
        .then((r) => {
          if (r.skipped) skipped.push({ path, reason: r.skipped })
          else files.push({ path, language: lang.name, type: lang.type, color: lang.color, ...r.counts })
        }, (e) => skipped.push({ path, reason: `unreadable: ${e.message}` }))
        .finally(() => {
          inFlight--
          wake?.()
          onProgress({ found, done: ++done })
        })
      jobs.push(job)
      onProgress({ found, done })
    }
    await Promise.all(jobs)
  } finally {
    pool.terminate()
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, skipped }
}

/** Aggregates scanned files per language, largest code count first. */
export function summarize(files) {
  const map = new Map()
  for (const f of files) {
    let s = map.get(f.language)
    if (!s) {
      s = { language: f.language, type: f.type, color: f.color, files: 0, total: 0, code: 0, comment: 0, blank: 0, commentKnown: false }
      map.set(f.language, s)
    }
    s.files++
    s.total += f.total
    s.code += f.code
    s.blank += f.blank
    if (f.comment !== null) {
      s.comment += f.comment
      s.commentKnown = true
    }
  }
  return [...map.values()].sort((a, b) => b.code - a.code || a.language.localeCompare(b.language))
}
