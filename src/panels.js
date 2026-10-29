export async function initPanels() {
  if (document.body.classList.contains('popup')) { document.getElementById('reset-panels').addEventListener('click', () => chrome.storage.local.set({panelPositions: {}})); return; }
  let positions = (await new Promise(resolve => chrome.storage.local.get({panelPositions: {}}, resolve))).panelPositions || {};
  let dragging = null;
  const panels = [document.getElementById('workspace'), document.getElementById('agenda')];
  const clamp = (number, min, max) => Math.max(min, Math.min(number, max));
  function layout() {
    const enabled = document.body.classList.contains('modular-workspace');
    const w = innerWidth, h = innerHeight, narrow = w < 800;
    panels.forEach((panel, index) => {
      if (!enabled) { for (const key of ['left','top','width','height','zIndex']) panel.style[key] = ''; return; }
      const saved = positions[panel.id];
      const defaultWidth = narrow ? Math.max(250, w - 32) : index === 0 ? Math.min(780, w - 440) : 350;
      const defaultHeight = narrow ? Math.max(180, (h - 130) * (index === 0 ? .55 : .4)) : h - 130;
      const width = clamp(Number.isFinite(saved?.w) ? saved.w * w : defaultWidth, Math.min(260, w - 16), w - 16);
      const height = clamp(Number.isFinite(saved?.h) ? saved.h * h : defaultHeight, Math.min(200, h - 62), h - 62);
      const fallback = {x: narrow ? 16 : index === 0 ? 32 : w - width - 32, y: narrow && index === 1 ? 100 + Math.max(180, (h - 130) * .55) : 80};
      const x = clamp(saved && Number.isFinite(saved.x) ? saved.x * w : fallback.x, 8, Math.max(8, w - width - 8));
      const y = clamp(saved && Number.isFinite(saved.y) ? saved.y * h : fallback.y, 54, Math.max(54, h - height - 8));
      Object.assign(panel.style, {left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px'});
    });
  }
  function remember(panel) {
    const rect = panel.getBoundingClientRect();
    positions[panel.id] = {x: rect.x / innerWidth, y: rect.y / innerHeight, w: rect.width / innerWidth, h: rect.height / innerHeight};
    chrome.storage.local.set({panelPositions: positions});
  }
  for (const panel of panels) {
    const handle = panel.querySelector('.panel-grip');
    handle.addEventListener('pointerdown', event => {
      if (!document.body.classList.contains('modular-workspace') || event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragging = {panel, handle, id: event.pointerId, x: event.clientX - rect.x, y: event.clientY - rect.y};
      handle.setPointerCapture(event.pointerId); panel.style.zIndex = '4';
      document.body.classList.add('dragging-panel'); event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = clamp(event.clientX - dragging.x, 8, Math.max(8, innerWidth - rect.width - 8)) + 'px';
      panel.style.top = clamp(event.clientY - dragging.y, 54, Math.max(54, innerHeight - rect.height - 8)) + 'px';
    });
    function finish(event) {
      if (!dragging || dragging.id !== event.pointerId) return;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      dragging = null; panel.style.zIndex = ''; document.body.classList.remove('dragging-panel');
      remember(panel);
    }
    handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
    handle.addEventListener('keydown', event => {
      if (!event.key.startsWith('Arrow') || !document.body.classList.contains('modular-workspace')) return;
      event.preventDefault(); const rect = panel.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
      positions[panel.id] = {...positions[panel.id], x: (rect.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)) / innerWidth, y: (rect.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)) / innerHeight};
      layout(); chrome.storage.local.set({panelPositions: positions});
    });
    for (const direction of ['n','s','e','w','ne','nw','se','sw']) {
      const edge = document.createElement('div'); edge.className = 'panel-resize panel-resize-' + direction;
      edge.dataset.edge = direction; edge.tabIndex = 0; edge.setAttribute('role', 'button');
      edge.setAttribute('aria-label', 'Resize ' + (panel.id === 'workspace' ? 'notes' : 'calendar') + ' ' + direction);
      edge.title = 'Drag to resize'; panel.append(edge);
      function resize(start, dx, dy) {
        let left = start.x, top = start.y, right = start.right, bottom = start.bottom;
        const minWidth = Math.min(260, innerWidth - 16), minHeight = Math.min(200, innerHeight - 62);
        if (direction.includes('e')) right = clamp(start.right + dx, left + minWidth, innerWidth - 8);
        if (direction.includes('w')) left = clamp(start.x + dx, 8, right - minWidth);
        if (direction.includes('s')) bottom = clamp(start.bottom + dy, top + minHeight, innerHeight - 8);
        if (direction.includes('n')) top = clamp(start.y + dy, 54, bottom - minHeight);
        Object.assign(panel.style, {left: left + 'px', top: top + 'px', width: right - left + 'px', height: bottom - top + 'px'});
      }
      edge.addEventListener('pointerdown', event => {
        if (!document.body.classList.contains('modular-workspace') || event.button !== 0) return;
        dragging = {id: event.pointerId, edge, start: panel.getBoundingClientRect(), x: event.clientX, y: event.clientY};
        edge.setPointerCapture(event.pointerId); panel.style.zIndex = '4';
        document.body.classList.add('dragging-panel'); event.preventDefault(); event.stopPropagation();
      });
      edge.addEventListener('pointermove', event => {
        if (dragging?.edge !== edge || dragging.id !== event.pointerId) return;
        resize(dragging.start, event.clientX - dragging.x, event.clientY - dragging.y);
      });
      function endResize(event) {
        if (dragging?.edge !== edge || dragging.id !== event.pointerId) return;
        dragging = null; if (edge.hasPointerCapture(event.pointerId)) edge.releasePointerCapture(event.pointerId);
        panel.style.zIndex = ''; document.body.classList.remove('dragging-panel'); remember(panel);
      }
      edge.addEventListener('pointerup', endResize); edge.addEventListener('pointercancel', endResize);
      edge.addEventListener('keydown', event => {
        if (!event.key.startsWith('Arrow')) return;
        event.preventDefault(); const step = event.shiftKey ? 40 : 10;
        resize(panel.getBoundingClientRect(), event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0); remember(panel);
      });
    }
  }
  document.getElementById('reset-panels').addEventListener('click', () => {positions = {}; layout(); chrome.storage.local.set({panelPositions: {}});});
  document.addEventListener('workspace-layout-change', () => {if (!dragging) layout();});
  window.addEventListener('resize', layout);
  chrome.storage.onChanged.addListener((changes, area) => {if (area === 'local' && changes.panelPositions && !dragging) {positions = changes.panelPositions.newValue || {}; layout();}});
}
