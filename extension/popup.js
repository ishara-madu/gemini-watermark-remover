const DEFAULTS = {
  enabled: true,
  sites: [],
  folder: 'Gemini Cleaned',
  offsetX: -41,
  offsetY: -41,
  removeOriginal: false,
  log: []
};

const $ = (id) => document.getElementById(id);

function renderLog(log) {
  const el = $('log');
  el.innerHTML = '';
  if (!log.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Nothing cleaned yet.';
    el.appendChild(empty);
    return;
  }
  for (const entry of log) {
    const line = document.createElement('div');
    line.className = entry.type;
    line.textContent = `${new Date(entry.time).toLocaleTimeString()} · ${entry.message}`;
    el.appendChild(line);
  }
}

async function init() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let origin = null;
  try {
    const u = new URL(tab?.url || '');
    if (u.protocol === 'http:' || u.protocol === 'https:') origin = u.origin;
  } catch { }

  $('opt-enabled').checked = settings.enabled;
  $('site-origin').textContent = origin || 'Not available on this page';
  $('opt-site').checked = !!origin && settings.sites.includes(origin);
  $('opt-site').disabled = !origin;
  $('opt-folder').value = settings.folder;
  $('opt-offset-x').value = settings.offsetX;
  $('opt-offset-y').value = settings.offsetY;
  $('opt-remove-original').checked = settings.removeOriginal;
  renderLog(settings.log);

  $('opt-enabled').addEventListener('change', (e) => chrome.storage.local.set({ enabled: e.target.checked }));
  $('opt-remove-original').addEventListener('change', (e) => chrome.storage.local.set({ removeOriginal: e.target.checked }));
  $('opt-folder').addEventListener('change', (e) => chrome.storage.local.set({ folder: e.target.value.trim() || DEFAULTS.folder }));
  $('opt-offset-x').addEventListener('change', (e) => chrome.storage.local.set({ offsetX: parseInt(e.target.value, 10) || 0 }));
  $('opt-offset-y').addEventListener('change', (e) => chrome.storage.local.set({ offsetY: parseInt(e.target.value, 10) || 0 }));

  $('opt-site').addEventListener('change', async (e) => {
    const { sites } = await chrome.storage.local.get({ sites: [] });
    const next = e.target.checked ? [...new Set([...sites, origin])] : sites.filter(s => s !== origin);
    await chrome.storage.local.set({ sites: next });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.log) renderLog(changes.log.newValue || []);
  });
}

init();
