// Extract palette variables only. Layout and Obsidian-specific rules stay out.
import fs from 'node:fs';
const source = fs.readFileSync('reference/minimal.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
let css = '/* Palette variables adapted from kepano/obsidian-minimal. MIT; see vendor/Minimal-LICENSE. */\n';
for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selectors = rule[1].trim().split(',').map(s => s.trim()).filter(s =>
    s === 'body' || /^\.theme-(light|dark)(\.minimal-[a-z-]+-(light|dark))?$/.test(s));
  const variables = [...rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(m => /^--(base-|accent-|bg\d|tx\d|ui\d|ax\d|hl\d|sp\d|color-)/.test(m[1]))
    .map(m => `  ${m[1]}: ${m[2].trim()};`);
  if (selectors.length && variables.length) css += selectors.map(s => s === 'body' ? ':root' : ':root' + s).join(',\n') + ' {\n' + variables.join('\n') + '\n}\n';
}
css += `
:root.theme-light, :root.theme-dark {
  --bg: var(--bg1); --panel: var(--bg2); --fg: var(--tx1);
  --dim: var(--tx2); --faint: var(--tx3); --border: var(--ui1); --accent: var(--ax1);
}
:root.theme-light { color-scheme: light; --caret: #222; }
:root.theme-dark { color-scheme: dark; --caret: #fff; }
.theme-light .cm-editor .cm-content, .theme-dark .cm-editor .cm-content { caret-color: var(--caret) !important; }
.theme-light .cm-cursor, .theme-dark .cm-cursor { border-left-color: var(--caret) !important; }
.theme-light .cm-cursor { filter: none; }
#appearance { border: 0; padding: 0; margin-bottom: 24px; }
#appearance legend { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
#appearance label { display: block; margin: 12px 0 5px; font-size: 12px; color: var(--dim); }
#appearance select { width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 9px; font: inherit; }
#theme-preview { display: flex; gap: 6px; padding: 14px 0 2px; }
#theme-preview span { border: 1px solid var(--border); border-radius: 50%; width: 22px; height: 22px; }
#workspacesettings { max-height: 90vh; overflow-y: auto; }
`;
fs.writeFileSync('themes.css', css);
