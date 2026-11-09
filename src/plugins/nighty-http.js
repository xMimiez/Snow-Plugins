/*
 * Load an http:// Nighty page without handing the URL to iOS WebView.
 * WKWebView rejects cleartext with NSURLErrorDomain -1022. A plugin cannot
 * change the app's App Transport Security plist, so the document is downloaded
 * with the app's own fetch and opened as HTML.
 */

const IMPORT_RE = /(^|[^\w$])(?:import\s*(?:[^'"();\n]{0,240}?\bfrom\s*)?|import\s*\(\s*|export\s*[^'"();\n]{0,240}?\bfrom\s*)(['"])([^'"]+)\2/g;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/g;

export function isHttpPage(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'http:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

export function resolveAgainst(base, spec) {
    const raw = String(spec || '').trim();
    if (!raw || /^(?:data|blob|javascript|mailto):/i.test(raw)) return '';
    try {
        return new URL(raw, base).href;
    } catch {
        return '';
    }
}

export function sameOrigin(page, asset) {
    try {
        return new URL(page).origin === new URL(asset).origin;
    } catch {
        return false;
    }
}

export function parseSetCookie(raw) {
    if (!raw) return [];
    const parts = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[^;,=\s]+=)/);
    return parts.map(line => {
        const pair = String(line).split(';', 1)[0].trim();
        const eq = pair.indexOf('=');
        if (eq <= 0) return null;
        return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
    }).filter(Boolean);
}

export function cookieHeader(cookies) {
    return Object.entries(cookies || {}).filter(([, value]) => value != null && value !== '').map(([name, value]) => `${name}=${value}`).join('; ');
}

function attr(attrs, name) {
    const match = new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i').exec(attrs || '');
    return match ? match[2] : '';
}

export function importedSpecifiers(code) {
    const specs = [];
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(String(code)))) specs.push(match[3]);
    return specs;
}

export function rewriteSpecifiers(code, fileUrl) {
    return String(code).replace(IMPORT_RE, (full, _lead, quote, spec) => {
        if (!spec || (!spec.startsWith('.') && !spec.startsWith('/'))) return full;
        const abs = resolveAgainst(fileUrl, spec);
        if (!abs) return full;
        const quoted = quote + spec + quote;
        const at = full.lastIndexOf(quoted);
        return at < 0 ? full : full.slice(0, at) + quote + abs + quote;
    });
}

function addUrl(list, page, spec, base) {
    const abs = resolveAgainst(base || page, spec);
    if (!abs || !sameOrigin(page, abs) || abs === page || list.includes(abs)) return;
    list.push(abs);
}

function stylesheetUrls(html, page) {
    const urls = new Set();
    for (const match of String(html || '').matchAll(/<link\b([^>]*)\/?>/gi)) {
        const rel = attr(match[1], 'rel').toLowerCase();
        const href = attr(match[1], 'href');
        if (!rel.includes('stylesheet') || !href) continue;
        const abs = resolveAgainst(page, href);
        if (abs) urls.add(abs);
    }
    return urls;
}

function isStylesheet(url, html, page) {
    return stylesheetUrls(html, page).has(url) || /\.css(?:$|\?)/i.test(url);
}

export function discoverUrls(html, page, files) {
    const urls = [];
    const source = String(html || '');
    for (const match of source.matchAll(/<script\b([^>]*)>/gi)) {
        const src = attr(match[1], 'src');
        if (src) addUrl(urls, page, src, page);
    }
    for (const match of source.matchAll(/<link\b([^>]*)\/?>/gi)) {
        const rel = attr(match[1], 'rel').toLowerCase();
        const href = attr(match[1], 'href');
        if (!href) continue;
        if (rel.includes('stylesheet') || rel.includes('modulepreload')) addUrl(urls, page, href, page);
    }
    for (const [url, text] of files || []) {
        const specs = isStylesheet(url, html, page)
            ? [...String(text).matchAll(CSS_IMPORT_RE)].map(item => item[2])
            : importedSpecifiers(text);
        for (const spec of specs) addUrl(urls, page, spec, url);
    }
    return urls;
}

function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeScript(code) {
    return String(code).replace(/<\/script/gi, '<\\/script>');
}

function escapeStyle(code) {
    return String(code).replace(/<\/style/gi, '<\\/style>');
}

