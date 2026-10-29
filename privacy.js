// Hide workspace text for screen sharing; playback and audio are independent.
// The flag is shared across open tabs, the popup, and future new tabs.
const hideBtn = document.getElementById('hidebtn');
const padEl = document.getElementById('pad');

function applyVeil(v) {
  document.body.classList.toggle('veiled', v);
  hideBtn.title = v ? 'Show all text' : 'Hide all text';
  hideBtn.setAttribute('aria-label', hideBtn.title);
  hideBtn.setAttribute('aria-pressed', String(v));
  const content = padEl.querySelector('.cm-content');
  if (content) content.contentEditable = v ? 'false' : 'true';
  document.getElementById('workspacesettingsbtn').disabled = v;
  if (v) { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); document.activeElement?.blur(); }
}

chrome.storage.local.get({ veiled: false }, (r) => applyVeil(r.veiled));

hideBtn.addEventListener('click', () => {
  const v = !document.body.classList.contains('veiled');
  chrome.storage.local.set({ veiled: v });
  applyVeil(v);
  if (!v) padEl.querySelector('.cm-content')?.focus();
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.veiled) applyVeil(!!ch.veiled.newValue);
});
