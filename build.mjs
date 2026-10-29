import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
await build({entryPoints: ['src/editor.js'], bundle: true, format: 'esm', outfile: 'editor.js', minify: true, legalComments: 'eof'});
fs.mkdirSync('vendor/editor-licenses', {recursive: true});
for (const directory of fs.readdirSync('node_modules/.pnpm')) {
  if (!/^(@codemirror|@lezer|@emoji-mart|linkify-it@|uc.micro@|codemirror@|style-mod@|w3c-keyname@|crelt@)/.test(directory)) continue;
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/^licen[cs]e/i.test(entry.name)) fs.copyFileSync(file, path.join('vendor/editor-licenses', directory.replace(/[^a-zA-Z0-9._-]/g, '_') + '-' + entry.name));
    }
  }
  walk(path.join('node_modules/.pnpm', directory, 'node_modules'));
}
