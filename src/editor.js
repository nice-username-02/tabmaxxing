import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree, syntaxHighlighting, defaultHighlightStyle, HighlightStyle, indentUnit } from '@codemirror/language';
import { initAppearance } from './appearance.js';
import { initBackground } from './background.js';
import { initPanels } from './panels.js';
import { initNoteExportSettings } from './note-export-settings.js';
import emojiData from '@emoji-mart/data';
import { LinkifyIt } from 'linkify-it';

await initAppearance();
await initPanels();
await initBackground();

const $ = id => document.getElementById(id);
const read = defaults => new Promise(resolve => chrome.storage.local.get(defaults, resolve));
const write = value => new Promise((resolve, reject) => chrome.storage.local.set(value, () => {
  const error = chrome.runtime?.lastError;
  if (error) { $('savestatus').textContent = 'Could not save — keep this tab open'; reject(error); }
  else resolve();
}));
let tabs = [], active, editor, timer, dirty = false, loading = false, saving = Promise.resolve();
const states = new Map(), previewMode = new Compartment();
let sourceMode = false;
let draggedTab;
const linkify = new LinkifyIt();
// Link styling belongs to validated anchors, not every bracket pair in the parser.
const noteHighlightStyle = HighlightStyle.define(defaultHighlightStyle.specs.map(rule =>
  rule.textDecoration === 'underline' ? {...rule, textDecoration: 'none'} : rule));
function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
async function reorder(id, target, after = false) {
  if (id === target) return;
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  tabs = tabs.filter(t => t.id !== id);
  const index = tabs.findIndex(t => t.id === target);
  tabs.splice(index + Number(after), 0, tab);
  await write({workspaceTabs: tabs}); renderTabs();
}

class Task extends WidgetType {
  constructor(from, checked) { super(); this.from = from; this.checked = checked; }
  eq(other) { return this.from === other.from && this.checked === other.checked; }
  toDOM(view) {
    const box = document.createElement('input');
    box.type = 'checkbox'; box.className = 'md-checkbox'; box.checked = this.checked; box.setAttribute('aria-label', 'Toggle task');
    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', event => {
      event.stopPropagation();
      if (/^\[[ xX]\]$/.test(view.state.doc.sliceString(this.from, this.from + 3))) view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: box.checked ? 'x' : ' ' } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}
