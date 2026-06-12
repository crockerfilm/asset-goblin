const state = {
  sourceUrl: '',
  html: '',
  title: '',
  description: '',
  images: [],
  videos: [],
  fonts: [],
  colors: [],
  links: [],
  text: '',
  metadata: {}
};

const $ = (id) => document.getElementById(id);
const unique = (arr) => [...new Set(arr.filter(Boolean))];

function setStatus(message, type = 'normal') {
  const pill = $('statusPill');
  pill.textContent = message;
  pill.style.color = type === 'error' ? 'var(--danger)' : 'var(--muted)';
}

function normalizeUrl(value, base = '') {
  if (!value) return '';
  const clean = value.trim();
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return clean;
  try { return new URL(clean, base || window.location.href).href; }
  catch { return clean; }
}

function parseSrcset(srcset, base) {
  if (!srcset) return [];
  return srcset.split(',').map(part => normalizeUrl(part.trim().split(/\s+/)[0], base)).filter(Boolean);
}

function pickMeta(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const value = el?.getAttribute('content') || el?.getAttribute('href') || el?.textContent;
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function extractColorsFromText(text) {
  const found = [];
  const hex = text.match(/#(?:[0-9a-fA-F]{3,4}){1,2}\b/g) || [];
  found.push(...hex.map(h => h.toUpperCase()));

  const rgb = text.match(/rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi) || [];
  found.push(...rgb.map(c => c.replace(/\s+/g, '')));

  const hsl = text.match(/hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi) || [];
  found.push(...hsl.map(c => c.replace(/\s+/g, '')));

  return unique(found).slice(0, 80);
}

function extractFontNames(text) {
  const names = [];
  const familyMatches = text.match(/font-family\s*:\s*[^;}{]+/gi) || [];
  familyMatches.forEach(match => {
    match.replace(/font-family\s*:/i, '').split(',').forEach(name => {
      const cleaned = name.trim().replace(/["']/g, '');
      if (cleaned && !/^(serif|sans-serif|monospace|system-ui|inherit|initial)$/i.test(cleaned)) names.push(cleaned);
    });
  });
  return unique(names).slice(0, 60);
}

function extractFromHtml(html, baseUrl = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  state.sourceUrl = baseUrl;
  state.html = html;
  state.title = pickMeta(doc, ['meta[property="og:site_name"]', 'title', 'meta[property="og:title"]', 'meta[name="twitter:title"]']);
  state.description = pickMeta(doc, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']);

  const imageUrls = [];
  doc.querySelectorAll('img, source, picture source, meta[property="og:image"], meta[name="twitter:image"], link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(el => {
    imageUrls.push(normalizeUrl(el.getAttribute('src'), baseUrl));
    imageUrls.push(normalizeUrl(el.getAttribute('data-src'), baseUrl));
    imageUrls.push(normalizeUrl(el.getAttribute('content'), baseUrl));
    imageUrls.push(normalizeUrl(el.getAttribute('href'), baseUrl));
    imageUrls.push(...parseSrcset(el.getAttribute('srcset'), baseUrl));
    imageUrls.push(...parseSrcset(el.getAttribute('data-srcset'), baseUrl));
  });

  state.images = unique(imageUrls).map(url => ({
    url,
    filename: fileNameFromUrl(url),
    type: guessType(url)
  }));

  const videoUrls = [];
  doc.querySelectorAll('video, video source, iframe, meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').forEach(el => {
    videoUrls.push(normalizeUrl(el.getAttribute('src'), baseUrl));
    videoUrls.push(normalizeUrl(el.getAttribute('data-src'), baseUrl));
    videoUrls.push(normalizeUrl(el.getAttribute('poster'), baseUrl));
    videoUrls.push(normalizeUrl(el.getAttribute('content'), baseUrl));
  });
  state.videos = unique(videoUrls).map(url => ({ url, filename: fileNameFromUrl(url), type: guessType(url) }));

  const fontUrls = [];
  doc.querySelectorAll('link[href], style').forEach(el => {
    const href = el.getAttribute('href');
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    if (href && (rel.includes('stylesheet') || /fonts|\.css|\.woff2?|\.ttf|\.otf/i.test(href))) fontUrls.push(normalizeUrl(href, baseUrl));
    const styleText = el.textContent || '';
    const matches = styleText.match(/url\(["']?([^"')]+)["']?\)/gi) || [];
    matches.forEach(m => {
      const url = m.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '');
      if (/font|\.woff2?|\.ttf|\.otf/i.test(url)) fontUrls.push(normalizeUrl(url, baseUrl));
    });
  });

  const inlineText = html;
  const fontNames = extractFontNames(inlineText);
  state.fonts = unique([...fontUrls, ...fontNames]).map(item => ({ item, isUrl: /^https?:|^\//i.test(item) }));
  state.colors = extractColorsFromText(inlineText);

  state.links = unique([...doc.querySelectorAll('a[href]')].map(a => normalizeUrl(a.getAttribute('href'), baseUrl))).map(url => ({
    url,
    text: [...doc.querySelectorAll(`a[href]`)].find(a => normalizeUrl(a.getAttribute('href'), baseUrl) === url)?.textContent?.trim()?.slice(0, 120) || ''
  }));

  doc.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
  state.text = (doc.body?.innerText || doc.documentElement?.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  state.metadata = {
    canonical: pickMeta(doc, ['link[rel="canonical"]']),
    ogTitle: pickMeta(doc, ['meta[property="og:title"]']),
    ogType: pickMeta(doc, ['meta[property="og:type"]']),
    scannedAt: new Date().toISOString()
  };

  render();
}

function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || 'asset');
  } catch { return 'asset'; }
}

function guessType(url) {
  const ext = (url.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1];
  return ext ? ext.toUpperCase() : 'URL';
}

async function scanUrl() {
  const url = $('urlInput').value.trim();
  if (!url) return setStatus('Need a treasure map URL', 'error');
  setStatus('Sneaking into page...');
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    extractFromHtml(html, url);
    setStatus('Hoard filled');
  } catch (err) {
    setStatus('Castle gate blocked. Use Paste HTML.', 'error');
    alert(`Could not fetch this URL from the browser. This is usually caused by CORS or anti-bot protection.\n\nUse Paste HTML mode instead.\n\nDetails: ${err.message}`);
  }
}

function scanHtml() {
  const html = $('htmlInput').value.trim();
  if (!html) return setStatus('Paste the scroll first', 'error');
  extractFromHtml(html, $('baseUrlInput').value.trim());
  setStatus('Hoard filled');
}

function render() {
  $('imageCount').textContent = state.images.length;
  $('videoCount').textContent = state.videos.length;
  $('fontCount').textContent = state.fonts.length;
  $('colorCount').textContent = state.colors.length;
  $('linkCount').textContent = state.links.length;
  $('wordCount').textContent = state.text ? state.text.split(/\s+/).length : 0;

  renderBrandKit();
  renderImages();
  renderVideos();
  renderFonts();
  renderColors();
  renderLinks();
  $('contentBox').textContent = state.text || 'No page scroll text found.';
  $('contentBox').classList.toggle('empty', !state.text);

  ['downloadJsonBtn', 'downloadCsvBtn', 'copySummaryBtn', 'downloadTextBtn'].forEach(id => $(id).disabled = false);
}

function renderBrandKit() {
  const likelyLogos = state.images.filter(img => /logo|brand|mark|icon/i.test(img.url)).slice(0, 4);
  const brand = $('brandKit');
  brand.classList.remove('empty');
  brand.innerHTML = `
    <div>
      <div class="brand-title">${escapeHtml(state.title || 'Untitled page')}</div>
      <div class="brand-desc">${escapeHtml(state.description || 'No meta description found.')}</div>
    </div>
    <div>
      <strong>Top colors</strong>
      <div class="brand-row">${state.colors.slice(0, 10).map(colorSwatch).join('') || '<span class="empty">No color gems detected.</span>'}</div>
    </div>
    <div>
      <strong>Fonts / stylesheets</strong>
      <div class="brand-row">${state.fonts.slice(0, 10).map(f => `<span class="list-item">${escapeHtml(f.item)}</span>`).join('') || '<span class="empty">No font runes detected.</span>'}</div>
    </div>
    <div>
      <strong>Likely logos/icons</strong>
      <div class="brand-row">${likelyLogos.map(img => `<div class="logo-card"><img src="${escapeAttr(img.url)}" alt=""><span>${escapeHtml(img.filename)}</span></div>`).join('') || '<span class="empty">No likely logo relics detected.</span>'}</div>
    </div>
  `;
}

function renderImages() {
  const grid = $('imagesGrid');
  if (!state.images.length) return setEmpty(grid, 'No image loot found.');
  grid.classList.remove('empty');
  grid.innerHTML = state.images.map(asset => `
    <div class="asset-card">
      <img src="${escapeAttr(asset.url)}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="asset-meta"><strong>${escapeHtml(asset.filename)}</strong>${escapeHtml(asset.type)}<br>${escapeHtml(asset.url)}</div>
      <div class="asset-actions"><a href="${escapeAttr(asset.url)}" target="_blank" rel="noreferrer">Inspect</a><a href="${escapeAttr(asset.url)}" download>Bag it</a></div>
    </div>
  `).join('');
}

function renderVideos() {
  const grid = $('videosGrid');
  if (!state.videos.length) return setEmpty(grid, 'No moving-picture loot found.');
  grid.classList.remove('empty');
  grid.innerHTML = state.videos.map(asset => `
    <div class="asset-card">
      ${/youtube|vimeo|iframe|embed/i.test(asset.url) ? '<div class="asset-meta"><strong>Embedded video / iframe</strong></div>' : `<video src="${escapeAttr(asset.url)}" muted controls></video>`}
      <div class="asset-meta"><strong>${escapeHtml(asset.filename)}</strong>${escapeHtml(asset.type)}<br>${escapeHtml(asset.url)}</div>
      <div class="asset-actions"><a href="${escapeAttr(asset.url)}" target="_blank" rel="noreferrer">Inspect</a><a href="${escapeAttr(asset.url)}" download>Bag it</a></div>
    </div>
  `).join('');
}

function renderFonts() {
  const list = $('fontsList');
  if (!state.fonts.length) return setEmpty(list, 'No font runes found.');
  list.classList.remove('empty');
  list.innerHTML = state.fonts.map(f => `<div class="list-item"><strong>${f.isUrl ? 'Font / stylesheet URL' : 'Font family'}</strong>${escapeHtml(f.item)}</div>`).join('');
}

function renderColors() {
  const grid = $('colorsGrid');
  if (!state.colors.length) return setEmpty(grid, 'No color gems found.');
  grid.classList.remove('empty');
  grid.innerHTML = state.colors.map(colorSwatch).join('');
}

function colorSwatch(color) {
  return `<div class="color-card"><div class="swatch" style="background:${escapeAttr(color)}"></div><code>${escapeHtml(color)}</code></div>`;
}

function renderLinks() {
  const list = $('linksList');
  if (!state.links.length) return setEmpty(list, 'No link tunnels found.');
  list.classList.remove('empty');
  list.innerHTML = state.links.slice(0, 300).map(link => `<div class="list-item"><strong>${escapeHtml(link.text || 'Link')}</strong><a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a></div>`).join('');
}

function setEmpty(el, msg) {
  el.classList.add('empty');
  el.textContent = msg;
}

function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  return rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function assetRows() {
  return [
    ['category', 'name_or_text', 'url_or_value', 'type'],
    ...state.images.map(x => ['image', x.filename, x.url, x.type]),
    ...state.videos.map(x => ['video', x.filename, x.url, x.type]),
    ...state.fonts.map(x => ['font', x.isUrl ? 'url' : 'family', x.item, '']),
    ...state.colors.map(x => ['color', '', x, '']),
    ...state.links.map(x => ['link', x.text, x.url, ''])
  ];
}

function summaryText() {
  return `Asset Goblin Hoard Report
Source: ${state.sourceUrl || 'Pasted HTML'}
Title: ${state.title || 'N/A'}
Description: ${state.description || 'N/A'}
Images: ${state.images.length}
Videos: ${state.videos.length}
Fonts: ${state.fonts.length}
Colors: ${state.colors.length}
Links: ${state.links.length}
Words: ${state.text ? state.text.split(/\s+/).length : 0}

Top Colors:
${state.colors.slice(0, 20).join('\n')}

Fonts:
${state.fonts.slice(0, 30).map(f => f.item).join('\n')}`;
}

function downloadList(type) {
  const map = {
    images: state.images.map(x => x.url),
    videos: state.videos.map(x => x.url),
    fonts: state.fonts.map(x => x.item),
    colors: state.colors,
    links: state.links.map(x => `${x.text ? x.text + ' — ' : ''}${x.url}`)
  };
  download(`${type}.txt`, (map[type] || []).join('\n'));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }

// Events
$('scanUrlBtn').addEventListener('click', scanUrl);
$('scanHtmlBtn').addEventListener('click', scanHtml);
$('downloadJsonBtn').addEventListener('click', () => download('asset-goblin-hoard.json', JSON.stringify(state, null, 2), 'application/json'));
$('downloadCsvBtn').addEventListener('click', () => download('asset-goblin-loot.csv', toCsv(assetRows()), 'text/csv'));
$('downloadTextBtn').addEventListener('click', () => download('asset-goblin-scroll.txt', state.text || ''));
$('copySummaryBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(summaryText());
  setStatus('Goblin report copied');
});
$('clearBtn').addEventListener('click', () => location.reload());
document.querySelectorAll('[data-download-list]').forEach(btn => btn.addEventListener('click', () => downloadList(btn.dataset.downloadList)));

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.mode;
    $('urlMode').classList.toggle('hidden', mode !== 'url');
    $('htmlMode').classList.toggle('hidden', mode !== 'html');
  });
});

$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') scanUrl(); });
