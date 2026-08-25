// ── Direct Link Configuration (Monetag) ──
// const MONETAG_DIRECT_LINK = 'https://omg10.com/4/11542046';
// const MONETAG_EXPORT_DIRECT_LINK = 'https://omg10.com/4/11584190';
const MONETAG_DIRECT_LINK = '';
const MONETAG_EXPORT_DIRECT_LINK = '';

// ── Telegram Mini App (TMA) Integration & Haptics ──
const tgApp = typeof window !== 'undefined' && window.Telegram ? window.Telegram.WebApp : null;

const tgHaptic = {
  impact: (style = 'medium') => {
    try {
      if (tgApp?.HapticFeedback?.impactOccurred) {
        tgApp.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {}
  },
  notification: (type = 'success') => {
    try {
      if (tgApp?.HapticFeedback?.notificationOccurred) {
        tgApp.HapticFeedback.notificationOccurred(type);
      }
    } catch (e) {}
  },
  selection: () => {
    try {
      if (tgApp?.HapticFeedback?.selectionChanged) {
        tgApp.HapticFeedback.selectionChanged();
      }
    } catch (e) {}
  }
};
window.tgHaptic = tgHaptic;

function initTelegramWebApp() {
  if (!tgApp) return;

  try {
    tgApp.ready();
    tgApp.expand();

    // Prevent accidental swipe-to-close gestures while touching sliders/canvas
    if (typeof tgApp.disableVerticalSwipes === 'function') {
      tgApp.disableVerticalSwipes();
    }

    // Set theme and header colors
    if (typeof tgApp.setHeaderColor === 'function') {
      tgApp.setHeaderColor('#F5F5F7');
    }
    if (typeof tgApp.setBackgroundColor === 'function') {
      tgApp.setBackgroundColor('#F5F5F7');
    }

    document.documentElement.classList.add('is-telegram-webapp');
    if (document.body) {
      document.body.classList.add('is-telegram-webapp');
    }
  } catch (e) {
    console.warn('Telegram WebApp setup notice:', e);
  }
}

// Early call for Telegram
initTelegramWebApp();

function openExternalLink(url) {
  if (!url) return;
  try {
    if (tgApp && typeof tgApp.openLink === 'function') {
      tgApp.openLink(url);
      return;
    }
  } catch (e) {
    console.error('Failed to open link via Telegram WebApp:', e);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
window.openExternalLink = openExternalLink;

function handleShareClick(e, url) {
  if (e) e.preventDefault();
  tgHaptic.impact('light');
  if (tgApp && typeof tgApp.openTelegramLink === 'function') {
    try {
      tgApp.openTelegramLink(url);
      return;
    } catch (err) {}
  }
  openExternalLink(url);
}
window.handleShareClick = handleShareClick;

// ── Universal File Saver Engine for Telegram Mini App, iOS, Android & Desktop ──
let lastCleanedImage = {
  blob: null,
  dataUrl: '',
  fileName: ''
};

let lastCleanedVideo = {
  blob: null,
  url: '',
  fileName: ''
};

async function downloadCleanedMedia(type = 'image') {
  tgHaptic.impact('medium');

  const isImage = type === 'image';
  const data = isImage ? lastCleanedImage : lastCleanedVideo;
  if (!data) return;

  const fileName = data.fileName || (isImage ? 'cleaned_image.png' : 'cleaned_video.mp4');
  const mimeType = isImage ? 'image/png' : 'video/mp4';
  const blob = data.blob;

  // Layer 1: Native Web Share API (Primary for Mobile & Telegram Mini App)
  // On iOS (Telegram/Safari), this immediately opens the native Save Image / Save to Files sheet!
  // On Android (Telegram/Chrome), this opens the native Save to Photos / Device sheet!
  if (blob && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName
        });
        tgHaptic.notification('success');
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // User closed sheet intentionally
      console.warn('Web Share API error, falling back to direct anchor:', err);
    }
  }

  // Layer 2: Blob Anchor Download (Desktop Chrome, Edge, Firefox, Mac Safari)
  if (blob) {
    try {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch (e) {}
      }, 2000);
      tgHaptic.notification('success');
      return;
    } catch (e) {
      console.error('Anchor download error:', e);
    }
  }

  // Layer 3: Direct DataURL / Blob Window Open (Fallback for webviews without download support)
  const fallbackUrl = data.dataUrl || data.url;
  if (fallbackUrl) {
    try {
      const newWin = window.open(fallbackUrl, '_blank');
      if (!newWin) {
        window.location.href = fallbackUrl;
      }
      tgHaptic.notification('success');
    } catch (e) {
      console.error('Fallback open error:', e);
    }
  }
}
window.downloadCleanedMedia = downloadCleanedMedia;

function handleDownloadAd() {
  tgHaptic.impact('medium');
  // if (MONETAG_DIRECT_LINK) {
  //   openExternalLink(MONETAG_DIRECT_LINK);
  // }
}
window.handleDownloadAd = handleDownloadAd;

function handleExportAd() {
  tgHaptic.impact('medium');
  // if (MONETAG_EXPORT_DIRECT_LINK) {
  //   openExternalLink(MONETAG_EXPORT_DIRECT_LINK);
  // }
}
window.handleExportAd = handleExportAd;

// ── 1. Engine Core (alphaMap, blendModes, geometry, tuner) ──
function calculateAlphaMap(bgCaptureImageData) {
  const { width, height, data } = bgCaptureImageData;
  const alphaMap = new Float32Array(width * height);
  for (let i = 0; i < alphaMap.length; i++) {
    const idx = i * 4;
    alphaMap[i] = Math.max(data[idx], data[idx + 1], data[idx + 2]) / 255.0;
  }
  return alphaMap;
}

const ALPHA_THRESHOLD = 0.002;
const MAX_ALPHA = 0.99;
const LOGO_VALUE = 255;

function removeWatermark(imageData, alphaMap, position, options = {}) {
  const { x, y, width, height } = position;
  const gain = Number.isFinite(options.alphaGain) && options.alphaGain > 0
    ? options.alphaGain
    : 1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
      const alphaIdx = row * width + col;

      let alpha = alphaMap[alphaIdx] * gain;
      if (alpha < ALPHA_THRESHOLD) continue;
      alpha = Math.min(alpha, MAX_ALPHA);

      for (let c = 0; c < 3; c++) {
        const watermarked = imageData.data[imgIdx + c];
        const original = (watermarked - alpha * LOGO_VALUE) / (1.0 - alpha);
        imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
      }
    }
  }
}

function getWatermarkInfo(width, height) {
  const minDim = Math.min(width, height);
  const ratio = minDim / 1536;
  const size = Math.max(16, Math.round(96 * ratio));
  const margin = Math.max(8, Math.round(64 * ratio));

  return {
    size,
    x: Math.max(0, width - margin - size),
    y: Math.max(0, height - margin - size),
    width: size,
    height: size,
  };
}

function getRoi(width, height, wm) {
  const pad = Math.round(wm.size * 0.6);
  const rx = Math.max(0, Math.min(width - 1, wm.x - pad));
  const ry = Math.max(0, Math.min(height - 1, wm.y - pad));
  const rw = Math.max(1, Math.min(width - rx, wm.width + pad * 2));
  const rh = Math.max(1, Math.min(height - ry, wm.height + pad * 2));
  return { x: rx, y: ry, width: rw, height: rh };
}

function resolveBox(base, width, height, opts = {}) {
  const sizeScale = opts.sizeScale || 1;
  const size = Math.max(8, Math.min(Math.round(base.size * sizeScale), Math.min(width, height)));
  const x = Math.max(0, Math.min(base.x + Math.round(opts.offsetX || 0), width - size));
  const y = Math.max(0, Math.min(base.y + Math.round(opts.offsetY || 0), height - size));
  return { size, x, y, width: size, height: size };
}

function buildAlpha(bgImg, roi, wm, gain) {
  const count = roi.width * roi.height;
  const alphaMap = new Float32Array(count);
  const offX = wm.x - roi.x;
  const offY = wm.y - roi.y;

  const c = document.createElement('canvas');
  c.width = wm.size; c.height = wm.size;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bgImg, 0, 0, wm.size, wm.size);
  const data = cx.getImageData(0, 0, wm.size, wm.size).data;

  for (let row = 0; row < wm.size; row++) {
    for (let col = 0; col < wm.size; col++) {
      const ri = (offY + row) * roi.width + (offX + col);
      if (ri < 0 || ri >= count) continue;
      const o = (row * wm.size + col) * 4;
      const a = (Math.max(data[o], data[o + 1], data[o + 2]) / 255) * gain;
      alphaMap[ri] = a > 0 ? Math.min(a, 0.99) : 0;
    }
  }
  return alphaMap;
}

