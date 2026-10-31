import { countLines, isBinary } from './count.js'

const MAX_BYTES = 8 * 1024 * 1024

self.onmessage = async ({ data: { id, file, name, language } }) => {
  try {
    if (file.size > MAX_BYTES) return self.postMessage({ id, skipped: 'too large' })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (isBinary(bytes)) return self.postMessage({ id, skipped: 'binary' })
    const text = new TextDecoder().decode(bytes)
    self.postMessage({ id, counts: countLines(text, name, language) })
  } catch (e) {
    self.postMessage({ id, skipped: `unreadable: ${e.message}` })
  }
}
