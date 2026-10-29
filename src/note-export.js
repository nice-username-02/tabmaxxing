export const defaultExportSettings = {enabled: false, destination: null, folderName: '', token: ''};

export function cleanExportSettings(value = {}) {
  return value.destination === 'custom' ? {...defaultExportSettings, ...value} : {...defaultExportSettings};
}

export function noteFilename(tab) {
  let name = String(tab.name || 'Notes').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'Notes';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  const id = String(tab.id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  return `${name}--${id}.md`;
}

export async function exportDirectory(handle, save = false) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('workspace-note-export', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', save ? 'readwrite' : 'readonly');
      const request = save ? tx.objectStore('settings').put(handle, 'directory') : tx.objectStore('settings').get('directory');
      tx.oncomplete = () => resolve(save ? handle : request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Could not remember the export folder.'));
    });
  } finally { db.close(); }
}

export async function writeNoteFile(directory, filename, text) {
  if (!directory || await directory.queryPermission({mode: 'readwrite'}) !== 'granted') {
    throw new Error('Folder access needed. Open Settings and click Allow folder access.');
  }
  const file = await directory.getFileHandle(filename, {create: true});
  const writable = await file.createWritable();
  try { await writable.write(text); await writable.close(); }
  catch (error) { await writable.abort().catch(() => {}); throw error; }
}

export async function exportSavedNotes(api, getDirectory = exportDirectory, {force = false} = {}) {
  const data = await api.storage.local.get(null);
  const settings = cleanExportSettings(data.noteExport);
  if ((!settings.enabled && !force) || settings.destination !== 'custom') return;
  const receipts = {...data.noteExportReceipts};
  const directory = await getDirectory();
  let wrote = false;
  for (const tab of data.workspaceTabs || []) {
    const text = data['note:' + tab.id];
    if (typeof text !== 'string') continue;
    const filename = noteFilename(tab);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(settings.token + '\n' + filename + '\n' + text));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    // Older backups have fingerprints but no recorded completion time. Write
    // them once so the new timestamp describes a confirmed successful backup.
    if (!force && data.noteExportLastUpdated && receipts[tab.id] === fingerprint) continue;
    await writeNoteFile(directory, filename, text);
    wrote = true;
    receipts[tab.id] = fingerprint;
    await api.storage.local.set({noteExportReceipts: receipts});
  }
  await api.storage.local.set({noteExportStatus: {ok: true}, ...(wrote ? {noteExportLastUpdated: Date.now()} : {})});
}