function cleanFrame(bgImg, imageData, width, height, base, opts = {}) {
  const wm = resolveBox(base, width, height, opts);
  const roi = getRoi(width, height, wm);
  const alpha = buildAlpha(bgImg, roi, wm, opts.gain ?? 1);
  removeWatermark(imageData, alpha, {
    x: roi.x, y: roi.y, width: roi.width, height: roi.height,
  });
  return { wm, roi };
}

// Inline Base64 Reference Images (guarantees zero CORS/Tainted Canvas errors when double clicked)
const BG_48_BASE64 = "data:image/png;base64,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";
const BG_96_BASE64 = "data:image/png;base64,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";

// ── 2. WatermarkEngine Class ──
class WatermarkEngine {
  constructor(bg48, bg96) {
    this.bg48 = bg48;
    this.bg96 = bg96;
    this.alphaMaps = {};
  }

  static async create() {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });

    try {
      const [bg48, bg96] = await Promise.all([
        loadImage(BG_48_BASE64),
        loadImage(BG_96_BASE64)
      ]);
      return new WatermarkEngine(bg48, bg96);
    } catch (e) {
      console.error("Failed to load watermark background assets.", e);
      throw e;
    }
  }

  getWatermarkInfo(width, height) {
    return getWatermarkInfo(width, height);
  }

  async getAlphaMap(size) {
    if (this.alphaMaps[size]) return this.alphaMaps[size];

    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(size <= 48 ? this.bg48 : this.bg96, 0, 0, size, size);

    const map = calculateAlphaMap(ctx.getImageData(0, 0, size, size));
    this.alphaMaps[size] = map;
    return map;
  }

  buildScaledAlphaMap(size) {
    if (this.alphaMaps[size]) return this.alphaMaps[size];

    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bg96, 0, 0, size, size);

    const map = calculateAlphaMap(ctx.getImageData(0, 0, size, size));
    this.alphaMaps[size] = map;
    return map;
  }

  async process(imageFile) {
    const objectUrl = URL.createObjectURL(imageFile);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const config = this.getWatermarkInfo(canvas.width, canvas.height);

    const alphaMap = await this.getAlphaMap(config.size);
    removeWatermark(imageData, alphaMap, config);

    ctx.putImageData(imageData, 0, 0);

    return {
      blob: await new Promise(r => canvas.toBlob(r, 'image/png')),
      originalSrc: objectUrl,
      width: img.width,
      height: img.height
    };
  }

  async prepareForSize(width, height) {
    const config = this.getWatermarkInfo(width, height);
    const alphaMap = await this.getAlphaMap(config.size);
    return { config, alphaMap };
  }

  removeFromImageData(imageData, prepared) {
    const { config, alphaMap } = prepared || this._sync(imageData.width, imageData.height);
    removeWatermark(imageData, alphaMap, config);
    return imageData;
  }

  _sync(width, height) {
    const config = this.getWatermarkInfo(width, height);
    return { config, alphaMap: this.alphaMaps[config.size] };
  }
}

// ── 3. VideoWatermarkEngine Class ──
const VIDEO_DEFAULTS = { gain: 1.0, offsetX: -24, offsetY: -24, sizeScale: 1 };

class VideoWatermarkEngine {
  constructor(engine) {
    this.engine = engine;
    this._mb = null;
  }

  static async create() {
    const engine = await WatermarkEngine.create();
    return new VideoWatermarkEngine(engine);
  }

  static isSupported() {
    return (
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoDecoder !== 'undefined'
    );
  }

  async _lib() {
    if (!this._mb) this._mb = await import('https://cdn.jsdelivr.net/npm/mediabunny@1.52.3/+esm');
    return this._mb;
  }

  get sparkleImage() {
    return this.engine.bg96;
  }

  getVeoWatermark(width, height) {
    const base = Math.min(width, height);
    const size = Math.max(24, Math.min(Math.round(base / 15), base));
    const margin = Math.round(base / 10);
    return {
      size,
      x: Math.max(0, width - margin - size),
      y: Math.max(0, height - margin - size),
      width: size,
      height: size,
    };
  }

  previewClean(fullImageData, width, height, opts = {}) {
    const base = this.getVeoWatermark(width, height);
    return cleanFrame(this.engine.bg96, fullImageData, width, height, base, {
      ...opts,
      gain: opts.gain ?? VIDEO_DEFAULTS.gain,
    });
  }

  async process(file, opts = {}) {
    const onProgress = opts.onProgress || (() => { });
    const gain = opts.gain ?? VIDEO_DEFAULTS.gain;

    const mb = await this._lib();
    const {
      ALL_FORMATS, BlobSource, BufferTarget, CanvasSource,
      EncodedAudioPacketSource, EncodedPacketSink, Input,
      Mp4OutputFormat, Output, QUALITY_HIGH, VideoSampleSink, canEncodeVideo,
    } = mb;

    if (canEncodeVideo && !(await canEncodeVideo('avc'))) {
      throw new Error(
        'Your browser cannot encode H.264 video locally. Please try Chrome or Edge desktop.'
      );
    }

    const originalUrl = URL.createObjectURL(file);
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      input.dispose?.();
      URL.revokeObjectURL(originalUrl);
      throw new Error('No decodable video track found.');
    }

    const width = videoTrack.displayWidth ?? videoTrack.codedWidth;
    const height = videoTrack.displayHeight ?? videoTrack.codedHeight;
    const duration = await input.computeDuration().catch(() => 0);

    let frameRate = 30;
    try {
      const stats = await videoTrack.computePacketStats(120);
      if (stats?.averagePacketRate) frameRate = Math.round(stats.averagePacketRate);
    } catch { }

    const base = opts.mode === 'gemini' ? getWatermarkInfo(width, height) : this.getVeoWatermark(width, height);
    const wm = resolveBox(base, width, height, opts);
    const roi = getRoi(width, height, wm);
    const alpha = buildAlpha(this.engine.bg96, roi, wm, gain);
    const region = { x: 0, y: 0, width: roi.width, height: roi.height };

    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      keyFrameInterval: 2,
      sizeChangeBehavior: 'passThrough',
    });
    output.addVideoTrack(videoSource, { frameRate });

    let audioSource = null;
    let audioTrack = null;
    let audioDecoderConfig = null;
    try {
      audioTrack = await input.getPrimaryAudioTrack();
      if (audioTrack) {
        const audioCodec = await audioTrack.getCodec();
        audioDecoderConfig = await audioTrack.getDecoderConfig().catch(() => null);
        if (audioCodec && audioDecoderConfig) {
          audioSource = new EncodedAudioPacketSource(audioCodec);
          output.addAudioTrack(audioSource);
        }
      }
    } catch {
      audioSource = null;
    }

    await output.start();

    const fallbackDur = frameRate > 0 ? 1 / frameRate : 1 / 30;
    const sink = new VideoSampleSink(videoTrack);
    let firstTimestamp = null;
    let lastTimestamp = -1;
    for await (const sample of sink.samples()) {
      if (firstTimestamp === null) firstTimestamp = sample.timestamp;
      let timestamp = sample.timestamp - firstTimestamp;
      if (!(timestamp >= 0)) timestamp = 0;
      if (timestamp <= lastTimestamp) timestamp = lastTimestamp + fallbackDur;
      const dur = Number.isFinite(sample.duration) && sample.duration > 0 ? sample.duration : fallbackDur;
      lastTimestamp = timestamp;

      sample.draw(ctx, 0, 0, width, height);
      sample.close();

      const px = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
      removeWatermark(px, alpha, region);

      // Force GPU texture sync for WebCodecs by using ImageBitmap
      const bmp = await createImageBitmap(px);
      ctx.drawImage(bmp, roi.x, roi.y);
      bmp.close();

      await videoSource.add(timestamp, dur);
      if (duration) onProgress({ progress: Math.min(0.99, timestamp / duration) });
    }
    videoSource.close();

    if (audioSource) {
      try {
        const offset = firstTimestamp ?? 0;
        const aSink = new EncodedPacketSink(audioTrack);
        let isFirstAudio = true;
        let lastAudioTs = -1;
        for await (const packet of aSink.packets()) {
          let newTs = packet.timestamp - offset;
          if (newTs < 0) continue;
          if (newTs <= lastAudioTs) newTs = lastAudioTs + 1e-6;
          lastAudioTs = newTs;
          let outPacket = packet;
          if (newTs !== packet.timestamp && typeof packet.clone === 'function') {
            outPacket = packet.clone({ timestamp: newTs });
          }
          await audioSource.add(
            outPacket,
            isFirstAudio && audioDecoderConfig ? { decoderConfig: audioDecoderConfig } : undefined
          );
          isFirstAudio = false;
        }
      } catch (e) {
        console.warn('Audio passthrough failed.', e);
      } finally {
        audioSource.close();
      }
    }

    await output.finalize();
    input.dispose?.();

    if (!target.buffer) {
      URL.revokeObjectURL(originalUrl);
      throw new Error('Video export produced no output.');
    }

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    onProgress({ progress: 1 });

    return {
      blob,
      url: URL.createObjectURL(blob),
      originalUrl,
      ext: 'mp4',
      mime: 'video/mp4',
      width,
      height,
    };
  }
}

