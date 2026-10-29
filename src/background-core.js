export const scenes = [
  {id: 'cafe', video: '5Cd5-S4zUBk', name: 'Christmas café · jazz & fireplace', creator: 'Smooth Jazz BGM', category: 'Cafe', emoji: '🎄'},
  {id: 'rainy-cafe', video: 'NJuSStkIZBg', name: 'Rainy jazz café', creator: 'Coffee Shop Vibes', category: 'Cafe', emoji: '🌧️'},
  {id: 'fireplace', video: '3sL0omwElxw', name: 'Rain, thunder & fireplace', creator: 'The Guild of Ambience', category: 'Cafe', emoji: '🔥'},
  {id: 'library', video: '4vIQON2fDWM', name: 'Quiet library', creator: 'The Guild of Ambience', category: 'Cafe', emoji: '📚'},
  {id: 'lofi', video: '-FlxM_0S2lA', name: 'Best of lofi 2018 · chill & study', creator: 'Lofi Girl', category: 'Cafe', emoji: '🎧'},
  {id: 'cabin', video: 'THK1wcCbbEg', name: 'Snowy cabin & creek', creator: 'TheSilentWatcher', category: 'Scenic', emoji: '🏡'},
  {id: 'ocean-sunrise', video: 'tVrpJq3pFtY', name: 'Ocean sunrise · Los Cabos', creator: 'Nomadic Ambience', category: 'Scenic', emoji: '🌅'},
  {id: 'beach', video: '_iPgznUNWbU', name: 'Gentle ocean waves', creator: 'TheSilentWatcher', category: 'Scenic', emoji: '🌊'},
  {id: 'forest-snow', video: '0V_HNDAvuxg', name: 'Snow falling in the forest', creator: 'TheSilentWatcher', category: 'Scenic', emoji: '❄️'},
  {id: 'alpine-snow', video: 'B83vLKqqOac', name: 'Snowy alpine village at night', creator: 'TheSilentWatcher', category: 'Scenic', emoji: '🏔️'},
  {id: 'lava', video: 'ciuGCkS8ecM', name: 'Fluid lava lamp', creator: 'Oleg here! @gam_ol', category: 'Abstract', emoji: '🟣'},
  {id: 'particles', video: 'gx7KLCC7eKY', name: 'Colourful sliding particles', creator: 'Music Vibes', category: 'Abstract', emoji: '✨'},
  {id: 'abstract-liquid', video: 'pUWCnazcsbU', name: 'Abstract liquid · silent 4K', creator: 'Aerial Earth 🌎', category: 'Abstract', emoji: '💧'},
  {id: 'violet-filaments', video: 'hKckckhpbYY', name: 'Electric space · violet filaments', creator: 'Relaxing Screensavers', category: 'Abstract', emoji: '⚡'},
  {id: 'electric-sheep', video: 'jVD67pMdv9k', name: 'Electric Sheep · fractal animation', creator: 'Roaming Mosaics', category: 'Abstract', emoji: '🌀'}
];
export function youtubeID(input) {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste a YouTube video link.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS YouTube link.');
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com', 'youtube-nocookie.com'].includes(host)) {
    id = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Use a YouTube video link, rather than a playlist or channel.');
  return id;
}
export const backgroundDefaults = {mode: 'solid', video: '', name: '', creator: '', muted: true, volume: 50, paused: false, panelOpacity: 85, blur: 0};
export function cleanBackground(value = {}) {
  // Match complete old preset metadata so custom links keep their own titles.
  const previousPresets = [
    ['gaGrHUekGrc', 'Morning coffee shop', 'Nomadic Ambience', 'cafe'],
    ['5Cd5-S4zUBk', 'Morning coffee shop', 'Nomadic Ambience', 'cafe'],
    ['X4VbdwhkE10', 'Lofi study room', 'Lofi Girl', 'lofi'],
    ['3sL0omwElxw', 'Rain & fireplace', 'The Guild of Ambience', 'fireplace'],
    ['_iPgznUNWbU', 'Gentle waves · Greek cove', 'TheSilentWatcher', 'beach'],
    ['ciuGCkS8ecM', 'Lava lamp', 'Oleg here!', 'lava'],
    ['dURktAeZDa8', 'Flux · flowing particles', 'Sander Melnikov', 'particles'],
    ['dURktAeZDa8', 'Flux · flowing particles', 'sandydoo', 'particles'],
    ['jVD67pMdv9k', 'Electric Sheep · fractals', 'Roaming Mosaics · Scott Draves & contributors', 'electric-sheep']
  ];
  const previous = previousPresets.find(([video, name, creator]) => value.video === video && value.name === name && value.creator === creator);
  if (previous) {
    const replacement = scenes.find(scene => scene.id === previous[3]);
    value = {...value, video: replacement.video, name: replacement.name, creator: replacement.creator};
  }
  // Move saved, retired presets to their replacements; leave pasted custom links alone.
  if (value.creator === 'Calmed By Nature') {
    const replacement = scenes.find(scene => scene.id === ({c0_ejQQcrwI: 'cafe', '1RcVIuZ8Wdk': 'cabin'})[value.video]);
    if (replacement) value = {...value, video: replacement.video, name: replacement.name, creator: replacement.creator};
  }
  return {mode: value.mode === 'solid' ? 'solid' : value.mode === 'video' || value.video ? 'video' : 'solid', video: /^[\w-]{11}$/.test(value.video) ? value.video : '', name: String(value.name || '').slice(0, 100), creator: String(value.creator || '').slice(0, 100),
    muted: value.muted !== false, paused: value.paused === true,
    volume: Number.isFinite(+value.volume) ? Math.min(100, Math.max(0, +value.volume)) : 50,
    panelOpacity: Number.isFinite(+value.panelOpacity) ? Math.min(100, Math.max(0, +value.panelOpacity)) : 85,
    blur: Number.isFinite(+value.blur) ? Math.min(12, Math.max(0, +value.blur)) : 0};
}
export function embedURL(value, origin, start = 0) {
  const url = new URL('https://www.youtube-nocookie.com/embed/' + value.video);
  url.search = new URLSearchParams({autoplay: value.paused ? '0' : '1', mute: value.muted ? '1' : '0', loop: '1', playlist: value.video,
    controls: '1', playsinline: '1', enablejsapi: '1', rel: '0', hl: 'en', origin});
  if (Number.isFinite(start) && start > 0) url.searchParams.set('start', String(Math.floor(start)));
  return url.href;
}
