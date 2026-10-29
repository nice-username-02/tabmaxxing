import {defaultExportSettings, cleanExportSettings, exportDirectory} from './note-export.js';

export async function initNoteExportSettings() {
  const element = id => document.getElementById(id);
  let settings = defaultExportSettings;
  let lastUpdated = null;
  let status = null;
  let updating = false;
  const render = () => {
    const chosen = settings.destination === 'custom';
    element('autoexport').checked = settings.enabled;
    element('autoexport').disabled = !chosen;
    element('export-location').textContent = chosen ? 'Selected folder: ' + settings.folderName : 'No folder selected';
    element('export-allow').hidden = !chosen;
    element('export-update').disabled = !chosen || updating;
    element('export-update').textContent = updating ? 'Updating…' : 'Update backup';
    element('export-status').textContent = 'Last updated: ' + (lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never');
    element('export-error').textContent = status?.ok === false ? status.text : '';
  };
  const showError = error => {
    if (error.name !== 'AbortError') { status = {ok: false, text: error.message}; render(); }
  };
  const notify = async (force = false) => {
    if (!chrome.runtime?.sendMessage) throw new Error('Backups are available in the installed extension.');
    const result = await chrome.runtime.sendMessage({type: 'exportNotes', force});
    if (!result?.ok) throw new Error(result?.text || 'Backup did not complete. Please try again.');
    const data = await new Promise(resolve => chrome.storage.local.get({noteExportLastUpdated: null, noteExportStatus: null}, resolve));
    lastUpdated = data.noteExportLastUpdated;
    status = data.noteExportStatus;
    render();
  };
  const save = async value => {
    settings = value;
    await chrome.storage.local.set({noteExport: settings});
    render();
  };
  const allowDirectory = async () => {
    const directory = await exportDirectory();
    if (!directory) throw new Error('Choose your backup folder again.');
    if (await directory.requestPermission({mode: 'readwrite'}) !== 'granted') throw new Error('Folder access was not granted.');
  };
  element('autoexport').addEventListener('change', () => save({...settings, enabled: element('autoexport').checked}).then(() => notify()).catch(showError));
  element('export-choose').addEventListener('click', async () => {
    try {
      const directory = await window.showDirectoryPicker({id: 'note-exports', mode: 'readwrite'});
      await exportDirectory(directory, true);
      lastUpdated = null;
      status = null;
      await chrome.storage.local.set({noteExportLastUpdated: null, noteExportStatus: null});
      await save({...settings, destination: 'custom', folderName: directory.name, token: crypto.randomUUID()});
    } catch (error) { showError(error); }
  });
  element('export-allow').addEventListener('click', async () => {
    try { await allowDirectory(); await notify(); } catch (error) { showError(error); }
  });
  element('export-update').addEventListener('click', async () => {
    updating = true;
    render();
    try { await allowDirectory(); await notify(true); }
    catch (error) { showError(error); }
    finally { updating = false; render(); }
  });
  const data = await new Promise(resolve => chrome.storage.local.get({noteExport: defaultExportSettings, noteExportStatus: null, noteExportLastUpdated: null}, resolve));
  settings = cleanExportSettings(data.noteExport);
  lastUpdated = data.noteExportLastUpdated;
  status = data.noteExportStatus;
  render();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.noteExport) settings = cleanExportSettings(changes.noteExport.newValue);
    if (changes.noteExportLastUpdated) lastUpdated = changes.noteExportLastUpdated.newValue;
    if (changes.noteExportStatus) status = changes.noteExportStatus.newValue;
    render();
  });
}