// ── 4. App Controller & Event Handlers ──
let currentTab = 'image';
let watermarkEngine = null;
let videoEngine = null;

const IMG_PRESETS = {
  new: { gain: 0.6, offsetX: -128, offsetY: -128, sizeScale: 1 },
  classic: { gain: 1, offsetX: 0, offsetY: 0, sizeScale: 1 }
};

const VIDEO_PRESETS = {
  veo: { gain: 0.6, offsetX: -24, offsetY: -24, sizeScale: 1 },
  corner: { gain: 0.6, offsetX: 0, offsetY: 0, sizeScale: 1 }
};

function getAdaptiveImagePreset(presetKey, width = 1536, height = 1536) {
  if (presetKey === 'classic') {
    return { gain: 1.0, offsetX: 0, offsetY: 0, sizeScale: 1.0 };
  }
  const minDim = Math.min(width, height || width);
  const scaleRatio = Math.max(0.25, Math.min(1.5, minDim / 1536));
  const adaptiveOffset = Math.round(-128 * scaleRatio);
  return {
    gain: 0.6,
    offsetX: adaptiveOffset,
    offsetY: adaptiveOffset,
    sizeScale: 1.0
  };
}

function getAdaptiveVideoPreset(presetKey, width = 720, height = 720) {
  if (presetKey === 'corner') {
    return { gain: 0.6, offsetX: 0, offsetY: 0, sizeScale: 1.0 };
  }
  const minDim = Math.min(width, height || width);
  const scaleRatio = Math.max(0.3, Math.min(1.5, minDim / 720));
  const adaptiveOffset = Math.round(-24 * scaleRatio);
  return {
    gain: 0.6,
    offsetX: adaptiveOffset,
    offsetY: adaptiveOffset,
    sizeScale: 1.0
  };
}

// ── Advanced Watermark Auto-Detection System (Fused Multi-Scale, Gradient & Dual-Polarity) ──

const alphaTemplateCache = new Map();

