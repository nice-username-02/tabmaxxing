export async function initAppearance() {
  const defaults = {mode: 'system', light: 'default', dark: 'default'};
  const schemes = [
    ['default', 'Minimal'], ['atom', 'Atom'], ['ayu', 'Ayu'], ['catppuccin', 'Catppuccin'],
    ['dracula', 'Dracula'], ['eink', 'E-ink'], ['everforest', 'Everforest'], ['flexoki', 'Flexoki'],
    ['gruvbox', 'Gruvbox'], ['macos', 'macOS'], ['nord', 'Nord'], ['rose-pine', 'Rosé Pine'],
    ['solarized', 'Solarized'], ['notion', 'Sky (formerly Notion)'], ['things', 'Things']
  ];
  const $ = id => document.getElementById(id), root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preferences = defaults;
  const normalise = value => ({
    mode: ['system','light','dark'].includes(value?.mode) ? value.mode : 'system',
    light: value?.light !== 'dracula' && schemes.some(([id]) => id === value?.light) ? value.light : 'default',
    dark: schemes.some(([id]) => id === value?.dark) ? value.dark : 'default'
  });
  function apply(value) {
    preferences = normalise(value);
    const mode = preferences.mode === 'system' ? (system.matches ? 'dark' : 'light') : preferences.mode;
    for (const name of [...root.classList]) if (name.startsWith('minimal-') || name === 'theme-dark' || name === 'theme-light') root.classList.remove(name);
    root.classList.add('theme-' + mode, 'minimal-' + preferences[mode] + '-' + mode);
    root.dataset.appearance = mode;
    $('appearance-mode').value = preferences.mode;
    $('light-scheme').value = preferences.light;
    $('dark-scheme').value = preferences.dark;
    $('theme-preview').setAttribute('aria-label', schemes.find(([id]) => id === preferences[mode])[1] + ' ' + mode + ' preview');
  }
  for (const mode of ['light','dark']) {
    for (const [id, label] of schemes) {
      // Upstream Dracula defines a dark palette only; don't invent a light variant.
      if (mode === 'light' && id === 'dracula') continue;
      const option = document.createElement('option'); option.value = id; option.textContent = label;
      $(mode + '-scheme').append(option);
    }
  }
  for (const [id, key] of [['appearance-mode','mode'], ['light-scheme','light'], ['dark-scheme','dark']]) {
    $(id).addEventListener('change', () => {
      apply({...preferences, [key]: $(id).value});
      chrome.storage.local.set({appearance: preferences}, () => {
        if (chrome.runtime?.lastError) $('savestatus').textContent = 'Appearance could not be saved';
      });
    });
  }
  system.addEventListener('change', () => apply(preferences));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.appearance) apply(changes.appearance.newValue);
  });
  const stored = await new Promise(resolve => chrome.storage.local.get({appearance: defaults}, resolve));
  apply(stored.appearance);
}
