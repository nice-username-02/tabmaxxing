import {scenes, youtubeID, cleanBackground, backgroundDefaults, embedURL} from './background-core.js';

export async function initBackground() {
  const $ = id => document.getElementById(id);
  let preferences = {...backgroundDefaults}, frame, ready = false, handshake, timer, loadToken = 0, loadingVideo = '';
  let currentTime = 0, duration = 0, playerState = -1, hasPosition = false, seeking = false, pendingSeek = null, autoplayBlocked = false;
  const popup = document.body.classList.contains('popup');
  const mediaOrigin = 'https://www.youtube-nocookie.com';
  const positionKey = video => 'backgroundPosition:' + video;
  let qualityID = 0;
  const qualityRequests = new Map();
  function requestQuality(action, value) {
    const target = frame;
    return new Promise((resolve, reject) => {
      const id = ++qualityID;
      const send = () => target?.contentWindow?.postMessage({type: 'workspace-quality-request', id, action, value}, mediaOrigin);
      const repeat = setInterval(send, 1000);
      const timeout = setTimeout(() => finish({error: 'Quality controls unavailable. Try reloading this tab.'}), 10000);
      function finish(result) {
        clearTimeout(timeout); clearInterval(repeat); qualityRequests.delete(id);
        result.error ? reject(new Error(result.error)) : resolve(result);
      }
      qualityRequests.set(id, finish); send();
    });
  }
  async function loadQuality() {
    const target = frame;
    try {
      const result = await requestQuality('list');
      if (frame !== target) return;
      $('background-quality').replaceChildren();
      for (const choice of result.options || []) {
        if (!/^(auto|\d{3,4}p(?:\d{2,3})?)$/.test(choice.value)) continue;
        const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label;
        $('background-quality').append(option);
      }
      $('background-quality').value = result.selected;
      $('background-quality').disabled = !$('background-quality').options.length;
      $('background-quality').title = 'Video quality';
    } catch (error) {
      if (frame !== target) return;
      $('background-quality').title = error.message;
      $('background-quality-status').textContent = error.message;
    } finally { if (frame === target) syncPlayback(); }
  }
  function clock(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    return value >= 3600 ? Math.floor(value / 3600) + ':' + String(Math.floor(value / 60) % 60).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0') : Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
  }
  function renderControls() {
    const paused = preferences.paused || autoplayBlocked;
    $('background-play').dataset.paused = String(paused);
    $('background-play').setAttribute('aria-label', paused ? 'Play background' : 'Pause background');
    $('background-play').title = paused ? 'Play background' : 'Pause background';
    $('background-play').disabled = !ready;
    const muted = preferences.muted || preferences.volume === 0;
    $('background-mute').setAttribute('aria-label', muted ? 'Unmute background' : 'Mute background');
    $('background-mute').setAttribute('aria-pressed', String(muted));
    $('background-mute').title = muted ? 'Unmute background' : 'Mute background';
    $('background-volume').value = preferences.volume;
    $('background-volume').setAttribute('aria-valuetext', preferences.volume + '%' + (muted ? ' · muted' : ''));
    $('background-seek').disabled = !ready || duration <= 0;
    $('background-seek').max = duration || 1;
    if (!seeking) $('background-seek').value = currentTime;
    const shownTime = seeking ? +$('background-seek').value : currentTime;
    $('background-time').textContent = clock(shownTime) + ' / ' + (duration > 0 ? clock(duration) : '–:––');
    $('background-seek').setAttribute('aria-valuetext', clock(shownTime) + ' of ' + clock(duration));
  }
  function rememberPosition(leaving = false) {
    // Audible background tabs keep saving; inactive, muted tabs must not overwrite them.
    if (!frame || !hasPosition || pendingSeek || seeking || (document.hidden && !playing() && !leaving)) return;
    chrome.storage.local.set({[positionKey(preferences.video)]: {time: currentTime, duration, updatedAt: Date.now()}});
  }
  function status(text) { $('background-status').textContent = text; }
  function command(func, args = []) { if (frame) frame.contentWindow?.postMessage(JSON.stringify({event: 'command', func, args}), mediaOrigin); }
  function playing() { return !preferences.paused && (!document.hidden || !preferences.muted); }
  function syncPlayback() {
    command('setVolume', [preferences.volume]);
    command(preferences.muted ? 'mute' : 'unMute');
    command(playing() ? 'playVideo' : 'pauseVideo');
  }
  function removePlayer() {
    for (const finish of [...qualityRequests.values()]) finish({error: 'Video changed.'});
    $('background-quality').replaceChildren(new Option('Quality', ''));
    $('background-quality').disabled = true;
    $('background-quality-status').textContent = '';
    ++loadToken; loadingVideo = '';
    clearInterval(handshake); clearTimeout(timer); ready = false;
    frame?.remove(); frame = null;
    currentTime = 0; duration = 0; playerState = -1; hasPosition = false; pendingSeek = null; seeking = false; autoplayBlocked = false;
  }
  async function createPlayer() {
    removePlayer();
    const video = preferences.video, token = loadToken;
    loadingVideo = video;
    status('Loading background…'); renderControls();
    const key = positionKey(video);
    const stored = await new Promise(resolve => chrome.storage.local.get({[key]: null}, resolve));
    if (token !== loadToken) return;
    loadingVideo = '';
    const saved = stored[key];
    const resume = saved && Number.isFinite(saved.time) && saved.time > 0 ? saved.time : 0;
    currentTime = resume;
    if (resume) pendingSeek = {time: resume, until: Date.now() + 15000};
    if (Number.isFinite(saved?.duration) && saved.duration > 0) duration = saved.duration;
    frame = document.createElement('iframe'); frame.id = 'background-player'; frame.title = preferences.name || 'YouTube background';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.tabIndex = -1;
    frame.src = embedURL({...preferences, paused: !playing()}, location.origin, resume);
    frame.addEventListener('load', () => {
      const listen = () => frame?.contentWindow?.postMessage(JSON.stringify({event: 'listening', id: 'background-player', channel: 'workspace'}), mediaOrigin);
      listen(); handshake = setInterval(listen, 1000);
    });
    $('background-video').append(frame); renderControls();
    timer = setTimeout(() => { if (!ready) status('Video has not started. Try the play button, a different scene, or open it on YouTube.'); }, 20000);
  }
  function apply(value) {
    const oldVideo = preferences.video;
    const next = cleanBackground(value);
    if (oldVideo !== next.video || preferences.mode !== next.mode) {
      rememberPosition();
      removePlayer();
      next.muted = true;
    }
    preferences = next;
    const enabled = preferences.mode === 'video';
    document.body.classList.toggle('has-video-background', enabled && !popup);
    document.body.classList.toggle('modular-workspace', enabled && !popup);
    document.documentElement.style.setProperty('--panel-opacity', preferences.panelOpacity + '%');
    document.dispatchEvent(new Event('workspace-layout-change'));
    $('background-solid').checked = !enabled; $('background-custom').checked = enabled;
    $('background-video-options').hidden = !enabled;
    document.documentElement.style.setProperty('--background-blur', preferences.blur + 'px');
    $('background-name').textContent = enabled ? preferences.name || 'Custom YouTube video' : 'Solid colour';
    $('background-controls').hidden = !enabled || !preferences.video || popup;
    $('background-controls').title = preferences.name || 'Background player';
    renderControls();
    if (ready && preferences.paused) status('Paused');
    $('panel-opacity').value = preferences.panelOpacity; $('panel-opacity-value').value = preferences.panelOpacity + '%';
    $('background-blur').value = preferences.blur; $('background-blur-value').value = preferences.blur + 'px';
    $('background-watch').hidden = !preferences.video;
    $('background-watch').href = 'https://www.youtube.com/watch?v=' + preferences.video;
    $('background-credit').textContent = preferences.creator ? 'Video by ' + preferences.creator : '';
    for (const button of $('background-gallery').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.video === preferences.video));
    if (!enabled || !preferences.video || popup) { removePlayer(); status(popup && enabled ? 'Background saved for your new tabs.' : ''); return; }
    if (!frame && loadingVideo !== preferences.video) createPlayer();
    syncPlayback();
  }
  async function save(value) {
    apply(value);
    // Mute is local to this page and requires an explicit click here. Only the
    // volume and other shared preferences are carried into another page.
    await new Promise(resolve => chrome.storage.local.set({background: {...preferences, muted: true}}, () => {
      if (chrome.runtime?.lastError) status('Could not save background settings.');
      resolve();
    }));
  }
  function choose(scene) {
    const preference = {...preferences, mode: 'video', video: scene.video, name: scene.name, creator: scene.creator || '', paused: false};
    save(preference);
  }
  const groups = ['All', ...new Set(scenes.map(scene => scene.category))];
  for (const group of groups) { const option = document.createElement('option'); option.value = group; option.textContent = group; $('background-category').append(option); }
  function gallery() {
    $('background-gallery').replaceChildren();
    let previousGroup;
    for (const scene of scenes.filter(s => $('background-category').value === 'All' || s.category === $('background-category').value)) {
      if ($('background-category').value === 'All' && scene.category !== previousGroup) {
        const heading = document.createElement('h4'); heading.textContent = scene.category;
        $('background-gallery').append(heading); previousGroup = scene.category;
      }
      const card = document.createElement('button'); card.type = 'button'; card.dataset.video = scene.video;
      const image = document.createElement('img'); image.loading = 'lazy'; image.alt = ''; image.src = 'https://i.ytimg.com/vi/' + scene.video + '/hqdefault.jpg';
      image.addEventListener('error', () => image.remove());
      const title = document.createElement('strong'); title.textContent = scene.emoji + ' ' + scene.name;
      const creator = document.createElement('small'); creator.textContent = scene.creator;
      card.append(image, title, creator); card.addEventListener('click', () => choose(scene)); $('background-gallery').append(card);
    }
    for (const button of $('background-gallery').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.video === preferences.video));
  }
  $('background-category').addEventListener('change', gallery); gallery();
  $('background-solid').addEventListener('change', () => save({...preferences, mode: 'solid'}));
  $('background-custom').addEventListener('change', () => preferences.video ? save({...preferences, mode: 'video'}) : choose(scenes[0]));
  $('background-custom-form').addEventListener('submit', event => {
    event.preventDefault();
    try { choose({video: youtubeID($('background-url').value), name: 'Custom YouTube video'}); $('background-error').textContent = ''; }
    catch (error) { $('background-error').textContent = error.message; }
  });
  $('background-play').addEventListener('click', () => {
    rememberPosition();
    const paused = !(preferences.paused || autoplayBlocked); autoplayBlocked = false;
    save({...preferences, paused});
  });
  $('background-mute').addEventListener('click', () => save({...preferences, muted: !(preferences.muted || preferences.volume === 0), volume: preferences.volume || 50}));
  $('background-volume').addEventListener('input', () => apply({...preferences, volume: +$('background-volume').value}));
  $('background-volume').addEventListener('change', () => save(preferences));
  $('background-seek').addEventListener('input', () => { seeking = true; renderControls(); });
  $('background-seek').addEventListener('change', () => {
    currentTime = +$('background-seek').value; seeking = false;
    if (ready && duration > 0) {
      // Keep the scrubber at the target while YouTube buffers the seek.
      pendingSeek = {time: currentTime, until: Date.now() + 8000};
      hasPosition = true;
      command('seekTo', [currentTime, true]);
      chrome.storage.local.set({[positionKey(preferences.video)]: {time: currentTime, duration, updatedAt: Date.now()}});
      syncPlayback(); renderControls();
    }
  });
  $('background-quality').addEventListener('change', async () => {
    const target = frame, select = $('background-quality');
    select.disabled = true; $('background-quality-status').textContent = '';
    try {
      const result = await requestQuality('select', select.value);
      if (target === frame) { select.value = result.selected; select.title = 'Video quality: ' + select.selectedOptions[0].textContent; }
    } catch (error) { if (target === frame) $('background-quality-status').textContent = error.message; }
    finally { if (target === frame) { select.disabled = false; syncPlayback(); } }
  });
  for (const [id, key] of [['panel-opacity','panelOpacity'], ['background-blur','blur']]) {
    $(id).addEventListener('input', () => apply({...preferences, [key]: +$(id).value}));
    $(id).addEventListener('change', () => save(preferences));
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== mediaOrigin) return;
    let data;
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!data || typeof data !== 'object') return;
    if (data.type === 'workspace-quality-response') { qualityRequests.get(data.id)?.(data); return; }
    if (data.event === 'onReady' || data.event === 'initialDelivery' || data.event === 'infoDelivery') {
      if (!ready) { ready = true; clearTimeout(timer); clearInterval(handshake); command('addEventListener', ['onStateChange']); command('addEventListener', ['onError']); command('addEventListener', ['onAutoplayBlocked']); syncPlayback(); loadQuality(); }
      const info = data.info;
      if (info && typeof info === 'object') {
        if (Number.isFinite(info.duration) && info.duration > 0) duration = info.duration;
        if (Number.isFinite(info.currentTime) && info.currentTime >= 0) {
          if (pendingSeek && (Math.abs(info.currentTime - pendingSeek.time) < 3 || Date.now() > pendingSeek.until)) pendingSeek = null;
          if (!pendingSeek && !seeking) { currentTime = info.currentTime; hasPosition = true; }
        }
      }
    }
    const state = data.event === 'onStateChange' ? data.info : data.info?.playerState;
    if (Number.isFinite(state)) playerState = state;
    if (state === 1) { autoplayBlocked = false; status(preferences.paused ? 'Paused' : 'Playing'); }
    if (state === 2) status(preferences.paused ? 'Paused' : 'Playback paused — use the play button to resume.');
    if (data.event === 'onAutoplayBlocked') { autoplayBlocked = true; status('Click Play to start the background.'); }
    renderControls();
    if (data.event === 'onError') {
      const code = data.info;
      status([101, 150].includes(code) ? 'This creator has disabled embedding. Choose another video.' : code === 153 ? 'YouTube could not verify this embed. Try another scene or open the video on YouTube.' : 'Video unavailable. Try another scene or custom link.');
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) rememberPosition(true); syncPlayback(); });
  window.addEventListener('pagehide', () => { rememberPosition(); command('pauseVideo'); });
  setInterval(() => { if (playing() && playerState === 1) rememberPosition(); }, 5000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.background) apply({...changes.background.newValue, muted: preferences.muted});
  });
  const stored = await new Promise(resolve => chrome.storage.local.get({background: backgroundDefaults}, resolve));
  if (chrome.runtime?.sendMessage) await chrome.runtime.sendMessage({type: 'prepareYouTube'}).catch(() => {});
  // Every newly opened tab starts playing silently, regardless of the previous session's controls.
  apply({...stored.background, paused: false, muted: true});
}