export function bridgeScript() {
    return `(() => { try {
if (window.__mimeNightyHttp) return;
window.__mimeNightyHttp = true;
var pending = Object.create(null);
var seq = 0;
window.__mimeNightyHttpResult = function (msg) {
  var item = pending[msg && msg.id];
  if (!item) return;
  delete pending[msg.id];
  if (msg.error) item.reject(new Error(msg.error));
  else item.resolve(msg);
};
function headersOf(input) {
  var out = {};
  if (!input) return out;
  try {
    if (typeof input.forEach === 'function') input.forEach(function (value, key) { out[String(key)] = String(value); });
    else Object.keys(input).forEach(function (key) { out[key] = String(input[key]); });
  } catch (e) {}
  return out;
}
function call(url, method, headers, body) {
  return new Promise(function (resolve, reject) {
    if (!window.ReactNativeWebView) { reject(new Error('Nighty bridge unavailable')); return; }
    var id = ++seq;
    pending[id] = { resolve: resolve, reject: reject };
    var payload = body;
    if (payload != null && typeof payload !== 'string') { try { payload = JSON.stringify(payload); } catch (e) { payload = String(payload); } }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NIGHTY_HTTP', id: id, url: url, method: method || 'GET', headers: headers || {}, body: payload || '' }));
    setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('Timed out')); } }, 20000);
  });
}
function note(url, body) {
  if (String(url).indexOf('/api/login') === -1 || !window.ReactNativeWebView) return;
  try {
    var data = JSON.parse(body);
    if (data && typeof data.access_token === 'string') window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NIGHTY_TOKEN', token: data.access_token }));
  } catch (e) {}
}
function localHttp(url) {
  try { var next = new URL(url, location.href); return next.protocol === 'http:' && next.origin === location.origin; } catch (e) { return false; }
}
var origFetch = window.fetch;
window.fetch = function (input, init) {
  var raw = typeof input === 'string' ? input : (input && input.url) || '';
  var abs; try { abs = new URL(raw, location.href).href; } catch (e) { abs = raw; }
  if (!localHttp(abs)) return origFetch ? origFetch.apply(this, arguments) : Promise.reject(new Error('fetch unavailable'));
  var method = (init && init.method) || (input && input.method) || 'GET';
  var headers = headersOf((init && init.headers) || (input && input.headers));
  return call(abs, method, headers, init && init.body).then(function (msg) {
    note(abs, msg.body || '');
    return new Response(msg.body || '', { status: msg.status || 200, headers: msg.headers || { 'content-type': 'text/plain' } });
  });
};
var XHR = window.XMLHttpRequest;
if (XHR && XHR.prototype) {
  var open = XHR.prototype.open;
  var send = XHR.prototype.send;
  XHR.prototype.open = function (method, url) { this.__mimeHttp = { method: method, url: url }; return open.apply(this, arguments); };
  XHR.prototype.send = function (body) {
    var info = this.__mimeHttp || {};
    var abs; try { abs = new URL(info.url || '', location.href).href; } catch (e) { abs = info.url || ''; }
    if (!localHttp(abs)) return send.apply(this, arguments);
    var xhr = this;
    call(abs, info.method, {}, body).then(function (msg) {
      note(abs, msg.body || '');
      try { Object.defineProperty(xhr, 'readyState', { configurable: true, get: function () { return 4; } }); } catch (e) {}
      try { Object.defineProperty(xhr, 'status', { configurable: true, get: function () { return msg.status || 200; } }); } catch (e) {}
      try { Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return msg.body || ''; } }); } catch (e) {}
      try { Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return msg.body || ''; } }); } catch (e) {}
      if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
      if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('load'));
    }).catch(function () { if (typeof xhr.onerror === 'function') xhr.onerror(); });
  };
}
} catch (e) {} })();`;
}

export function buildCleartextDocument(html, page, files) {
    const assets = files instanceof Map ? files : new Map(Object.entries(files || {}));
    let body = String(html || '').replace(/<base\b[^>]*>/gi, '');
    const classic = [];
    const modules = [];
    body = body.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, code) => {
        const src = attr(attrs, 'src');
        const module = /type\s*=\s*(['"])module\1/i.test(attrs) || /\btype\s*=\s*module\b/i.test(attrs);
        if (src) {
            const abs = resolveAgainst(page, src);
            if (!abs || !sameOrigin(page, abs) || !assets.has(abs)) return full;
            if (module) modules.push(abs);
            else classic.push(assets.get(abs));
            return '';
        }
        if (module) return `<script type="module">${escapeScript(rewriteSpecifiers(code, page))}</script>`;
        return full;
    });
    const styles = [];
    body = body.replace(/<link\b([^>]*)\/?>/gi, (full, attrs) => {
        const rel = attr(attrs, 'rel').toLowerCase();
        const href = attr(attrs, 'href');
        if (!href || (!rel.includes('stylesheet') && !rel.includes('modulepreload'))) return full;
        const abs = resolveAgainst(page, href);
        if (!abs || !assets.has(abs)) return full;
        if (rel.includes('stylesheet')) styles.push(assets.get(abs));
        return '';
    });
    const imports = {};
    for (const [url, code] of assets) {
        if (isStylesheet(url, html, page)) continue;
        imports[url] = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(rewriteSpecifiers(code, url));
    }
    const map = Object.keys(imports).length ? `<script type="importmap">${JSON.stringify({ imports })}</script>` : '';
    const moduleTags = modules.map(url => `<script type="module" src="${escapeAttr(url)}"></script>`).join('');
    const classicTags = classic.map(code => `<script>${escapeScript(code)}</script>`).join('');
    const styleTags = styles.map(code => `<style>${escapeStyle(code)}</style>`).join('');
    const block = `<base href="${escapeAttr(page)}">${bridgeScript()}${styleTags}${classicTags}${map}${moduleTags}`;
    if (/<head[^>]*>/i.test(body)) return body.replace(/<head[^>]*>/i, match => match + block);
    return block + body;
}

export async function loadCleartextPage(pageHref, fetchText, options = {}) {
    const maxAssets = options.maxAssets ?? 40;
    const maxChars = options.maxChars ?? 6000000;
    const page = new URL(String(pageHref)).href;
    if (!isHttpPage(page)) throw new Error('Only an http:// address uses this loader.');
    const files = new Map();
    const html = await fetchText(page);
    let chars = String(html || '').length;
    if (chars > maxChars) throw new Error('This HTTP page is too large to open on iOS.');
    for (;;) {
        const next = discoverUrls(html, page, files).find(url => !files.has(url));
        if (!next) break;
        if (files.size >= maxAssets) throw new Error('This HTTP page has too many files to open on iOS.');
        const text = await fetchText(next);
        chars += String(text || '').length;
        if (chars > maxChars) throw new Error('This HTTP page is too large to open on iOS.');
        files.set(next, String(text || ''));
    }
    return { html: buildCleartextDocument(html, page, files), files: files.size, chars };
}
