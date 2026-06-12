const form = document.querySelector('#extractForm');
const urlInput = document.querySelector('#urlInput');
const extractBtn = document.querySelector('#extractBtn');
const statusEl = document.querySelector('#status');
const resultsPanel = document.querySelector('#resultsPanel');
const countText = document.querySelector('#countText');
const grid = document.querySelector('#grid');
const template = document.querySelector('#cardTemplate');
const selectAllBtn = document.querySelector('#selectAllBtn');
const selectNoneBtn = document.querySelector('#selectNoneBtn');
const downloadSelectedBtn = document.querySelector('#downloadSelectedBtn');
const downloadAllBtn = document.querySelector('#downloadAllBtn');
const filterBtns = Array.from(document.querySelectorAll('[data-filter]'));

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico', '.tif', '.tiff'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv', '.m3u8', '.mpd'];
const SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const SRC_ATTRS = ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-url', 'href'];

let assets = [];
let currentFilter = 'all';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const pageUrl = normalizePageUrl(urlInput.value.trim());
  if (!pageUrl) return;

  resetResults();
  setBusy(true);
  setStatus('Fetching page...');

  try {
    const html = await fetchTextWithFallback(pageUrl);
    setStatus('Finding images and videos...');
    assets = await extractMedia(html, pageUrl);
    renderAssets(assets);

    if (assets.length === 0) {
      setStatus('No image or video files found on that page. Some sites render media after JavaScript loads, which a static page cannot see.');
    } else {
      setStatus(`Found ${assets.length} media file${assets.length === 1 ? '' : 's'}.`);
    }
  } catch (error) {
    setStatus(`Could not fetch that page: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
});

selectAllBtn.addEventListener('click', () => setVisibleChecked(true));
selectNoneBtn.addEventListener('click', () => setVisibleChecked(false));
downloadSelectedBtn.addEventListener('click', () => downloadAssets(getCheckedAssets(), 'asset-goblin-selected.zip'));
downloadAllBtn.addEventListener('click', () => downloadAssets(getVisibleAssets(), 'asset-goblin-all.zip'));

filterBtns.forEach((button) => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    filterBtns.forEach((btn) => btn.classList.toggle('active', btn === button));
    applyFilter();
  });
});

function normalizePageUrl(value) {
  if (!value) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).href;
  } catch {
    setStatus('That URL does not look valid.', true);
    return '';
  }
}

function resetResults() {
  assets = [];
  grid.innerHTML = '';
  currentFilter = 'all';
  filterBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === 'all'));
  resultsPanel.hidden = true;
  countText.textContent = '0 files';
  statusEl.classList.remove('error');
}

function setBusy(isBusy) {
  extractBtn.disabled = isBusy;
  downloadSelectedBtn.disabled = isBusy;
  downloadAllBtn.disabled = isBusy;
  extractBtn.textContent = isBusy ? 'Extracting...' : 'Extract';
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function fetchTextWithFallback(url) {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } catch (directError) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxyResponse = await fetch(proxyUrl);
    if (!proxyResponse.ok) throw directError;
    return await proxyResponse.text();
  }
}

async function extractMedia(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const found = new Map();

  const addAsset = (rawUrl, type, source = '') => {
    const absoluteUrl = toAbsoluteUrl(rawUrl, pageUrl);
    if (!absoluteUrl || !/^https?:\/\//i.test(absoluteUrl)) return;

    const cleanUrl = stripTrackingHash(absoluteUrl);
    const detectedType = type || detectType(cleanUrl);
    if (!['image', 'video'].includes(detectedType)) return;

    const key = `${detectedType}:${cleanUrl}`;
    if (found.has(key)) return;

    found.set(key, {
      id: found.size + 1,
      url: cleanUrl,
      type: detectedType,
      source,
      filename: filenameFromUrl(cleanUrl, detectedType),
      dimensions: '',
    });
  };

  // Normal images.
  doc.querySelectorAll('img, image').forEach((el) => {
    SRC_ATTRS.forEach((attr) => addAsset(el.getAttribute(attr), 'image', tagSource(el, attr)));
    SRCSET_ATTRS.forEach((attr) => parseSrcset(el.getAttribute(attr)).forEach((url) => addAsset(url, 'image', tagSource(el, attr))));
  });

  // Picture/source sets.
  doc.querySelectorAll('picture source, source[type^="image"], source[srcset]').forEach((el) => {
    SRCSET_ATTRS.forEach((attr) => parseSrcset(el.getAttribute(attr)).forEach((url) => addAsset(url, 'image', tagSource(el, attr))));
    SRC_ATTRS.forEach((attr) => addAsset(el.getAttribute(attr), 'image', tagSource(el, attr)));
  });

  // Video tags and source tags.
  doc.querySelectorAll('video').forEach((el) => {
    SRC_ATTRS.forEach((attr) => addAsset(el.getAttribute(attr), 'video', tagSource(el, attr)));
    addAsset(el.getAttribute('poster'), 'image', 'video poster');
    el.querySelectorAll('source').forEach((sourceEl) => {
      SRC_ATTRS.forEach((attr) => addAsset(sourceEl.getAttribute(attr), 'video', tagSource(sourceEl, attr)));
    });
  });

  doc.querySelectorAll('source[type^="video"]').forEach((el) => {
    SRC_ATTRS.forEach((attr) => addAsset(el.getAttribute(attr), 'video', tagSource(el, attr)));
  });

  // Meta images/videos used for social sharing.
  doc.querySelectorAll('meta[content]').forEach((el) => {
    const name = `${el.getAttribute('property') || ''} ${el.getAttribute('name') || ''}`.toLowerCase();
    const content = el.getAttribute('content');
    if (name.includes('image')) addAsset(content, 'image', 'meta image');
    if (name.includes('video')) addAsset(content, 'video', 'meta video');
  });

  // Links and anchors that point directly at image/video files.
  doc.querySelectorAll('a[href], link[href]').forEach((el) => {
    const href = el.getAttribute('href');
    const type = detectType(href || '');
    if (type) addAsset(href, type, tagSource(el, 'href'));
  });

  // Inline CSS background URLs and style tags.
  doc.querySelectorAll('[style]').forEach((el) => {
    parseCssUrls(el.getAttribute('style')).forEach((url) => addAsset(url, detectType(url), 'inline CSS'));
  });

  doc.querySelectorAll('style').forEach((el) => {
    parseCssUrls(el.textContent || '').forEach((url) => addAsset(url, detectType(url), 'style tag'));
  });

  // Linked stylesheets. This is useful for CSS background images but silently skips blocked files.
  const stylesheetUrls = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))
    .map((el) => toAbsoluteUrl(el.getAttribute('href'), pageUrl))
    .filter(Boolean)
    .slice(0, 12);

  await Promise.all(stylesheetUrls.map(async (cssUrl) => {
    try {
      const css = await fetchTextWithFallback(cssUrl);
      parseCssUrls(css).forEach((url) => addAsset(toAbsoluteUrl(url, cssUrl), detectType(url), 'stylesheet'));
    } catch {
      // Ignore blocked stylesheets.
    }
  }));

  return Array.from(found.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.filename.localeCompare(b.filename);
  });
}

function tagSource(el, attr) {
  return `${el.tagName.toLowerCase()} ${attr}`;
}

function toAbsoluteUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) return '';
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return '';
  }
}

function stripTrackingHash(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function parseSrcset(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function parseCssUrls(cssText) {
  if (!cssText) return [];
  const urls = [];
  const regex = /url\((['"]?)(.*?)\1\)/gi;
  let match;
  while ((match = regex.exec(cssText))) {
    const value = match[2]?.trim();
    if (value) urls.push(value);
  }
  return urls;
}

function detectType(url) {
  const lower = (url || '').split('?')[0].toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'video';
  return '';
}

function filenameFromUrl(url, type) {
  try {
    const parsed = new URL(url);
    const raw = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const fallbackExt = type === 'video' ? 'mp4' : 'jpg';
    return sanitizeFilename(raw || `asset-${Math.random().toString(36).slice(2)}.${fallbackExt}`);
  } catch {
    return sanitizeFilename(`asset-${Date.now()}`);
  }
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|#%{}]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'asset';
}

function renderAssets(items) {
  grid.innerHTML = '';
  resultsPanel.hidden = false;

  items.forEach((asset) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = asset.id;
    node.dataset.type = asset.type;

    const check = node.querySelector('.asset-check');
    check.dataset.id = asset.id;

    const preview = node.querySelector('.preview');
    const pill = node.querySelector('.pill');
    const dims = node.querySelector('.dims');
    const filename = node.querySelector('.filename');
    const source = node.querySelector('.source');
    const downloadBtn = node.querySelector('.download-one');
    const openLink = node.querySelector('.open-link');

    pill.textContent = asset.type;
    filename.textContent = asset.filename;
    source.textContent = asset.url;
    openLink.href = asset.url;
    dims.textContent = 'checking...';

    if (asset.type === 'image') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = asset.filename;
      img.src = asset.url;
      img.addEventListener('load', () => {
        asset.dimensions = `${img.naturalWidth}×${img.naturalHeight}`;
        dims.textContent = asset.dimensions;
      });
      img.addEventListener('error', () => {
        dims.textContent = 'preview blocked';
      });
      preview.append(img);
    } else {
      const video = document.createElement('video');
      video.src = asset.url;
      video.muted = true;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', () => {
        asset.dimensions = video.videoWidth && video.videoHeight ? `${video.videoWidth}×${video.videoHeight}` : 'video';
        dims.textContent = asset.dimensions;
      });
      video.addEventListener('error', () => {
        dims.textContent = 'preview blocked';
        if (!preview.querySelector('.fallback')) {
          preview.innerHTML = '<div class="fallback">Video file</div>';
        }
      });
      preview.append(video);
    }

    downloadBtn.addEventListener('click', () => downloadSingleAsset(asset));
    grid.append(node);
  });

  applyFilter();
}

function applyFilter() {
  const cards = Array.from(grid.querySelectorAll('.card'));
  let visibleCount = 0;

  cards.forEach((card) => {
    const shouldShow = currentFilter === 'all' || card.dataset.type === currentFilter;
    card.hidden = !shouldShow;
    if (shouldShow) visibleCount += 1;
  });

  const total = assets.length;
  const visibleLabel = currentFilter === 'all' ? `${total}` : `${visibleCount} of ${total}`;
  countText.textContent = `${visibleLabel} media file${total === 1 ? '' : 's'}`;
}

function setVisibleChecked(checked) {
  grid.querySelectorAll('.card:not([hidden]) .asset-check').forEach((box) => {
    box.checked = checked;
  });
}

function getVisibleAssets() {
  const ids = Array.from(grid.querySelectorAll('.card:not([hidden])')).map((card) => Number(card.dataset.id));
  return assets.filter((asset) => ids.includes(asset.id));
}

function getCheckedAssets() {
  const ids = Array.from(grid.querySelectorAll('.card:not([hidden]) .asset-check:checked')).map((box) => Number(box.dataset.id));
  return assets.filter((asset) => ids.includes(asset.id));
}

async function downloadSingleAsset(asset) {
  setStatus(`Downloading ${asset.filename}...`);
  try {
    const blob = await fetchAssetBlob(asset.url);
    saveBlob(blob, asset.filename);
    setStatus(`Downloaded ${asset.filename}.`);
  } catch (error) {
    setStatus(`Download blocked for ${asset.filename}. Use Open, then save from the original page.`, true);
  }
}

async function downloadAssets(items, zipName) {
  if (!items.length) {
    setStatus('No media selected.', true);
    return;
  }

  if (!window.JSZip) {
    setStatus('ZIP library did not load. Check your connection and refresh.', true);
    return;
  }

  setBusy(true);
  const zip = new JSZip();
  const failed = [];
  const usedNames = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const asset = items[index];
    setStatus(`Adding ${index + 1} of ${items.length} to ZIP...`);
    try {
      const blob = await fetchAssetBlob(asset.url);
      const folder = asset.type === 'video' ? 'videos' : 'images';
      zip.folder(folder).file(uniqueFilename(asset.filename, usedNames), blob);
    } catch (error) {
      failed.push(`${asset.url} — ${error.message}`);
    }
  }

  if (failed.length) {
    zip.file('FAILED_DOWNLOADS.txt', [
      'Asset Goblin could not download these files, usually because the source blocked browser/CORS access.',
      '',
      ...failed,
    ].join('\n'));
  }

  setStatus('Making ZIP...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveBlob(zipBlob, zipName);
  setBusy(false);

  const successCount = items.length - failed.length;
  setStatus(`ZIP ready. Downloaded ${successCount} of ${items.length}${failed.length ? `; ${failed.length} blocked.` : '.'}`);
}

async function fetchAssetBlob(url) {
  try {
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.blob();
  } catch (directError) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxyResponse = await fetch(proxyUrl);
    if (!proxyResponse.ok) throw directError;
    return await proxyResponse.blob();
  }
}

function uniqueFilename(name, usedNames) {
  const clean = sanitizeFilename(name);
  if (!usedNames.has(clean)) {
    usedNames.add(clean);
    return clean;
  }

  const dotIndex = clean.lastIndexOf('.');
  const base = dotIndex > 0 ? clean.slice(0, dotIndex) : clean;
  const ext = dotIndex > 0 ? clean.slice(dotIndex) : '';
  let counter = 2;
  let candidate = `${base}-${counter}${ext}`;

  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}${ext}`;
  }

  usedNames.add(candidate);
  return candidate;
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
