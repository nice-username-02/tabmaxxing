import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNoteFiles} from '../src/note-import.js';

const file = (name, text, webkitRelativePath = name) => ({name, webkitRelativePath, text: async () => text});

test('folder import includes nested text notes, skips other files and preserves content', async () => {
  const notes = await readNoteFiles([
    file('Z.MD', '# Unicode ☕\n\n- [ ] Task\n'),
    file('image.png', 'binary'),
    file('Empty.txt', '', 'folder/nested/Empty.txt'),
    file('Plan.markdown', '**Plan**', 'folder/Plan.markdown'),
  ]);
  assert.deepEqual(notes.map(n => [n.tab.name, n.text]), [
    ['Empty', ''], ['Plan', '**Plan**'], ['Z', '# Unicode ☕\n\n- [ ] Task\n'],
  ]);
  assert.equal(new Set(notes.map(n => n.tab.id)).size, 3);
});

test('duplicate filenames and repeated imports receive independent tab IDs', async () => {
  const files = [file('Notes.md', 'one', 'a/Notes.md'), file('Notes.md', 'two', 'b/Notes.md')];
  const notes = [...await readNoteFiles(files), ...await readNoteFiles(files)];
  assert.equal(new Set(notes.map(n => n.tab.id)).size, 4);
  assert.ok(notes.every(n => n.tab.name === 'Notes'));
  assert.deepEqual(notes.map(n => n.text), ['one', 'two', 'one', 'two']);
});

test('empty folders return no notes and read failures reject before any import is returned', async () => {
  assert.deepEqual(await readNoteFiles([]), []);
  await assert.rejects(readNoteFiles([
    file('a.md', 'readable'),
    {name: 'b.md', text: async () => { throw new Error('Unreadable file'); }},
  ]), /Unreadable file/);
});