class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const span = document.createElement('span'); span.className = 'md-bullet'; span.textContent = '•'; return span; }
  ignoreEvent() { return false; }
}
function decorations(view) {
  const ranges = [], state = view.state;
  const excluded = [], codeRanges = [], markdownLinks = [], listLines = new Map(), references = new Map(), validLinks = new Set();
  const labelKey = value => value.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  syntaxTree(state).iterate({enter(node) {
    if (node.name !== 'LinkReference') return;
    const label = node.node.getChild('LinkLabel'), url = node.node.getChild('URL');
    if (label && url) references.set(labelKey(state.doc.sliceString(label.from, label.to)), state.doc.sliceString(url.from, url.to));
  }});
  const activeLines = new Set(state.selection.ranges.flatMap(range => {
    const lines = [];
    for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) lines.push(n);
    return lines;
  }));
  const addMark = (from, to, className) => { if (to > from) ranges.push(Decoration.mark({class: className}).range(from, to)); };
  const addLink = (from, to, href) => {
    href = safeURL(href);
    if (href && to > from) ranges.push(Decoration.mark({tagName: 'a', class: 'md-link', attributes: {href, target: '_blank', rel: 'noopener noreferrer', title: 'Open in a new tab · Alt-click to edit'}}).range(from, to));
  };
  syntaxTree(state).iterate({ enter(node) {
    const line = state.doc.lineAt(node.from), current = activeLines.has(line.number);
    if (['InlineCode','FencedCode','CodeBlock','HTMLBlock','HTMLTag'].includes(node.name)) codeRanges.push([node.from,node.to]);
    if (['InlineCode', 'FencedCode', 'CodeBlock', 'Image', 'Link', 'Autolink', 'LinkReference', 'HTMLBlock', 'HTMLTag'].includes(node.name)) excluded.push([node.from, node.to]);
    if (node.name === 'Link' || node.name === 'Autolink') {
      const destination = node.node.getChild('URL');
      const marks = node.node.getChildren('LinkMark'), label = node.node.getChild('LinkLabel');
      const from = node.name === 'Autolink' ? destination?.from : marks[0]?.to;
      const to = node.name === 'Autolink' ? destination?.to : marks[1]?.from;
      const labelText = label && state.doc.sliceString(label.from, label.to);
      const reference = labelText && labelKey(labelText) ? labelText : state.doc.sliceString(from || node.from, to || node.to);
      const raw = destination ? state.doc.sliceString(destination.from, destination.to) : references.get(labelKey(reference));
      const href = raw && safeURL(raw.replace(/^<|>$/g, '').replace(/\\([()])/g, '$1'));
      if (href && from != null && to != null) { validLinks.add(node.from); markdownLinks.push({from, to, href}); }
      else addMark(node.from, node.to, 'md-not-link');
    }
    if (node.name === 'ListItem') {
      let depth = 0;
      for (let parent = node.node; parent; parent = parent.parent) if (parent.name === 'ListItem') depth++;
      const marker = node.node.getChild('ListMark');
      if (marker) {
        const first = state.doc.lineAt(marker.from).number, last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let n = first; n <= last; n++) {
          if ((listLines.get(n)?.depth || 0) < depth) listLines.set(n, {depth, marker: n === first ? marker : null, ordered: node.node.parent?.name === 'OrderedList'});
        }
      }
    }
    if (/^(ATXHeading|SetextHeading)/.test(node.name)) {
      const level = node.name.match(/\d/)?.[0] || '2';
      ranges.push(Decoration.line({class: 'md-h' + level}).range(line.from));
    }
    if (node.name === 'Blockquote') {
      for (let n = line.number; n <= state.doc.lineAt(node.to).number; n++)
        ranges.push(Decoration.line({class: 'md-quote'}).range(state.doc.line(n).from));
    }
    if (node.name === 'StrongEmphasis') addMark(node.from, node.to, 'md-strong');
    if (node.name === 'Emphasis') addMark(node.from, node.to, 'md-em');
    if (node.name === 'Strikethrough') addMark(node.from, node.to, 'md-strike');
    if (node.name === 'InlineCode') addMark(node.from, node.to, 'md-code');
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      for (let n = line.number; n <= state.doc.lineAt(node.to).number; n++)
        ranges.push(Decoration.line({class: 'md-codeblock'}).range(state.doc.line(n).from));
    }
    if (current) return;
    // Brackets are syntax only when their enclosing link resolves to a URL.
    let linkParent = node.node.parent;
    while (linkParent && linkParent.name !== 'Link' && linkParent.name !== 'Autolink') linkParent = linkParent.parent;
    if (linkParent && !validLinks.has(linkParent.from)) return;
    if (['HeaderMark', 'EmphasisMark', 'CodeMark', 'CodeInfo', 'QuoteMark', 'StrikethroughMark', 'LinkMark'].includes(node.name) ||
        (node.name === 'URL' && node.node.parent?.name === 'Link'))
      ranges.push(Decoration.replace({}).range(node.from, node.to));
    if (node.name === 'LinkLabel' && linkParent && validLinks.has(linkParent.from)) ranges.push(Decoration.replace({}).range(node.from, node.to));
  }});
  for (const link of markdownLinks) addLink(link.from, link.to, link.href);
  for (const match of linkify.match(state.doc.toString()) || []) {
    if (!excluded.some(([from, to]) => match.index < to && match.lastIndex > from)) addLink(match.index, match.lastIndex, match.url);
  }
  for (const [number, {depth, marker, ordered}] of listLines) {
    const line = state.doc.line(number), leading = line.text.match(/^\s*/)[0].length;
    const hanging = ordered ? '2em' : '1.4em';
    ranges.push(Decoration.line({class: 'md-list-line', attributes: {style: `padding-left:calc(${(depth - 1) * 2.5}em + ${hanging} + 4px);text-indent:${marker ? '-' + hanging : '0'}`}}).range(line.from));
    if (leading) ranges.push(Decoration.replace({}).range(line.from, line.from + leading));
    if (marker) {
      const after = state.doc.sliceString(marker.to, line.to).match(/^\s*/)[0].length;
      if (!ordered) ranges.push(Decoration.replace({widget: new Bullet()}).range(marker.from, marker.to + after));
      else { addMark(marker.from, marker.to, 'md-list-number'); if (after) ranges.push(Decoration.replace({}).range(marker.to, marker.to + after)); }
    }
  }
  for (const match of state.doc.toString().matchAll(/\[[ xX]\]/g)) {
    const from = match.index;
    if (codeRanges.some(([a,b]) => from >= a && from < b) || markdownLinks.some(link => from >= link.from && from < link.to)) continue;
    ranges.push(Decoration.replace({widget: new Task(from, /x/i.test(match[0]))}).range(from, from + 3));
  }
  return Decoration.set(ranges, true);
}
const livePreview = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = decorations(view); }
  update(update) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state))
      this.decorations = decorations(update.view);
  }
}, {decorations: value => value.decorations});
function newState(doc) {
  return EditorState.create({doc, extensions: [
    history(), indentUnit.of('    '), EditorState.tabSize.of(4), keymap.of([...markdownKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
    markdown({extensions: GFM}), syntaxHighlighting(noteHighlightStyle), EditorView.lineWrapping,
    placeholder('Start writing…\n\n# Heading\n**bold**, *italic*, and - [ ] tasks'),
    previewMode.of(sourceMode ? [] : livePreview),
    EditorView.contentAttributes.of({'aria-label': 'Markdown notes', spellcheck: 'true'}),
    EditorView.domEventHandlers({
      mousedown(event) {
        if (!event.altKey && event.button === 0 && event.target.closest('a.md-link')) { event.preventDefault(); return true; }
      },
      click(event) {
        const link = event.target.closest('a.md-link');
        if (!link || event.altKey || event.button !== 0) return false;
        const href = safeURL(link.getAttribute('href'));
        if (!href) return false;
        event.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); return true;
      }
    }),
    EditorView.updateListener.of(update => {
      if (!update.docChanged || loading) return;
      dirty = true; $('savestatus').textContent = 'Saving…';
      clearTimeout(timer); timer = setTimeout(flush, 250);
    })
  ]});
}
function flush() {
  clearTimeout(timer);
  if (!editor || !dirty) return saving;
  dirty = false;
  const id = active, text = editor.state.doc.toString();
  saving = saving.catch(() => {}).then(() => write({['note:' + id]: text})).then(() => {
    if (!dirty) $('savestatus').textContent = 'Saved locally';
  }).catch(() => { dirty = true; });
  return saving;
}
async function selectTab(id) {
  if (id === active && editor) return;
  await flush();
  if (editor) states.set(active, editor.state);
  active = id;
  sessionStorage.setItem('workspace-active-tab', id);
  const stored = await read({['note:' + id]: ''});
  loading = true;
  let state = states.get(id);
  if (state && state.doc.toString() !== stored['note:' + id]) state = null;
  state = state || newState(stored['note:' + id]);
  if (!editor) editor = new EditorView({state, parent: $('pad')});
  else editor.setState(state);
  editor.dispatch({effects: previewMode.reconfigure(sourceMode ? [] : livePreview)});
  editor.contentDOM.contentEditable = document.body.classList.contains('veiled') ? 'false' : 'true';
  loading = false;
  renderTabs(); editor.focus();
}
function renderTabs() {
  $('notetabs').replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = 'note-tab'; item.draggable = true; item.dataset.id = tab.id;
    const button = document.createElement('button');
    button.type = 'button'; button.role = 'tab'; button.dataset.id = tab.id;
    button.setAttribute('aria-selected', String(tab.id === active));
    button.textContent = tab.emoji + ' ' + tab.name;
    button.title = 'Drag to reorder · Alt + arrow keys to move';
    item.addEventListener('dragstart', event => {
      draggedTab = tab.id; event.dataTransfer.setData('text/plain', tab.id);
      event.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => { draggedTab = null; document.querySelectorAll('.drop-target,.dragging').forEach(e => e.classList.remove('drop-target', 'dragging')); });
    item.addEventListener('dragover', event => { if (!draggedTab) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; item.classList.add('drop-target'); });
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
    item.addEventListener('drop', event => {
      event.preventDefault(); item.classList.remove('drop-target');
      const bounds = item.getBoundingClientRect();
      if (draggedTab) reorder(draggedTab, tab.id, event.clientX > bounds.x + bounds.width / 2);
    });
    button.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.findIndex(t => t.id === tab.id), step = event.key === 'ArrowLeft' ? -1 : 1;
      if (tabs[index + step]) reorder(tab.id, tabs[index + step].id, step > 0).then(() => $('notetabs').querySelector('[data-id="' + tab.id + '"] [role=tab]')?.focus());
    });
    button.addEventListener('click', () => selectTab(tab.id));
    button.addEventListener('dblclick', () => openSettings(tab.id));
    item.append(button);
    if (tab.id === active) {
      item.classList.add('selected');
      const pencil = document.createElement('button');
      pencil.className = 'tab-pencil'; pencil.textContent = '✎'; pencil.setAttribute('aria-label', 'Edit selected tab');
      const glyph = document.createElement('span'); glyph.textContent = pencil.textContent; pencil.replaceChildren(glyph);
      pencil.addEventListener('click', () => openSettings(tab.id)); item.append(pencil);
    }
    $('notetabs').append(item);
  }
}
function openSettings(id = active) {
  const tab = tabs.find(t => t.id === id);
  $('tabsettings').dataset.id = id;
  $('tabname').value = tab.name; $('tabemoji').value = tab.emoji;
  $('tabsettings').showModal(); $('tabname').focus();
}
$('addtab').addEventListener('click', async () => {
  await flush();
  const tab = {id: crypto.randomUUID(), name: 'Untitled', emoji: '📝'};
  tabs.push(tab);
  await write({workspaceTabs: tabs, ['note:' + tab.id]: ''});
  await selectTab(tab.id); openSettings(tab.id);
});
$('workspacesettingsbtn').addEventListener('click', () => $('workspacesettings').showModal());
$('closeworkspacesettings').addEventListener('click', () => $('workspacesettings').close());
for (const dialog of document.querySelectorAll('dialog')) {
  let startedOutside = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (startedOutside && outside(event)) dialog.close();
    startedOutside = false;
  });
  dialog.addEventListener('close', () => { startedOutside = false; });
  dialog.addEventListener('pointercancel', () => { startedOutside = false; });
}
$('tabform').addEventListener('submit', async event => {
  event.preventDefault();
  const tab = tabs.find(t => t.id === $('tabsettings').dataset.id);
  tab.name = $('tabname').value.trim() || 'Untitled';
  tab.emoji = $('tabemoji').value.trim() || '📝';
  await write({workspaceTabs: tabs}); renderTabs(); $('tabsettings').close();
});
$('closetabsettings').addEventListener('click', () => $('tabsettings').close());
$('deletetab').addEventListener('click', async () => {
  const id = $('tabsettings').dataset.id, tab = tabs.find(t => t.id === id);
  if (!tab || !confirm(`Are you sure you want to delete "${tab.name}" and its notes? This cannot be undone.`)) return;
  await flush();
  const remaining = tabs.filter(t => t.id !== id);
  const changes = {['note:' + id]: ''};
  if (id === 'original') changes.notes = '';
  if (!remaining.length) { const replacement = {id: crypto.randomUUID(), name: 'Notes', emoji: '📝'}; remaining.push(replacement); changes['note:' + replacement.id] = ''; }
  changes.workspaceTabs = remaining;
  await write(changes); states.delete(id); tabs = remaining;
  $('tabsettings').close();
  if (active === id) { dirty = false; await selectTab(tabs[0].id); }
  renderTabs();
});
const categoryLabels = {people: 'Smileys & people', nature: 'Animals & nature', foods: 'Food & drink', activity: 'Activities', places: 'Travel & places', objects: 'Objects', symbols: 'Symbols', flags: 'Flags'};
for (const category of emojiData.categories) {
  const option = document.createElement('option'); option.value = category.id; option.textContent = categoryLabels[category.id] || category.id; $('emojicategory').append(option);
}
function renderEmoji() {
  const query = $('emojisearch').value.toLowerCase().trim(), tone = Number($('emojitone').value);
  $('emojikeyboard').replaceChildren();
  for (const category of emojiData.categories) {
    if (!query && $('emojicategory').value !== 'all' && $('emojicategory').value !== category.id) continue;
    const section = document.createElement('section'), title = document.createElement('h3'), grid = document.createElement('div');
    title.textContent = categoryLabels[category.id] || category.id; grid.className = 'emoji-grid';
    for (const id of category.emojis) {
      const emoji = emojiData.emojis[id];
      if (!emoji || (query && ![emoji.name, id, ...(emoji.keywords || []), categoryLabels[category.id]].join(' ').toLowerCase().includes(query))) continue;
      const native = (emoji.skins[tone] || emoji.skins[0]).native;
      const key = document.createElement('button'); key.type = 'button'; key.textContent = native; key.title = emoji.name;
      key.setAttribute('aria-label', 'Choose ' + native);
      key.addEventListener('click', () => { $('tabemoji').value = native; $('emojikeyboard').querySelectorAll('[aria-pressed]').forEach(e => e.removeAttribute('aria-pressed')); key.setAttribute('aria-pressed', 'true'); });
      grid.append(key);
    }
    if (grid.childNodes.length) { section.append(title, grid); $('emojikeyboard').append(section); }
  }
  if (!$('emojikeyboard').childNodes.length) $('emojikeyboard').textContent = 'No emoji found';
}
for (const id of ['emojisearch', 'emojicategory', 'emojitone']) $(id).addEventListener(id === 'emojisearch' ? 'input' : 'change', renderEmoji);
renderEmoji();
function applyEditorMode(mode) {
  sourceMode = mode === 'source';
  $('editor-mode').value = sourceMode ? 'source' : 'live';
  if (editor) editor.dispatch({effects: previewMode.reconfigure(sourceMode ? [] : livePreview)});
}
$('editor-mode').addEventListener('change', () => {
  applyEditorMode($('editor-mode').value);
  write({editorMode: sourceMode ? 'source' : 'live'});
});
await initNoteExportSettings();
window.addEventListener('blur', flush);
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', flush);
const initial = await read({workspaceTabs: null, notes: '', editorMode: 'live'});
applyEditorMode(initial.editorMode);
tabs = initial.workspaceTabs;
if (!tabs?.length) {
  tabs = [{id: 'original', name: 'Notes', emoji: '📝'}];
  await write({workspaceTabs: tabs, 'note:original': initial.notes});
}
await selectTab(tabs.some(t => t.id === sessionStorage.getItem('workspace-active-tab')) ? sessionStorage.getItem('workspace-active-tab') : tabs[0].id);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.editorMode) applyEditorMode(changes.editorMode.newValue);
  if (changes.workspaceTabs) {
    tabs = changes.workspaceTabs.newValue;
    if (!tabs.some(t => t.id === active)) { clearTimeout(timer); dirty = false; states.delete(active); selectTab(tabs[0].id); }
    else renderTabs();
  }
  const change = changes['note:' + active];
  if (change && editor && !dirty && change.newValue !== editor.state.doc.toString()) {
    const selection = Math.min(editor.state.selection.main.head, change.newValue.length);
    loading = true;
    editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: change.newValue}, selection: {anchor: selection}});
    loading = false;
  }
});
