importScripts('engine.js');

// ── Settings ──
const DEFAULTS = {
  enabled: true,
  sites: [],              // origins the user switched on, e.g. "https://gemini.google.com"
  folder: 'Gemini Cleaned', // subfolder inside the browser's Downloads folder
  offsetX: -41,
  offsetY: -41,
  removeOriginal: false,
  log: []
};
const LOG_LIMIT = 20;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function getSettings() {
  return chrome.storage.local.get(DEFAULTS);
}

async function addLog(message, type = 'info') {
  const { log } = await chrome.storage.local.get({ log: [] });
  log.unshift({ time: Date.now(), message, type });
  await chrome.storage.local.set({ log: log.slice(0, LOG_LIMIT) });
}

// ── Helpers ──
function originOf(url) {
  try {
    if (!url) return null;
    if (url.startsWith('blob:')) return new URL(url.slice(5)).origin;
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

function isFromEnabledSite(item, sites) {
  const origins = [item.referrer, item.url, item.finalUrl].map(originOf).filter(Boolean);
  return origins.some(o => sites.includes(o));
}

function mightBeImage(item) {
  const mime = (item.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (IMAGE_EXT.test(item.filename || '')) return true;
  try {
    if (IMAGE_EXT.test(new URL(item.finalUrl || item.url).pathname)) return true;
  } catch { }
  // Unknown type: try anyway, decoding will tell us whether it is really an image
  return !mime || mime === 'application/octet-stream';
}

function baseName(path) {
  return (path || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
}

function sanitizeSegment(s) {
  return s.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim();
}

function sanitizeFolder(folder) {
  return folder.split(/[\\/]/).map(sanitizeSegment).filter(seg => seg && seg !== '..').join('/');
}

// Resolves once predicate(item) is true, or with the latest item when the timeout passes
function waitForDownload(id, predicate, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (item) => {
      if (finished) return;
      finished = true;
      chrome.downloads.onChanged.removeListener(onChange);
      clearTimeout(timer);
      resolve(item);
    };
    const check = async () => {
      const [item] = await chrome.downloads.search({ id });
      if (!item || predicate(item)) finish(item || null);
    };
    const onChange = (delta) => { if (delta.id === id) check(); };
    const timer = setTimeout(async () => {
      const [item] = await chrome.downloads.search({ id });
      finish(item || null);
    }, timeoutMs);
    chrome.downloads.onChanged.addListener(onChange);
    check();
  });
}

// ── Fetching the downloaded bytes ──
async function fetchBlobViaTab(url) {
  // blob: URLs only resolve inside the page that created them, so read it from that tab
  const origin = originOf(url);
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  for (const tab of tabs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        args: [url],
        func: async (u) => {
          const b = await (await fetch(u)).blob();
          return await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(b);
          });
        }
      });
      if (result) return (await fetch(result)).blob();
    } catch {
      // Try the next tab with the same origin
    }
  }
  throw new Error('Could not read blob download from the page (it may have been revoked).');
}

async function fetchDownloadBlob(item) {
  const url = item.finalUrl || item.url;
  if (url.startsWith('blob:')) return fetchBlobViaTab(url);
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching image`);
  return res.blob();
}

// ── Cleaning ──
let bg96Promise = null;
function getBg96() {
  if (!bg96Promise) {
    bg96Promise = fetch(BG_96_BASE64).then(r => r.blob()).then(b => createImageBitmap(b));
  }
  return bg96Promise;
}

async function cleanBlob(blob, offsetX, offsetY) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const { width, height } = bmp;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const base = getWatermarkInfo(width, height);
  // Gemini / Nano Banana preset defaults (gain, size scale), with fixed position offsets
  const settings = { ...getAdaptiveImagePreset('new', width, height), offsetX, offsetY };
  cleanFrame(await getBg96(), imageData, width, height, base, settings);
  ctx.putImageData(imageData, 0, 0);

  return { png: await canvas.convertToBlob({ type: 'image/png' }), width, height };
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

// ── Download pipeline ──
async function handleDownload(item) {
  if (item.byExtensionId === chrome.runtime.id) return; // our own cleaned output

  const settings = await getSettings();
  if (!settings.enabled || !isFromEnabledSite(item, settings.sites) || !mightBeImage(item)) return;

  // Grab the bytes right away, before a page-created blob: URL gets revoked
  const sourceBlob = await fetchDownloadBlob(item);

  let cleaned;
  try {
    cleaned = await cleanBlob(sourceBlob, settings.offsetX, settings.offsetY);
  } catch {
    return; // Not a decodable image, leave the download alone
  }

  const named = await waitForDownload(item.id, i => !!i.filename || i.state !== 'in_progress', 15000);
  const name = sanitizeSegment(baseName(named?.filename) || baseName(new URL(item.finalUrl || item.url).pathname)) ||
    `gemini_${Date.now()}`;
  const folder = sanitizeFolder(settings.folder || DEFAULTS.folder);
  const outPath = `${folder ? folder + '/' : ''}clean_${name}.png`;

  await chrome.downloads.download({
    url: await blobToDataUrl(cleaned.png),
    filename: outPath,
    conflictAction: 'uniquify',
    saveAs: false
  });
  await addLog(`Cleaned ${name} (${cleaned.width}×${cleaned.height}) → Downloads/${outPath}`, 'success');

  if (settings.removeOriginal) {
    const done = await waitForDownload(item.id, i => i.state !== 'in_progress', 120000);
    if (done && done.state === 'complete') {
      try {
        await chrome.downloads.removeFile(item.id);
        await chrome.downloads.erase({ id: item.id });
      } catch (e) {
        await addLog(`Could not remove original ${name}: ${e.message || e}`, 'error');
      }
    }
  }
}

chrome.downloads.onCreated.addListener((item) => {
  handleDownload(item).catch(err => {
    console.error(err);
    addLog(`Failed: ${err.message || err}`, 'error');
  });
});
