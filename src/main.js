import { LANGUAGE_TYPES } from './languages.js'
import { scan, summarize } from './scan.js'
import { fromEntry, fromFileList, fromHandle } from './walk.js'

const $ = (id) => document.getElementById(id)
const fmt = new Intl.NumberFormat('en-US')
const FALLBACK_COLOR = '#8b949e'

const state = {
  rootName: '',
  files: [],
  skipped: [],
  types: new Set(['programming', 'markup']),
  sort: { key: 'code', dir: -1 },
  open: new Set(),
}
let controller = null

// ---- choosing a folder -------------------------------------------------

$('pick').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) return $('fallback').click()
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    run(fromHandle(handle))
  } catch (e) {
    if (e.name !== 'AbortError') alert(e.message)
  }
})

$('fallback').addEventListener('change', (e) => {
  if (e.target.files.length) run(fromFileList(e.target.files))
  e.target.value = ''
})

const drop = $('drop')
drop.addEventListener('dragover', (e) => {
  e.preventDefault()
  drop.classList.add('over')
})
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  drop.classList.remove('over')
  const entry = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).find((x) => x?.isDirectory)
  if (entry) run(fromEntry(entry))
  else alert('Drop a folder, not individual files.')
})

$('cancel').addEventListener('click', () => controller?.abort())

// ---- scanning ----------------------------------------------------------

async function run(root) {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  state.rootName = root.name || 'Selected folder'
  state.open.clear()
  $('progress').hidden = false
  $('results').hidden = true
  drop.classList.add('busy')
  let last = 0
  const onProgress = ({ found, done }) => {
    const now = performance.now()
    if (now - last < 80 && done !== found) return
    last = now
    $('progress-text').textContent = `Counted ${fmt.format(done)} of ${fmt.format(found)} files…`
    $('progress-bar').style.width = `${found ? (done / found) * 100 : 0}%`
  }
  try {
    const options = { useGitignore: $('opt-gitignore').checked, skipDefaults: $('opt-defaults').checked }
    const result = await scan(root, options, onProgress, signal)
    if (signal.aborted) return
    state.files = result.files
    state.skipped = result.skipped
    // Show data and prose too when that is all the folder has.
    const present = new Set(result.files.map((f) => f.type))
    if (![...state.types].some((t) => present.has(t))) state.types = present
    render()
  } catch (e) {
    alert(`Scan failed: ${e.message}`)
  } finally {
    // A newer scan owns the progress UI once it has replaced this one.
    if (controller.signal === signal) {
      $('progress').hidden = true
      drop.classList.remove('busy')
    }
  }
}

// ---- rendering ---------------------------------------------------------

function visibleFiles() {
  return state.files.filter((f) => state.types.has(f.type))
}