function getAlphaTemplateData(bgImg, size) {
  if (alphaTemplateCache.has(size)) {
    return alphaTemplateCache.get(size);
  }
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bgImg, 0, 0, size, size);
  const raw = cx.getImageData(0, 0, size, size).data;

  const alphas = new Float32Array(size * size);
  for (let i = 0; i < alphas.length; i++) {
    const o = i * 4;
    alphas[i] = Math.max(raw[o], raw[o + 1], raw[o + 2]) / 255.0;
  }

  const gradMag = new Float32Array(size * size);
  for (let r = 1; r < size - 1; r++) {
    for (let col = 1; col < size - 1; col++) {
      const idx = r * size + col;
      const gx = alphas[idx + 1] - alphas[idx - 1];
      const gy = alphas[(r + 1) * size + col] - alphas[(r - 1) * size + col];
      gradMag[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  const template = { raw, alphas, gradMag, size };
  alphaTemplateCache.set(size, template);
  return template;
}

function evaluateCandidateMatch(imageData, width, height, bgImg, box) {
  const { x, y, size } = box;
  if (x < 0 || y < 0 || x + size > width || y + size > height || size <= 0) {
    return { score: -1, variance: 0 };
  }

  const template = getAlphaTemplateData(bgImg, size);
  const { alphas, gradMag } = template;

  let sumL = 0, sumA = 0;
  let sumL2 = 0, sumA2 = 0;
  let sumLA = 0;

  let sumInvL = 0;
  let sumInvL2 = 0;
  let sumInvLA = 0;

  let sumG = 0, sumGA = 0;
  let sumG2 = 0, sumGA2 = 0;
  let sumGGA = 0;

  let n = 0;
  let nGrad = 0;

  const step = size > 80 ? 2 : 1;

  for (let r = 0; r < size; r += step) {
    const imgRow = y + r;
    for (let col = 0; col < size; col += step) {
      const imgCol = x + col;
      const imgIdx = (imgRow * width + imgCol) * 4;
      const alphaIdx = r * size + col;

      const rVal = imageData.data[imgIdx];
      const gVal = imageData.data[imgIdx + 1];
      const bVal = imageData.data[imgIdx + 2];
      const lum = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
      const invLum = 255.0 - lum;
      const alpha = alphas[alphaIdx];

      sumL += lum;
      sumA += alpha;
      sumL2 += lum * lum;
      sumA2 += alpha * alpha;
      sumLA += lum * alpha;

      sumInvL += invLum;
      sumInvL2 += invLum * invLum;
      sumInvLA += invLum * alpha;
      n++;

      // Gradient analysis (high-frequency diamond sparkle edges)
      if (r > 0 && r < size - 1 && col > 0 && col < size - 1 && imgRow > 0 && imgRow < height - 1 && imgCol > 0 && imgCol < width - 1) {
        const leftIdx = (imgRow * width + (imgCol - 1)) * 4;
        const rightIdx = (imgRow * width + (imgCol + 1)) * 4;
        const upIdx = ((imgRow - 1) * width + imgCol) * 4;
        const downIdx = ((imgRow + 1) * width + imgCol) * 4;

        const lumLeft = 0.299 * imageData.data[leftIdx] + 0.587 * imageData.data[leftIdx + 1] + 0.114 * imageData.data[leftIdx + 2];
        const lumRight = 0.299 * imageData.data[rightIdx] + 0.587 * imageData.data[rightIdx + 1] + 0.114 * imageData.data[rightIdx + 2];
        const lumUp = 0.299 * imageData.data[upIdx] + 0.587 * imageData.data[upIdx + 1] + 0.114 * imageData.data[upIdx + 2];
        const lumDown = 0.299 * imageData.data[downIdx] + 0.587 * imageData.data[downIdx + 1] + 0.114 * imageData.data[downIdx + 2];

        const gx = lumRight - lumLeft;
        const gy = lumDown - lumUp;
        const imgGrad = Math.sqrt(gx * gx + gy * gy);
        const aGrad = gradMag[alphaIdx];

        sumG += imgGrad;
        sumGA += aGrad;
        sumG2 += imgGrad * imgGrad;
        sumGA2 += aGrad * aGrad;
        sumGGA += imgGrad * aGrad;
        nGrad++;
      }
    }
  }

  if (n === 0) return { score: -1, variance: 0 };

  const meanL = sumL / n;
  const meanA = sumA / n;
  const varL = Math.max(0, sumL2 / n - meanL * meanL);
  const varA = Math.max(0, sumA2 / n - meanA * meanA);

  if (varA <= 0.0001) {
    return { score: 0, variance: varL };
  }

  // White polarity NCC
  let nccWhite = 0;
  if (varL > 0.5) {
    const covLA = sumLA / n - meanL * meanA;
    nccWhite = covLA / Math.sqrt(varL * varA);
  }

  // Dark polarity NCC (for bright white backgrounds)
  let nccDark = 0;
  const meanInvL = sumInvL / n;
  const varInvL = Math.max(0, sumInvL2 / n - meanInvL * meanInvL);
  if (varInvL > 0.5 && meanL > 160) {
    const covInvLA = sumInvLA / n - meanInvL * meanA;
    nccDark = covInvLA / Math.sqrt(varInvL * varA);
  }

  const nccLum = Math.max(nccWhite, nccDark);

  // Gradient edge NCC
  let nccGrad = 0;
  if (nGrad > 10) {
    const meanG = sumG / nGrad;
    const meanGA = sumGA / nGrad;
    const varG = Math.max(0, sumG2 / nGrad - meanG * meanG);
    const varGA = Math.max(0, sumGA2 / nGrad - meanGA * meanGA);
    if (varG > 0.5 && varGA > 0.0001) {
      const covGGA = sumGGA / nGrad - meanG * meanGA;
      nccGrad = Math.max(0, covGGA / Math.sqrt(varG * varGA));
    }
  }

  let fusedScore = (nccLum * 0.65) + (nccGrad * 0.35);
  if (varL < 20) {
    fusedScore = Math.max(fusedScore, (nccLum * 0.40) + (nccGrad * 0.60));
  }

  return { score: Math.max(0, fusedScore), variance: varL };
}

function detectWatermarkCandidate(imageData, width, height, bgImg) {
  const minDim = Math.min(width, height);
  const baseRatio = minDim / 1536;
  const base = getWatermarkInfo(width, height);

  // Candidate Layout Families with Bayesian Priors:
  const layoutFamilies = [
    // 1. New Gemini Adaptive Inset (12.5% Inset)
    {
      presetKey: 'new',
      name: 'New Gemini (Adaptive)',
      baseSize: base.size,
      calcPos: (s) => {
        const m = Math.max(8, Math.round(192 * baseRatio));
        return { x: Math.max(0, width - m - s), y: Math.max(0, height - m - s) };
      },
      gain: 0.6,
      prior: 1.08
    },
    // 2. Classic Corner Adaptive (4.16% Margin)
    {
      presetKey: 'classic',
      name: 'Classic Corner (Adaptive)',
      baseSize: base.size,
      calcPos: (s) => {
        const m = Math.max(8, Math.round(64 * baseRatio));
        return { x: Math.max(0, width - m - s), y: Math.max(0, height - m - s) };
      },
      gain: 1.0,
      prior: 1.04
    },
    // 3. Fixed Standard (96px watermark regardless of crop/resize)
    {
      presetKey: 'new',
      name: 'Gemini (Fixed 96px Inset)',
      baseSize: 96,
      calcPos: (s) => {
        const m = minDim >= 1400 ? 192 : Math.round(128 * Math.max(0.5, minDim / 1024));
        return { x: Math.max(0, width - m - s), y: Math.max(0, height - m - s) };
      },
      gain: 0.6,
      prior: 1.02
    },
    // 4. Fixed 96px Classic Corner
    {
      presetKey: 'classic',
      name: 'Classic Corner (Fixed 96px)',
      baseSize: 96,
      calcPos: (s) => {
        const m = minDim >= 1024 ? 64 : 32;
        return { x: Math.max(0, width - m - s), y: Math.max(0, height - m - s) };
      },
      gain: 1.0,
      prior: 1.01
    }
  ];

  // Multi-Scale search pyramid: 0.55x to 1.70x
  const scalePyramid = [0.55, 0.70, 0.85, 1.00, 1.15, 1.30, 1.50, 1.70];

  let bestMatch = null;
  let bestScore = -1;

  for (const layout of layoutFamilies) {
    for (const scale of scalePyramid) {
      const s = Math.max(16, Math.min(Math.round(layout.baseSize * scale), Math.min(width, height) - 8));
      const pos = layout.calcPos(s);
      const { score } = evaluateCandidateMatch(imageData, width, height, bgImg, { x: pos.x, y: pos.y, size: s });
      const weightedScore = score * (layout.prior || 1.0);

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestMatch = {
          layout,
          size: s,
          scale,
          x: pos.x,
          y: pos.y,
          score: weightedScore
        };
      }
    }
  }

  // Refinement: Joint 2D Position (±16px) and Scale fine-tuning (±10%)
  if (bestMatch && bestMatch.score > 0.05) {
    let refinedX = bestMatch.x;
    let refinedY = bestMatch.y;
    let refinedSize = bestMatch.size;
    let refinedScore = bestMatch.score;

    const fineSizes = [
      Math.max(16, Math.round(bestMatch.size * 0.90)),
      Math.max(16, Math.round(bestMatch.size * 0.95)),
      bestMatch.size,
      Math.min(Math.min(width, height) - 8, Math.round(bestMatch.size * 1.05)),
      Math.min(Math.min(width, height) - 8, Math.round(bestMatch.size * 1.10))
    ];
    const uniqueSizes = [...new Set(fineSizes)];

    for (const testSize of uniqueSizes) {
      for (let dy = -16; dy <= 16; dy += 4) {
        for (let dx = -16; dx <= 16; dx += 4) {
          const testX = Math.max(0, Math.min(width - testSize, bestMatch.x + dx));
          const testY = Math.max(0, Math.min(height - testSize, bestMatch.y + dy));
          const { score } = evaluateCandidateMatch(imageData, width, height, bgImg, { x: testX, y: testY, size: testSize });
          const weightedScore = score * (bestMatch.layout.prior || 1.0);

          if (weightedScore > refinedScore) {
            refinedScore = weightedScore;
            refinedX = testX;
            refinedY = testY;
            refinedSize = testSize;
          }
        }
      }
    }

    const calculatedScale = Math.round((refinedSize / base.size) * 100) / 100;

    return {
      matchFound: refinedScore >= 0.10,
      score: Math.min(1.0, refinedScore),
      presetKey: bestMatch.layout.presetKey,
      name: `${bestMatch.layout.name} (${refinedSize}px)`,
      offsetX: refinedX - base.x,
      offsetY: refinedY - base.y,
      sizeScale: Math.max(0.5, Math.min(2.5, calculatedScale)),
      gain: bestMatch.layout.gain || 0.6,
    };
  }

  const fallbackOffset = Math.round(-128 * baseRatio);
  return {
    matchFound: false,
    score: bestScore > 0 ? bestScore : 0,
    presetKey: 'new',
    name: 'New Gemini (Adaptive)',
    offsetX: fallbackOffset,
    offsetY: fallbackOffset,
    sizeScale: 1.0,
    gain: 0.6,
  };
}

function detectVideoWatermarkCandidate(imageData, width, height, bgImg) {
  const baseDim = Math.min(width, height);
  const veoBase = {
    size: Math.max(24, Math.min(Math.round(baseDim / 15), baseDim)),
    margin: Math.round(baseDim / 10),
  };

  const layoutFamilies = [
    // 1. Veo Adaptive Inset
    {
      name: 'Gemini Veo (Adaptive Inset)',
      baseSize: veoBase.size,
      calcPos: (s) => {
        const adaptiveOffset = Math.round(-24 * (baseDim / 720));
        const baseX = Math.max(0, width - veoBase.margin - veoBase.size);
        const baseY = Math.max(0, height - veoBase.margin - veoBase.size);
        return {
          x: Math.max(0, Math.min(width - s, baseX + adaptiveOffset)),
          y: Math.max(0, Math.min(height - s, baseY + adaptiveOffset))
        };
      },
      gain: 0.6,
      prior: 1.06
    },
    // 2. Veo Classic Corner
    {
      name: 'Gemini Veo (Corner)',
      baseSize: veoBase.size,
      calcPos: (s) => {
        const baseX = Math.max(0, width - veoBase.margin - veoBase.size);
        const baseY = Math.max(0, height - veoBase.margin - veoBase.size);
        return {
          x: Math.max(0, Math.min(width - s, baseX)),
          y: Math.max(0, Math.min(height - s, baseY))
        };
      },
      gain: 0.6,
      prior: 1.02
    },
    // 3. Gemini Sparkle Image-style on Video
    {
      name: 'Gemini Sparkle (Standard)',
      baseSize: Math.max(24, Math.round(96 * (baseDim / 1536))),
      calcPos: (s) => {
        const m = Math.max(16, Math.round(192 * (baseDim / 1536)));
        return {
          x: Math.max(0, width - m - s),
          y: Math.max(0, height - m - s)
        };
      },
      gain: 0.6,
      prior: 1.01
    }
  ];

  const scalePyramid = [0.65, 0.85, 1.00, 1.20, 1.45];

  let bestMatch = null;
  let bestScore = -1;

  for (const layout of layoutFamilies) {
    for (const scale of scalePyramid) {
      const s = Math.max(16, Math.min(Math.round(layout.baseSize * scale), Math.min(width, height) - 8));
      const pos = layout.calcPos(s);
      const { score } = evaluateCandidateMatch(imageData, width, height, bgImg, { x: pos.x, y: pos.y, size: s });
      const weightedScore = score * (layout.prior || 1.0);

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestMatch = {
          layout,
          size: s,
          scale,
          x: pos.x,
          y: pos.y,
          score: weightedScore
        };
      }
    }
  }

  const baseX = Math.max(0, width - veoBase.margin - veoBase.size);
  const baseY = Math.max(0, height - veoBase.margin - veoBase.size);

  if (bestMatch && bestMatch.score > 0.05) {
    let refinedX = bestMatch.x;
    let refinedY = bestMatch.y;
    let refinedSize = bestMatch.size;
    let refinedScore = bestMatch.score;

    const fineSizes = [
      Math.max(16, Math.round(bestMatch.size * 0.92)),
      bestMatch.size,
      Math.min(Math.min(width, height) - 8, Math.round(bestMatch.size * 1.08))
    ];
    const uniqueSizes = [...new Set(fineSizes)];

    for (const testSize of uniqueSizes) {
      for (let dy = -16; dy <= 16; dy += 4) {
        for (let dx = -16; dx <= 16; dx += 4) {
          const testX = Math.max(0, Math.min(width - testSize, bestMatch.x + dx));
          const testY = Math.max(0, Math.min(height - testSize, bestMatch.y + dy));
          const { score } = evaluateCandidateMatch(imageData, width, height, bgImg, { x: testX, y: testY, size: testSize });
          const weightedScore = score * (bestMatch.layout.prior || 1.0);

          if (weightedScore > refinedScore) {
            refinedScore = weightedScore;
            refinedX = testX;
            refinedY = testY;
            refinedSize = testSize;
          }
        }
      }
    }

    const calculatedScale = Math.round((refinedSize / veoBase.size) * 100) / 100;

    return {
      matchFound: refinedScore >= 0.08,
      score: Math.min(1.0, refinedScore),
      name: `${bestMatch.layout.name} (${refinedSize}px)`,
      offsetX: refinedX - baseX,
      offsetY: refinedY - baseY,
      sizeScale: Math.max(0.5, Math.min(2.5, calculatedScale)),
      gain: bestMatch.layout.gain || 0.6,
    };
  }

  const fallbackOffset = Math.round(-24 * (baseDim / 720));
  return {
    matchFound: false,
    score: bestScore > 0 ? bestScore : 0,
    name: 'Gemini Veo (Adaptive Inset)',
    offsetX: fallbackOffset,
    offsetY: fallbackOffset,
    sizeScale: 1.0,
    gain: 0.6,
  };
}

