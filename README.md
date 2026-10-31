# LOC Viewer

A web app that shows lines of code per programming language for a directory.
Everything runs in the browser: pick or drop a folder and the files are read
locally, never uploaded.

- Language detection from [GitHub Linguist](https://github.com/github-linguist/linguist)
  data (`linguist-languages`), with overrides for ambiguous extensions such as `.h`.
- Code, comment and blank lines via [`sloc`](https://github.com/flosse/sloc). For
  languages it does not know, every non-blank line counts as code.
- Honours `.gitignore` files at every level (`ignore`) and skips `node_modules`,
  build output and VCS folders; both can be turned off.
- Binary files and files over 8 MB are skipped and listed.
- Filter by language type, sort columns, expand a language to see its files,
  export CSV or JSON.

Choosing a folder uses `showDirectoryPicker` in Chromium browsers and falls back
to `<input webkitdirectory>` elsewhere. Drag and drop works everywhere.

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build   # static site in dist/
```

Pushing to `main` deploys `dist/` to GitHub Pages.