function render() {
  $('results').hidden = false
  $('root-name').textContent = state.rootName
  renderTypes()

  const files = visibleFiles()
  const rows = summarize(files)
  const totals = rows.reduce(
    (t, r) => ({ files: t.files + r.files, code: t.code + r.code, comment: t.comment + r.comment, blank: t.blank + r.blank, total: t.total + r.total }),
    { files: 0, code: 0, comment: 0, blank: 0, total: 0 },
  )

  $('stats').innerHTML = [
    ['Languages', rows.length],
    ['Files', totals.files],
    ['Code lines', totals.code],
    ['Comment lines', totals.comment],
    ['Blank lines', totals.blank],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${fmt.format(v)}</div></div>`).join('')

  $('share').innerHTML = rows
    .filter((r) => r.code > 0)
    .map((r) => `<span style="flex-grow:${r.code};background:${r.color ?? FALLBACK_COLOR}" title="${esc(r.language)}: ${pct(r.code, totals.code)}"></span>`)
    .join('')

  const { key, dir } = state.sort
  rows.sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir || b.code - a.code
  })

  document.querySelectorAll('#table th').forEach((th) => {
    const active = th.dataset.key === key && !th.classList.contains('share-col')
    th.classList.toggle('sorted', active)
    th.dataset.dir = active ? (dir > 0 ? 'asc' : 'desc') : ''
    th.setAttribute('aria-sort', active ? (dir > 0 ? 'ascending' : 'descending') : 'none')
  })

  const tbody = $('table').tBodies[0]
  tbody.innerHTML = ''
  for (const r of rows) {
    const tr = document.createElement('tr')
    tr.className = 'lang'
    tr.tabIndex = 0
    tr.setAttribute('aria-expanded', state.open.has(r.language))
    tr.innerHTML = `
      <td class="l"><span class="dot" style="background:${r.color ?? FALLBACK_COLOR}"></span>${esc(r.language)}</td>
      <td>${fmt.format(r.files)}</td>
      <td><strong>${fmt.format(r.code)}</strong></td>
      <td>${r.commentKnown ? fmt.format(r.comment) : '—'}</td>
      <td>${fmt.format(r.blank)}</td>
      <td>${fmt.format(r.total)}</td>
      <td class="share-col"><div class="share-cell"><div class="mini"><span style="width:${totals.code ? (r.code / totals.code) * 100 : 0}%;background:${r.color ?? FALLBACK_COLOR}"></span></div><span class="pct">${pct(r.code, totals.code)}</span></div></td>`
    const toggle = () => {
      state.open.has(r.language) ? state.open.delete(r.language) : state.open.add(r.language)
      render()
    }
    tr.addEventListener('click', toggle)
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })
    tbody.append(tr)
    if (state.open.has(r.language)) tbody.append(fileRows(files.filter((f) => f.language === r.language)))
  }
  if (rows.length === 0) tbody.innerHTML = '<tr><td colspan="7" class="empty">No files of the selected types.</td></tr>'

  $('table').tFoot.innerHTML = rows.length
    ? `<tr><td class="l">Total</td><td>${fmt.format(totals.files)}</td><td><strong>${fmt.format(totals.code)}</strong></td><td>${fmt.format(totals.comment)}</td><td>${fmt.format(totals.blank)}</td><td>${fmt.format(totals.total)}</td><td class="share-col"></td></tr>`
    : ''

  const s = state.skipped
  $('skipped-wrap').hidden = s.length === 0
  $('skipped-summary').textContent = `${fmt.format(s.length)} file${s.length === 1 ? '' : 's'} not counted`
  $('skipped').innerHTML = s.slice(0, 2000).map((x) => `<li><code>${esc(x.path)}</code> — ${esc(x.reason)}</li>`).join('') +
    (s.length > 2000 ? `<li>…and ${fmt.format(s.length - 2000)} more</li>` : '')
}

function fileRows(files) {
  const frag = document.createDocumentFragment()
  const sorted = [...files].sort((a, b) => b.code - a.code || a.path.localeCompare(b.path))
  const shown = sorted.slice(0, 500)
  for (const f of shown) {
    const tr = document.createElement('tr')
    tr.className = 'file'
    tr.innerHTML = `<td class="l" title="${esc(f.path)}">${esc(f.path)}</td><td></td><td>${fmt.format(f.code)}</td><td>${f.comment === null ? '—' : fmt.format(f.comment)}</td><td>${fmt.format(f.blank)}</td><td>${fmt.format(f.total)}</td><td class="share-col"></td>`
    frag.append(tr)
  }
  if (sorted.length > shown.length) {
    const tr = document.createElement('tr')
    tr.className = 'file'
    tr.innerHTML = `<td class="l" colspan="7">…and ${fmt.format(sorted.length - shown.length)} more files</td>`
    frag.append(tr)
  }
  return frag
}

function renderTypes() {
  const counts = Object.fromEntries(LANGUAGE_TYPES.map((t) => [t, 0]))
  for (const f of state.files) counts[f.type] = (counts[f.type] ?? 0) + 1
  $('types').innerHTML = LANGUAGE_TYPES.map((t) => `
    <label class="chip ${state.types.has(t) ? 'on' : ''}">
      <input type="checkbox" value="${t}" ${state.types.has(t) ? 'checked' : ''} />
      ${t[0].toUpperCase() + t.slice(1)} <span>${fmt.format(counts[t])}</span>
    </label>`).join('')
  $('types').querySelectorAll('input').forEach((input) =>
    input.addEventListener('change', () => {
      input.checked ? state.types.add(input.value) : state.types.delete(input.value)
      render()
    }))
}

document.querySelectorAll('#table th').forEach((th) =>
  th.addEventListener('click', () => {
    const key = th.dataset.key
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : key === 'language' ? 1 : -1 }
    render()
  }))

// ---- export ------------------------------------------------------------

function download(name, type, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const baseName = () => (state.rootName || 'loc').replace(/[^\w.-]+/g, '_')

$('export-csv').addEventListener('click', () => {
  const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)
  const lines = ['language,type,files,code,comment,blank,total']
  for (const r of summarize(visibleFiles())) {
    lines.push([r.language, r.type, r.files, r.code, r.commentKnown ? r.comment : '', r.blank, r.total].map(quote).join(','))
  }
  download(`${baseName()}-loc.csv`, 'text/csv', lines.join('\n') + '\n')
})

$('export-json').addEventListener('click', () => {
  const files = visibleFiles()
  const languages = summarize(files).map(({ commentKnown, ...r }) => ({ ...r, comment: commentKnown ? r.comment : null }))
  download(`${baseName()}-loc.json`, 'application/json', JSON.stringify({ root: state.rootName, languages, files }, null, 2))
})

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%'
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