function smoothScrollTo(element, offset = 75) {
  if (!element) return;
  setTimeout(() => {
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetY = rect.top + scrollTop - offset;
    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth'
    });
  }, 100);
}

function init() {
  initTelegramWebApp();
  initTabs();
  initImageRemover();
  initVideoRemover();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function initTabs() {
  const tabImage = document.getElementById('tab-image');
  const tabVideo = document.getElementById('tab-video');
  const panelImage = document.getElementById('panel-image');
  const panelVideo = document.getElementById('panel-video');

  if (!tabImage || !tabVideo || !panelImage || !panelVideo) return;

  function switchTab(target) {
    tgHaptic.selection();
    if (target === 'image') {
      currentTab = 'image';
      try { sessionStorage.setItem('activeTab', 'image'); } catch (e) { }
      tabImage.classList.add('active');
      tabVideo.classList.remove('active');
      panelImage.style.display = 'block';
      panelVideo.style.display = 'none';
      panelImage.classList.remove('hidden');
      panelVideo.classList.add('hidden');
    } else {
      currentTab = 'video';
      try { sessionStorage.setItem('activeTab', 'video'); } catch (e) { }
      tabVideo.classList.add('active');
      tabImage.classList.remove('active');
      panelVideo.style.display = 'block';
      panelImage.style.display = 'none';
      panelVideo.classList.remove('hidden');
      panelImage.classList.add('hidden');
    }
  }

  tabImage.onclick = (e) => {
    e.preventDefault();
    switchTab('image');
  };

  tabVideo.onclick = (e) => {
    e.preventDefault();
    switchTab('video');
  };

  try {
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab === 'video') {
      switchTab('video');
    } else if (savedTab === 'image') {
      switchTab('image');
    }
  } catch (e) { }
}

function initImageRemover() {
  const dropzone = document.getElementById('img-dropzone');
  const fileInput = document.getElementById('img-input');
  const resultsArea = document.getElementById('img-results');

  const tunerContainer = document.getElementById('img-tuner-container');
  const mainCanvas = document.getElementById('img-main-canvas');
  const zoomCanvas = document.getElementById('img-zoom-canvas');
  const zoomCleanedCanvas = document.getElementById('img-zoom-cleaned-canvas');

  const sliderGain = document.getElementById('slider-img-gain');
  const sliderScale = document.getElementById('slider-img-scale');
  const sliderOffsetX = document.getElementById('slider-img-offset-x');
  const sliderOffsetY = document.getElementById('slider-img-offset-y');

  const lblGain = document.getElementById('lbl-img-gain');
  const lblScale = document.getElementById('lbl-img-scale');
  const lblOffsetX = document.getElementById('lbl-img-offset-x');
  const lblOffsetY = document.getElementById('lbl-img-offset-y');

  const btnResetSliders = document.getElementById('btn-img-reset-sliders');
  const btnExport = document.getElementById('btn-img-export');

  if (!dropzone || !fileInput) return;

  let currentFile = null;
  let currentPreviewFrame = null;
  let currentBase = null;
  let currentOriginalBitmap = null;
  let currentDetected = null;
  let isProcessing = false;

  const currentSettings = { gain: 0.6, offsetX: -128, offsetY: -128, sizeScale: 1 };

  function setDropzoneLoading(loading, message = 'Processing image...') {
    isProcessing = loading;
    if (loading) {
      dropzone.classList.add('loading');
      dropzone.innerHTML = `
        <div class="dropzone-loader">
          <div class="dropzone-spinner"></div>
          <p class="dropzone-title text-indigo-600">${message}</p>
          <p class="dropzone-sub">Please wait, analyzing watermark...</p>
        </div>
      `;
    } else {
      dropzone.classList.remove('loading');
      dropzone.innerHTML = `
        <div class="dropzone-icon">
          <iconify-icon icon="ph:upload-simple-bold"></iconify-icon>
        </div>
        <p class="dropzone-title">Upload or drag your Gemini Image</p>
        <p class="dropzone-sub">Supports PNG, JPG, WebP</p>
      `;
    }
  }

  function updateSliderLabels() {
    if (lblGain) lblGain.textContent = `${currentSettings.gain.toFixed(2)}x`;
    if (lblScale) lblScale.textContent = `${currentSettings.sizeScale.toFixed(2)}x`;
    if (lblOffsetX) lblOffsetX.textContent = `${currentSettings.offsetX}px`;
    if (lblOffsetY) lblOffsetY.textContent = `${currentSettings.offsetY}px`;
  }

  function updateDetectBadge() {
    const badgeEl = document.getElementById('img-detect-badge');
    if (!badgeEl) return;
    if (currentDetected) {
      if (currentDetected.matchFound) {
        badgeEl.className = 'detect-badge';
        badgeEl.innerHTML = `<iconify-icon icon="ph:scan" width="16" style="color: #6366f1;"></iconify-icon> <span>Auto-Detected: <strong>${currentDetected.name}</strong> (${Math.round(currentDetected.score * 100)}% match)</span>`;
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.className = 'detect-badge warning';
        badgeEl.innerHTML = `<iconify-icon icon="ph:info" width="16" style="color: #d97706;"></iconify-icon> <span>Standard Preset Applied (${currentDetected.name})</span>`;
        badgeEl.classList.remove('hidden');
      }
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  function applyAutoSettings() {
    const w = currentPreviewFrame ? currentPreviewFrame.width : 1536;
    const h = currentPreviewFrame ? currentPreviewFrame.height : 1536;

    let p;
    if (currentDetected) {
      p = {
        gain: currentDetected.gain,
        offsetX: currentDetected.offsetX,
        offsetY: currentDetected.offsetY,
        sizeScale: currentDetected.sizeScale
      };
    } else {
      p = getAdaptiveImagePreset('new', w, h);
    }
    Object.assign(currentSettings, p);

    if (sliderOffsetX) {
      sliderOffsetX.min = -Math.round(w * 0.45);
      sliderOffsetX.max = Math.round(w * 0.2);
      sliderOffsetX.value = currentSettings.offsetX;
    }
    if (sliderOffsetY) {
      sliderOffsetY.min = -Math.round(h * 0.45);
      sliderOffsetY.max = Math.round(h * 0.2);
      sliderOffsetY.value = currentSettings.offsetY;
    }
    if (sliderGain) sliderGain.value = currentSettings.gain;
    if (sliderScale) sliderScale.value = currentSettings.sizeScale;

    updateSliderLabels();
    updateDetectBadge();
    renderTuner();
  }

  function bindSlider(element, prop, isFloat = false) {
    if (!element) return;
    element.addEventListener('input', (e) => {
      currentSettings[prop] = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      tgHaptic.selection();
      updateSliderLabels();
      renderTuner();
    });
  }

  bindSlider(sliderGain, 'gain', true);
  bindSlider(sliderScale, 'sizeScale', true);
  bindSlider(sliderOffsetX, 'offsetX', false);
  bindSlider(sliderOffsetY, 'offsetY', false);

  btnResetSliders?.addEventListener('click', () => {
    tgHaptic.impact('light');
    applyAutoSettings();
  });

  dropzone.onclick = () => {
    if (!isProcessing) fileInput.click();
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    if (!isProcessing) dropzone.classList.add('drag-over');
  };

  dropzone.ondragleave = () => dropzone.classList.remove('drag-over');

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (isProcessing) return;
    if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
  };

  fileInput.onchange = (e) => {
    if (isProcessing) return;
    if (e.target.files.length) handleImageFile(e.target.files[0]);
    fileInput.value = '';
  };

  async function grabImageFrame(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const width = bmp.width;
        const height = bmp.height;
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(bmp, 0, 0, width, height);
        const imageData = cx.getImageData(0, 0, width, height);
        bmp.close();
        return { width, height, imageData };
      } catch {
        // Fallback to Image element
      }
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, w, h);
        const imageData = cx.getImageData(0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ width: w, height: h, imageData });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image file.'));
      };
      img.src = url;
    });
  }

  function renderTuner() {
    if (!currentPreviewFrame || !mainCanvas || !watermarkEngine) return;
    const { width, height, imageData } = currentPreviewFrame;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;

    const copy = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    const { wm, roi } = cleanFrame(watermarkEngine.bg96, copy, width, height, currentBase, currentSettings);
    offscreen.getContext('2d').putImageData(copy, 0, 0);

    const maxW = 360;
    const scale = Math.min(1, maxW / width);
    mainCanvas.width = Math.round(width * scale);
    mainCanvas.height = Math.round(height * scale);
    const mctx = mainCanvas.getContext('2d');
    mctx.drawImage(offscreen, 0, 0, mainCanvas.width, mainCanvas.height);
    mctx.strokeStyle = '#6366f1';
    mctx.lineWidth = 2;
    mctx.strokeRect(wm.x * scale, wm.y * scale, wm.width * scale, wm.height * scale);

    if (zoomCanvas && currentOriginalBitmap) {
      const zctx = zoomCanvas.getContext('2d');
      zctx.imageSmoothingEnabled = false;
      zctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
      zctx.drawImage(currentOriginalBitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, zoomCanvas.width, zoomCanvas.height);
      const sx = zoomCanvas.width / roi.width;
      const sy = zoomCanvas.height / roi.height;
      zctx.strokeStyle = '#2563eb';
      zctx.lineWidth = 2;
      zctx.strokeRect((wm.x - roi.x) * sx, (wm.y - roi.y) * sy, wm.width * sx, wm.height * sy);
    }

    if (zoomCleanedCanvas) {
      const zctx = zoomCleanedCanvas.getContext('2d');
      zctx.imageSmoothingEnabled = false;
      zctx.clearRect(0, 0, zoomCleanedCanvas.width, zoomCleanedCanvas.height);

      zctx.drawImage(offscreen, roi.x, roi.y, roi.width, roi.height, 0, 0, zoomCleanedCanvas.width, zoomCleanedCanvas.height);

      const sx = zoomCleanedCanvas.width / roi.width;
      const sy = zoomCleanedCanvas.height / roi.height;
      zctx.strokeStyle = '#16a34a';
      zctx.lineWidth = 2;
      zctx.strokeRect((wm.x - roi.x) * sx, (wm.y - roi.y) * sy, wm.width * sx, wm.height * sy);
    }
  }

  async function handleImageFile(file) {
    if (!file.type.startsWith('image/')) return;
    if (isProcessing) return;

    tgHaptic.impact('medium');
    setDropzoneLoading(true, 'Processing & Detecting Watermark...');
    currentFile = file;

    resultsArea.classList.add('hidden');
    tunerContainer.classList.add('hidden');

    try {
      if (!watermarkEngine) {
        watermarkEngine = await WatermarkEngine.create();
      }

      currentPreviewFrame = await grabImageFrame(file);
      currentBase = watermarkEngine.getWatermarkInfo(currentPreviewFrame.width, currentPreviewFrame.height);
      if (currentOriginalBitmap) currentOriginalBitmap.close();
      currentOriginalBitmap = await createImageBitmap(currentPreviewFrame.imageData);

      // Run Auto-Detection
      currentDetected = detectWatermarkCandidate(currentPreviewFrame.imageData, currentPreviewFrame.width, currentPreviewFrame.height, watermarkEngine.bg96);

      tunerContainer.classList.remove('hidden');
      applyAutoSettings();
      tgHaptic.notification('success');
      smoothScrollTo(tunerContainer);
    } catch (err) {
      console.error(err);
      tgHaptic.notification('error');
    } finally {
      setDropzoneLoading(false);
    }
  }

  btnExport?.addEventListener('click', async () => {
    if (!currentFile || !watermarkEngine || !currentPreviewFrame) return;

    tgHaptic.impact('medium');
    handleExportAd();

    tunerContainer.classList.add('hidden');
    resultsArea.classList.add('hidden');

    try {
      const { width, height, imageData } = currentPreviewFrame;
      const copy = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
      cleanFrame(watermarkEngine.bg96, copy, width, height, currentBase, currentSettings);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').putImageData(copy, 0, 0);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const originalUrl = URL.createObjectURL(currentFile);
      const dataUrl = canvas.toDataURL('image/png');
      const fileName = `clean_${currentFile.name}`;

      lastCleanedImage = {
        blob: blob,
        dataUrl: dataUrl,
        fileName: fileName
      };

      resultsArea.classList.remove('hidden');
      resultsArea.innerHTML = `
        <div class="card">
          <h3 class="font-bold text-center mb-4">Image Watermark Cleaned Successfully!</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-xs mb-2">Original (${width}x${height}px)</p>
              <div class="checker p-2 text-center">
                <img src="${originalUrl}" alt="Original image with watermark (${width}x${height}px)" style="max-height: 250px; margin: 0 auto; object-fit: contain; width: 100%;" />
              </div>
            </div>
            <div>
              <p class="text-xs mb-2 text-green-600 font-bold">Cleaned Result</p>
              <div class="checker p-2 text-center">
                <img src="${dataUrl}" alt="Cleaned result image without watermark" class="saveable-image" style="max-height: 250px; margin: 0 auto; object-fit: contain; width: 100%; -webkit-touch-callout: default; user-select: auto;" />
              </div>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" class="btn btn-primary" onclick="downloadCleanedMedia('image')">
              <iconify-icon icon="ph:download-simple-bold" width="16"></iconify-icon>
              Download Cleaned PNG
            </button>
            <a href="https://t.me/share/url?url=https%3A%2F%2Fishara-madu.github.io%2Fgemini-watermark-remover%2F&text=Remove%20Google%20Gemini%20and%20Veo%20watermarks%20instantly%20with%20zero%20quality%20loss!" class="btn btn-secondary" onclick="handleShareClick(event, this.href)">
              <iconify-icon icon="logos:telegram" width="16"></iconify-icon>
              Share on Telegram
            </a>
          </div>
          <p class="text-xs text-center mt-2" style="color: var(--text-muted); font-size: 0.75rem;">
            💡 <strong>Tip:</strong> Tap <em>Download Cleaned PNG</em> to save to device, or Long-press the image to Save to Photos.
          </p>
          ${getPromoCardHtml('image')}
        </div>
      `;
      tgHaptic.notification('success');
      smoothScrollTo(resultsArea);
    } catch (err) {
      console.error(err);
      tgHaptic.notification('error');
      alert('Error exporting image: ' + err.message);
    }
  });
}

