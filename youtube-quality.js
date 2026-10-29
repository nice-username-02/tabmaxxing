// The IFrame API no longer changes resolution. Use the player's own quality menu.
// Stay inert in ordinary YouTube embeds; only our extension parent can activate this.
(() => {
  const owner = 'chrome-extension://' + chrome.runtime.id;
  const completed = new Map(), active = new Set();
  let queue = Promise.resolve();
  const visible = element => element.getClientRects().length && !element.closest('[hidden], [inert], [aria-hidden="true"]');
  const labels = () => [...document.querySelectorAll('.ytp-menuitem-label, .ytListItemViewModelTitle')].filter(visible);
  const valueOf = text => /^Auto\b/i.test(text) ? 'auto' : text.match(/^(\d{3,4}p(?:\d{2,3})?)/)?.[1];
  function options() {
    return [...document.querySelectorAll('.ytp-quality-menu .ytp-menuitem, [role="menu"] [role="menuitem"]')]
      .filter(visible).map(element => {
        const label = element.querySelector('.ytp-menuitem-label, .ytListItemViewModelTitle')?.textContent.trim() || element.textContent.trim();
        return {element, value: valueOf(label), label};
      }).filter(option => option.value);
  }
  function waitFor(read) {
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(check);
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('YouTube quality menu unavailable.')); }, 6000);
      function check() {
        const result = read();
        if (result) { clearTimeout(timeout); observer.disconnect(); resolve(result); }
      }
      observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true}); check();
    });
  }
  function closeMenu() {
    document.querySelector('bottom-sheet-container:not([hidden]) .close-button, bottom-sheet-container:not([hidden]) .ytWebScrimHiddenButton')?.click();
    const desktop = document.querySelector('.ytp-settings-button');
    if (desktop?.getAttribute('aria-expanded') === 'true') desktop.click();
  }
  async function quality(action, value) {
    let style = document.getElementById('workspace-quality-style');
    if (!style) {
      style = document.createElement('style'); style.id = 'workspace-quality-style';
      style.textContent = `
        html[data-workspace-background] #movie_player > :not(.html5-video-container),
        html[data-workspace-background] #player-controls,
        html[data-workspace-background] bottom-sheet-container {opacity:0!important;pointer-events:none!important}
        html[data-workspace-quality-menu] .ytp-settings-menu,
        html[data-workspace-quality-menu] bottom-sheet-container {visibility:hidden!important}
      `;
      document.documentElement.append(style);
    }
    document.documentElement.setAttribute('data-workspace-quality-menu', '');
    try {
      const settings = await waitFor(() => document.querySelector('.ytp-settings-button, .player-settings-icon'));
      closeMenu(); settings.click();
      (await waitFor(() => labels().find(element => element.textContent.trim() === 'Quality'))).click();
      const choices = await waitFor(() => { const found = options(); return found.some(option => option.value === 'auto') && found; });
      const selected = choices.find(option => option.element.getAttribute('aria-checked') === 'true' || option.element.closest('yt-list-item-view-model')?.querySelector('.ytListItemViewModelLeading c3-icon'))?.value || 'auto';
      if (action === 'select') {
        const choice = choices.find(option => option.value === value);
        if (!choice) throw new Error('That resolution is not available for this video.');
        choice.element.click();
      }
      return {options: choices.map(({value}) => ({value, label: value === 'auto' ? 'Auto' : value})), selected: action === 'select' ? value : selected};
    } finally { closeMenu(); document.documentElement.removeAttribute('data-workspace-quality-menu'); }
  }
  addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || event.origin !== owner || data?.type !== 'workspace-quality-request' ||
        !Number.isSafeInteger(data.id) || !['list', 'select'].includes(data.action) ||
        (data.action === 'select' && !/^(auto|\d{3,4}p(?:\d{2,3})?)$/.test(data.value))) return;
    const reply = result => parent.postMessage({type: 'workspace-quality-response', id: data.id, ...result}, owner);
    if (completed.has(data.id)) { reply(completed.get(data.id)); return; }
    if (active.has(data.id)) return;
    document.documentElement.setAttribute('data-workspace-background', '');
    active.add(data.id);
    queue = queue.then(async () => {
      let result;
      try { result = await quality(data.action, data.value); } catch (error) { result = {error: error.message}; }
      active.delete(data.id); completed.set(data.id, result);
      if (completed.size > 20) completed.delete(completed.keys().next().value);
      reply(result);
    });
  });
})();
