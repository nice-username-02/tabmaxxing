// Read everything before saving so an unreadable file cannot leave a partial import.
export async function readNoteFiles(files) {
  const supported = Array.from(files).filter(file => /\.(md|markdown|txt)$/i.test(file.name));
  supported.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, {numeric: true}));
  const notes = [];
  for (const file of supported) {
    const text = await file.text();
    notes.push({tab: {id: crypto.randomUUID(), name: file.name.replace(/\.(md|markdown|txt)$/i, '') || 'Untitled', emoji: '📝'}, text});
  }
  return notes;
}

export function initNoteImportSettings(importFiles) {
  const button = document.getElementById('import-choose');
  const input = document.getElementById('import-files');
  const status = document.getElementById('import-status');
  button.addEventListener('click', () => { input.value = ''; input.click(); });
  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    button.disabled = true;
    status.textContent = 'Importing notes…';
    try {
      const count = await importFiles(input.files);
      status.textContent = count ? `Imported ${count} ${count === 1 ? 'note' : 'notes'} into new tabs.` : 'No Markdown or text files found in this folder.';
    } catch (error) {
      status.textContent = 'Could not import notes: ' + error.message;
    } finally {
      button.disabled = false;
      input.value = '';
    }
  });
}