function initVideoRemover() {
  const dropzone = document.getElementById('video-dropzone');
  const fileInput = document.getElementById('video-input');
  const statusContainer = document.getElementById('video-status');
  const progressBar = document.getElementById('video-progress-bar');
  const progressText = document.getElementById('video-progress-text');
  const resultsArea = document.getElementById('video-results');

  const tunerContainer = document.getElementById('video-tuner-container');
  const mainCanvas = document.getElementById('video-main-canvas');
  const zoomCanvas = document.getElementById('video-zoom-canvas');
  const zoomCleanedCanvas = document.getElementById('video-zoom-cleaned-canvas');

  const sliderGain = document.getElementById('slider-video-gain');
  const sliderScale = document.getElementById('slider-video-scale');
  const sliderOffsetX = document.getElementById('slider-video-offset-x');
  const sliderOffsetY = document.getElementById('slider-video-offset-y');

  const lblGain = document.getElementById('lbl-video-gain');
  const lblScale = document.getElementById('lbl-video-scale');
  const lblOffsetX = document.getElementById('lbl-video-offset-x');
  const lblOffsetY = document.getElementById('lbl-video-offset-y');

  const btnResetSliders = document.getElementById('btn-video-reset-sliders');
  const btnExport = document.getElementById('btn-video-export');

  if (!dropzone || !fileInput) return;

  let currentFile = null;
  let currentPreviewFrame = null;
  let currentBase = null;
  let currentOriginalBitmap = null;
  let currentDetected = null;
  let isProcessing = false;

  const currentSettings = { gain: 0.6, offsetX: -24, offsetY: -24, sizeScale: 1 };

  function setDropzoneLoading(loading, message = 'Extracting best frame...') {
    isProcessing = loading;
    if (loading) {
      dropzone.classList.add('loading');
      dropzone.innerHTML = `
        <div class="dropzone-loader">
          <div class="dropzone-spinner"></div>
          <p class="dropzone-title text-indigo-600">${message}</p>
          <p class="dropzone-sub">Scanning video frames & auto-detecting watermark...</p>
        </div>
      `;
    } else {
      dropzone.classList.remove('loading');
      dropzone.innerHTML = `
        <div class="dropzone-icon">
          <iconify-icon icon="ph:video-bold"></iconify-icon>
        </div>
        <p class="dropzone-title">Upload or drag a Gemini Veo 3 video</p>
        <p class="dropzone-sub">Supports MP4, WebM, MOV</p>
      `;
    }
  }

  function updateSliderLabels() {
    if (lblGain) lblGain.textContent = `${currentSettings.gain.toFixed(2)}x`;
    if (lblScale) lblScale.textContent = `${currentSettings.sizeScale.toFixed(2)}x`;
    if (lblOffsetX) lblOffsetX.textContent = `${currentSettings.offsetX}px`;
    if (lblOffsetY) lblOffsetY.textContent = `${currentSettings.offsetY}px`;
  }

  function updateDetectBadge() {
    const badgeEl = document.getElementById('video-detect-badge');
    if (!badgeEl) return;
    if (currentDetected) {
      if (currentDetected.matchFound) {
        badgeEl.className = 'detect-badge';
        badgeEl.innerHTML = `<iconify-icon icon="ph:scan" width="16" style="color: #6366f1;"></iconify-icon> <span>Auto-Detected: <strong>${currentDetected.name}</strong> (${Math.round(currentDetected.score * 100)}% match)</span>`;
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.className = 'detect-badge warning';
        badgeEl.innerHTML = `<iconify-icon icon="ph:info" width="16" style="color: #d97706;"></iconify-icon> <span>Standard Preset Applied (${currentDetected.name})</span>`;
        badgeEl.classList.remove('hidden');
      }
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  function applyAutoSettings() {
    const w = currentPreviewFrame ? currentPreviewFrame.width : 720;
    const h = currentPreviewFrame ? currentPreviewFrame.height : 720;

    let p;
    if (currentDetected) {
      p = {
        gain: currentDetected.gain,
        offsetX: currentDetected.offsetX,
        offsetY: currentDetected.offsetY,
        sizeScale: currentDetected.sizeScale
      };
    } else {
      p = getAdaptiveVideoPreset('veo', w, h);
    }
    Object.assign(currentSettings, p);

    if (sliderOffsetX) {
      sliderOffsetX.min = -Math.round(w * 0.45);
      sliderOffsetX.max = Math.round(w * 0.2);
      sliderOffsetX.value = currentSettings.offsetX;
    }
    if (sliderOffsetY) {
      sliderOffsetY.min = -Math.round(h * 0.45);
      sliderOffsetY.max = Math.round(h * 0.2);
      sliderOffsetY.value = currentSettings.offsetY;
    }
    if (sliderGain) sliderGain.value = currentSettings.gain;
    if (sliderScale) sliderScale.value = currentSettings.sizeScale;

    updateSliderLabels();
    updateDetectBadge();
    renderTuner();
  }

  function bindSlider(element, prop, isFloat = false) {
    if (!element) return;
    element.addEventListener('input', (e) => {
      currentSettings[prop] = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      tgHaptic.selection();
      updateSliderLabels();
      renderTuner();
    });
  }

  bindSlider(sliderGain, 'gain', true);
  bindSlider(sliderScale, 'sizeScale', true);
  bindSlider(sliderOffsetX, 'offsetX', false);
  bindSlider(sliderOffsetY, 'offsetY', false);

  btnResetSliders?.addEventListener('click', () => {
    tgHaptic.impact('light');
    applyAutoSettings();
  });

  dropzone.onclick = () => {
    if (!isProcessing) fileInput.click();
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    if (!isProcessing) dropzone.classList.add('drag-over');
  };

  dropzone.ondragleave = () => dropzone.classList.remove('drag-over');

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (isProcessing) return;
    if (e.dataTransfer.files.length) handleVideoFile(e.dataTransfer.files[0]);
  };

  fileInput.onchange = (e) => {
    if (isProcessing) return;
    if (e.target.files.length) handleVideoFile(e.target.files[0]);
    fileInput.value = '';
  };

  function isFrameMeaningful(imageData) {
    const data = imageData.data;
    let sum = 0, sumSq = 0;
    const len = data.length;
    const step = Math.max(4, Math.floor(len / 2000) * 4);
    let samples = 0;
    for (let i = 0; i < len; i += step) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
      sumSq += lum * lum;
      samples++;
    }
    if (samples === 0) return false;
    const mean = sum / samples;
    const variance = (sumSq / samples) - (mean * mean);
    return mean > 12 && mean < 245 && variance > 10;
  }

  function grabPreviewFrame(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.src = url;

      let cleanedUp = false;
      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          URL.revokeObjectURL(url);
          v.removeAttribute('src');
          v.load();
        }
      };

      const globalTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for video frame extraction.'));
      }, 10000);

      v.onerror = () => {
        clearTimeout(globalTimeout);
        cleanup();
        reject(new Error('Could not read this video file.'));
      };

      const onReady = async () => {
        v.onloadedmetadata = null;
        v.onloadeddata = null;

        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
        const ratios = [0.35, 0.50, 0.20, 0.65, 0.10];
        const timestamps = ratios.map(r => Math.min(Math.max(duration * r, 0.05), Math.max(0.05, duration - 0.05)));

        let bestFrame = null;
        let highestVariance = -1;

        const w = v.videoWidth || 720;
        const h = v.videoHeight || 1280;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });

        const seekAndCapture = (time) => {
          return new Promise((res) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(seekTimer);
              v.removeEventListener('seeked', onSeeked);
              try {
                cx.drawImage(v, 0, 0, w, h);
                const imageData = cx.getImageData(0, 0, w, h);
                res(imageData);
              } catch {
                res(null);
              }
            };

            const onSeeked = () => {
              setTimeout(finish, 20);
            };

            const seekTimer = setTimeout(() => {
              finish();
            }, 1200);

            v.addEventListener('seeked', onSeeked, { once: true });
            try {
              if (Math.abs(v.currentTime - time) < 0.01) {
                finish();
              } else {
                v.currentTime = time;
              }
            } catch {
              finish();
            }
          });
        };

        for (const t of timestamps) {
          const imageData = await seekAndCapture(t);
          if (!imageData) continue;

          if (isFrameMeaningful(imageData)) {
            clearTimeout(globalTimeout);
            cleanup();
            resolve({ width: w, height: h, imageData });
            return;
          }

          const data = imageData.data;
          let sum = 0, sumSq = 0, samples = 0;
          const step = Math.max(4, Math.floor(data.length / 1000) * 4);
          for (let i = 0; i < data.length; i += step) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            sum += lum;
            sumSq += lum * lum;
            samples++;
          }
          const mean = sum / (samples || 1);
          const variance = (sumSq / (samples || 1)) - (mean * mean);
          if (variance > highestVariance) {
            highestVariance = variance;
            bestFrame = imageData;
          }
        }

        clearTimeout(globalTimeout);
        cleanup();
        if (bestFrame) {
          resolve({ width: w, height: h, imageData: bestFrame });
        } else {
          reject(new Error('Could not extract a readable frame from this video.'));
        }
      };

      if (v.readyState >= 1) {
        onReady();
      } else {
        v.onloadedmetadata = onReady;
        v.onloadeddata = onReady;
      }
    });
  }

  function renderTuner() {
    if (!currentPreviewFrame || !mainCanvas || !videoEngine) return;
    const { width, height, imageData } = currentPreviewFrame;

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;

    const copy = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    const { wm, roi } = cleanFrame(videoEngine.sparkleImage, copy, width, height, currentBase, currentSettings);
    offscreen.getContext('2d').putImageData(copy, 0, 0);

    const maxW = 360;
    const scale = Math.min(1, maxW / width);
    mainCanvas.width = Math.round(width * scale);
    mainCanvas.height = Math.round(height * scale);
    const mctx = mainCanvas.getContext('2d');
    mctx.drawImage(offscreen, 0, 0, mainCanvas.width, mainCanvas.height);
    mctx.strokeStyle = '#6366f1';
    mctx.lineWidth = 2;
    mctx.strokeRect(wm.x * scale, wm.y * scale, wm.width * scale, wm.height * scale);

    if (zoomCanvas && currentOriginalBitmap) {
      const zctx = zoomCanvas.getContext('2d');
      zctx.imageSmoothingEnabled = false;
      zctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
      zctx.drawImage(currentOriginalBitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, zoomCanvas.width, zoomCanvas.height);
      const sx = zoomCanvas.width / roi.width;
      const sy = zoomCanvas.height / roi.height;
      zctx.strokeStyle = '#2563eb';
      zctx.lineWidth = 2;
      zctx.strokeRect((wm.x - roi.x) * sx, (wm.y - roi.y) * sy, wm.width * sx, wm.height * sy);
    }

    if (zoomCleanedCanvas) {
      const zctx = zoomCleanedCanvas.getContext('2d');
      zctx.imageSmoothingEnabled = false;
      zctx.clearRect(0, 0, zoomCleanedCanvas.width, zoomCleanedCanvas.height);
      zctx.drawImage(offscreen, roi.x, roi.y, roi.width, roi.height, 0, 0, zoomCleanedCanvas.width, zoomCleanedCanvas.height);
      const sx = zoomCleanedCanvas.width / roi.width;
      const sy = zoomCleanedCanvas.height / roi.height;
      zctx.strokeStyle = '#16a34a';
      zctx.lineWidth = 2;
      zctx.strokeRect((wm.x - roi.x) * sx, (wm.y - roi.y) * sy, wm.width * sx, wm.height * sy);
    }
  }

  async function handleVideoFile(file) {
    if (!file.type.startsWith('video/')) return;
    if (isProcessing) return;

    tgHaptic.impact('medium');
    setDropzoneLoading(true, 'Extracting Best Frame & Analyzing...');
    currentFile = file;

    resultsArea.classList.add('hidden');
    statusContainer.classList.add('hidden');
    tunerContainer.classList.add('hidden');

    try {
      if (!videoEngine) {
        videoEngine = await VideoWatermarkEngine.create();
      }

      currentPreviewFrame = await grabPreviewFrame(file);
      currentBase = videoEngine.getVeoWatermark(currentPreviewFrame.width, currentPreviewFrame.height);
      if (currentOriginalBitmap) currentOriginalBitmap.close();
      currentOriginalBitmap = await createImageBitmap(currentPreviewFrame.imageData);

      // Run Auto-Detection on video preview frame
      currentDetected = detectVideoWatermarkCandidate(currentPreviewFrame.imageData, currentPreviewFrame.width, currentPreviewFrame.height, videoEngine.sparkleImage);

      tunerContainer.classList.remove('hidden');
      applyAutoSettings();
      tgHaptic.notification('success');
      smoothScrollTo(tunerContainer);
    } catch (err) {
      console.error(err);
      tgHaptic.notification('error');
      alert('Could not generate preview frame for video: ' + (err.message || err));
    } finally {
      setDropzoneLoading(false);
    }
  }

  btnExport?.addEventListener('click', async () => {
    if (!currentFile || !videoEngine) return;

    tgHaptic.impact('medium');
    handleExportAd();

    tunerContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    resultsArea.classList.add('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    smoothScrollTo(statusContainer);

    try {
      const res = await videoEngine.process(currentFile, {
        ...currentSettings,
        onProgress: ({ progress }) => {
          const pct = Math.round(progress * 100);
          progressBar.style.width = `${pct}%`;
          progressText.textContent = `${pct}% — keep tab open`;
        }
      });

      const fileName = `clean_${currentFile.name}`;
      lastCleanedVideo = {
        blob: res.blob,
        url: res.url,
        fileName: fileName
      };

      statusContainer.classList.add('hidden');
      resultsArea.classList.remove('hidden');

      resultsArea.innerHTML = `
        <div class="card">
          <h3 class="font-bold text-center mb-4">Video Watermark Cleaned Successfully!</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-xs mb-2">Original Video</p>
              <video src="${res.originalUrl}" controls playsinline style="width:100%; max-height:280px;"></video>
            </div>
            <div>
              <p class="text-xs mb-2 text-green-600">Cleaned Video</p>
              <video src="${res.url}" controls playsinline style="width:100%; max-height:280px;"></video>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" class="btn btn-primary" onclick="downloadCleanedMedia('video')">
              <iconify-icon icon="ph:download-simple-bold" width="16"></iconify-icon>
              Download Cleaned Video MP4
            </button>
            <a href="https://t.me/share/url?url=https%3A%2F%2Fishara-madu.github.io%2Fgemini-watermark-remover%2F&text=Remove%20Google%20Gemini%20and%20Veo%20watermarks%20instantly%20with%20zero%20quality%20loss!" class="btn btn-secondary" onclick="handleShareClick(event, this.href)">
              <iconify-icon icon="logos:telegram" width="16"></iconify-icon>
              Share on Telegram
            </a>
          </div>
          <p class="text-xs text-center mt-2" style="color: var(--text-muted); font-size: 0.75rem;">
            💡 <strong>Tip:</strong> Tap <em>Download Cleaned Video MP4</em> to save or share.
          </p>
          ${getPromoCardHtml('video')}
        </div>
      `;
      tgHaptic.notification('success');
      smoothScrollTo(resultsArea);
    } catch (err) {
      console.error(err);
      tgHaptic.notification('error');
      statusContainer.classList.add('hidden');
      tunerContainer.classList.remove('hidden');
      alert(`Video processing failed: ${err.message || err}`);
    }
  });
}

