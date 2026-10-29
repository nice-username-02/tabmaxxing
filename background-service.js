import {exportSavedNotes} from './src/note-export.js';

let exportTimer, exportQueue = Promise.resolve();
function runExports(force = false) {
  const task = exportQueue.then(async () => {
    try {
      await exportSavedNotes(chrome, undefined, {force});
      return {ok: true};
    } catch (error) {
      const text = 'Markdown export: ' + error.message;
      await chrome.storage.local.set({noteExportStatus: {ok: false, text}});
      return {ok: false, text};
    }
  });
  exportQueue = task.catch(() => {});
  return task;
}
function scheduleExports() { clearTimeout(exportTimer); exportTimer = setTimeout(() => runExports(), 1500); }
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key.startsWith('note:') || key === 'workspaceTabs' || key === 'noteExport')) scheduleExports();
});
chrome.runtime.onInstalled.addListener(scheduleExports);
chrome.runtime.onStartup.addListener(scheduleExports);

// Identify this extension on its own YouTube embeds. Chrome otherwise omits
// Referer for extension pages, causing YouTube error 153.
const prepare = chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [17001],
  addRules: [{
    id: 17001,
    priority: 1,
    condition: {initiatorDomains: [chrome.runtime.id], requestDomains: ['www.youtube-nocookie.com'], resourceTypes: ['sub_frame']},
    action: {type: 'modifyHeaders', requestHeaders: [{header: 'Referer', operation: 'set', value: `https://${chrome.runtime.id}.chromiumapp.org/`}]}
  }]
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'exportNotes' && sender.id === chrome.runtime.id) {
    clearTimeout(exportTimer);
    runExports(message.force === true).then(respond, error => respond({ok: false, text: error.message}));
    return true;
  }
  if (message.type !== 'prepareYouTube' || sender.id !== chrome.runtime.id) return;
  prepare.then(() => respond({ok: true}), () => respond({ok: false}));
  return true;
});