// ── Results Screen Promo Card Generator ──
function getPromoCardHtml(type = 'image') {
  return `
    <div class="results-promo-banner" data-auto-favicon="https://ishara-madu.github.io/online-image-converter/">
      <div class="results-promo-badge-row">
        <span class="results-promo-tag">
          Recommended Free Tool
        </span>
        <span class="badge-featured">100% Free &amp; Fast</span>
      </div>
      <div class="results-promo-body">
        <div class="results-promo-icon-box">
          <img src="https://ishara-madu.github.io/online-image-converter/favicon.ico"
            onerror="this.onerror=null; this.src='https://www.google.com/s2/favicons?domain=ishara-madu.github.io&amp;sz=64';"
            alt="Online Image Converter Favicon"
            class="tool-favicon-img" width="26" height="26" loading="lazy" />
        </div>
        <div class="results-promo-info">
          <h4 class="results-promo-title">Convert image formats with Online Image Converter</h4>
          <p class="results-promo-desc">Batch convert your cleaned files to WebP, PNG, JPG, AVIF, or GIF with lossless quality right in your browser.</p>
        </div>
        <a href="https://ishara-madu.github.io/online-image-converter/" target="_blank" rel="noopener noreferrer" class="results-promo-btn">
          <span>Try Image Converter</span>
          <iconify-icon icon="ph:arrow-square-out-bold" width="16"></iconify-icon>
        </a>
      </div>
    </div>
  `;
}

// ── GitHub Star Count Fetcher ──
async function fetchGitHubStars() {
  const starCountEl = document.getElementById('star-count-num');
  if (!starCountEl) return;
  try {
    const res = await fetch('https://api.github.com/repos/ishara-madu/gemini-watermark-remover');
    if (res.ok) {
      const data = await res.json();
      if (typeof data.stargazers_count === 'number') {
        starCountEl.textContent = data.stargazers_count;
      }
    }
  } catch (e) {
    console.warn('Could not fetch GitHub star count:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchGitHubStars();
  initCustomSelects();
  initMobileMenu();
  initAutoFavicons();
});
fetchGitHubStars();

// ── Automatic Favicon Resolver for Tools ──
function initAutoFavicons() {
  document.querySelectorAll('[data-auto-favicon]').forEach((el) => {
    const targetUrl = el.getAttribute('data-auto-favicon') || el.getAttribute('href');
    if (!targetUrl) return;

    const img = el.querySelector('.tool-favicon-img');
    if (!img) return;

    try {
      const parsedUrl = new URL(targetUrl, window.location.href);
      const domain = parsedUrl.hostname;
      const directFavicon = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, '')}/assets/favicon-96x96.png`;
      const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

      img.onerror = () => {
        if (img.src !== fallbackFavicon) {
          img.src = fallbackFavicon;
        }
      };

      if (!img.src || img.src.includes('undefined')) {
        img.src = directFavicon;
      }
    } catch (e) {
      console.warn('Auto favicon parsing failed:', e);
    }
  });
}

// ── Mobile Hamburger Menu & Navbar Interactions ──
function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const headerActions = document.getElementById('header-actions');
  if (!menuBtn || !headerActions) return;

  const iconHamburger = menuBtn.querySelector('.icon-hamburger');
  const iconClose = menuBtn.querySelector('.icon-close');

  const closeMenu = () => {
    headerActions.classList.remove('open');
    menuBtn.classList.remove('active');
    menuBtn.setAttribute('aria-expanded', 'false');
    if (iconHamburger && iconClose) {
      iconHamburger.classList.remove('hidden');
      iconClose.classList.add('hidden');
    }
  };

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = headerActions.classList.toggle('open');
    menuBtn.classList.toggle('active', isOpen);
    menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (iconHamburger && iconClose) {
      iconHamburger.classList.toggle('hidden', isOpen);
      iconClose.classList.toggle('hidden', !isOpen);
    }
  });

  // Close mobile menu when clicking nav links or promo links
  headerActions.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  document.addEventListener('click', (e) => {
    if (!headerActions.contains(e.target) && !menuBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Tools dropdown click toggle (for touch/click accessibility)
  const toolsDropdown = document.getElementById('tools-dropdown');
  const toolsBtn = document.getElementById('tools-dropdown-btn');
  if (toolsDropdown && toolsBtn) {
    toolsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = toolsDropdown.classList.toggle('open');
      toolsBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!toolsDropdown.contains(e.target)) {
        toolsDropdown.classList.remove('open');
        toolsBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// ── Custom Select Component Logic ──
function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach((selectEl) => {
    const targetId = selectEl.getAttribute('data-select-target');
    const nativeSelect = document.getElementById(targetId);
    if (!nativeSelect) return;

    const trigger = selectEl.querySelector('.custom-select-trigger');
    const valueDisplay = selectEl.querySelector('.custom-select-value');
    const options = selectEl.querySelectorAll('.custom-option');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach((other) => {
        if (other !== selectEl) other.classList.remove('open');
      });
      selectEl.classList.toggle('open');
    });

    options.forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        const text = opt.querySelector('.option-title').textContent;

        valueDisplay.textContent = text;
        options.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');

        nativeSelect.value = val;
        nativeSelect.dispatchEvent(new Event('change'));

        selectEl.classList.remove('open');
      });
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach((s) => s.classList.remove('open'));
  });
}
