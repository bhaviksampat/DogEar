pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const $ = s => document.querySelector(s);
const grid = $('#grid'), stage = $('#stage'), spread = $('#spread');

// ---------- storage: IndexedDB. "files" = uploaded PDFs, "state" = page/ink/notes/bookmarks per book
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('shelf', 1);
  r.onupgradeneeded = () => ['files', 'state'].forEach(s => r.result.createObjectStore(s, { keyPath: 'id' }));
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idb(store, fn, mode = 'readonly') {
  const db = await dbp;
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const dbGet = (s, id) => idb(s, o => o.get(id));
const dbAll = s => idb(s, o => o.getAll());
const dbPut = (s, v) => idb(s, o => o.put(v), 'readwrite');
const dbDel = (s, id) => idb(s, o => o.delete(id), 'readwrite');

// ---------- shelf
const openPdf = async b => pdfjsLib.getDocument(b.blob ? { data: await b.blob.arrayBuffer() } : b.src).promise;

async function renderCover(doc) {
  const p = await doc.getPage(1), vp = p.getViewport({ scale: 300 / p.getViewport({ scale: 1 }).width });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.8);
}

async function showLibrary() {
  $('#reader').hidden = true; $('#library').hidden = false;
  if (pdf) { await save(); pdf.destroy(); pdf = null; }
  let bundled = [];
  try { bundled = await (await fetch('books/index.json')).json(); } catch {}
  const books = [
    ...bundled.map(b => ({ id: 'b:' + b.file, name: b.title || b.file, src: 'books/' + encodeURI(b.file) })),
    ...(await dbAll('files')).map(f => ({ ...f, mine: true })),
  ];
  grid.replaceChildren(...books.map(bookCard));
  if (!books.length) grid.innerHTML = '<p class="empty">Your shelf is empty. Add a PDF to start reading.</p>';
}

function bookCard(b) {
  const el = document.createElement('div');
  el.className = 'book'; el.tabIndex = 0; el.role = 'button';
  el.innerHTML = '<div class="cover"><img alt=""></div><div class="name"></div><div class="progress"><i></i></div>';
  el.querySelector('.name').textContent = b.name;
  const img = el.querySelector('img');
  if (b.cover) img.src = b.cover;
  else openPdf(b).then(async d => { img.src = await renderCover(d); d.destroy(); }).catch(() => {});
  dbGet('state', b.id).then(s => { if (s?.pages) el.querySelector('i').style.width = (s.page / s.pages) * 100 + '%'; });
  if (b.mine) {
    const x = document.createElement('button');
    x.className = 'del'; x.textContent = '×'; x.title = 'Remove from shelf';
    x.onclick = async e => {
      e.stopPropagation();
      if (!confirm(`Remove "${b.name}" and all its notes from this device?`)) return;
      await dbDel('files', b.id); await dbDel('state', b.id); showLibrary();
    };
    el.append(x);
  }
  el.onclick = () => openBook(b);
  el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) openBook(b); };
  return el;
}

$('#upload').onchange = async e => {
  for (const f of e.target.files) {
    try {
      const buf = await f.arrayBuffer();
      // id from content hash: re-uploading the same PDF on another device matches imported notes
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
      const d = await pdfjsLib.getDocument({ data: buf }).promise;
      await dbPut('files', { id: 'u:' + hash, name: f.name.replace(/\.pdf$/i, ''), blob: f, cover: await renderCover(d) });
      d.destroy();
    } catch (err) { alert(`Couldn't add ${f.name}: ${err.message}`); }
  }
  e.target.value = '';
  showLibrary();
};

$('#exportBtn').onclick = async () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(await dbAll('state'))], { type: 'application/json' }));
  a.download = `shelf-notes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
$('#importFile').onchange = async e => {
  try {
    const list = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(list)) throw 0;
    if (confirm(`Import notes for ${list.length} book(s)? Notes for the same books on this device will be replaced.`)) {
      for (const s of list) if (s?.id && s.ink && s.notes && s.marks) await dbPut('state', s);
      showLibrary();
    }
  } catch { alert('That is not a valid notes file.'); }
  e.target.value = '';
};

// ---------- reader
let pdf = null, book, st, aspect = 0.7, page = 1, zoom = 1, tool = 'read', renderId = 0, undoStack = [];
const WIDTH = { pen: 0.003, hl: 0.03 }; // fraction of page width
const colors = { pen: '#1d3557', hl: '#ffd60a', sticky: '#fff59d' };
try { Object.assign(colors, JSON.parse(localStorage.colors || '{}')); } catch {}

const save = () => st ? dbPut('state', st) : Promise.resolve();
let saveTimer;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

async function openBook(b) {
  try { pdf = await openPdf(b); } catch (e) { return alert('Could not open this PDF: ' + e.message); }
  book = b;
  const v = (await pdf.getPage(1)).getViewport({ scale: 1 });
  aspect = v.width / v.height;
  st = (await dbGet('state', b.id)) || { id: b.id, page: 1, ink: {}, notes: {}, marks: [] };
  st.pages = pdf.numPages;
  page = Math.min(st.page || 1, pdf.numPages); zoom = 1; undoStack = [];
  $('#title').textContent = b.name;
  $('#seek').max = pdf.numPages;
  $('#notesPanel').hidden = true;
  $('#library').hidden = true; $('#reader').hidden = false;
  setTool('read');
  render();
}

// Two pages side by side when the screen is wide enough; page 1 (cover) always alone, like a real book.
const twoUp = () => pdf.numPages > 1 && stage.clientWidth / stage.clientHeight > aspect * 1.6;
function spreadOf(p) {
  if (!twoUp() || p === 1) return [p];
  const l = p - (p % 2);
  return l + 1 <= pdf.numPages ? [l, l + 1] : [l];
}
function go(p, dir = 0) {
  page = Math.max(1, Math.min(pdf.numPages, p));
  st.page = page; saveSoon();
  render(dir);
}
const next = () => { const s = spreadOf(page); if (s.at(-1) < pdf.numPages) go(s.at(-1) + 1, 1); };
const prev = () => { const s = spreadOf(page); if (s[0] > 1) go(s[0] - 1, -1); };

async function render(dir = 0) {
  const id = ++renderId, nums = spreadOf(page), dpr = window.devicePixelRatio || 1;
  const H = stage.clientHeight - 44, W = (stage.clientWidth - 44) / nums.length;
  const pages = await Promise.all(nums.map(async n => {
    const p = await pdf.getPage(n), v = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: Math.min(H / v.height, W / v.width) * zoom });
    const wrap = document.createElement('div');
    wrap.className = 'page'; wrap.dataset.n = n;
    wrap.style.width = vp.width + 'px'; wrap.style.height = vp.height + 'px';
    wrap.classList.toggle('marked', st.marks.includes(n));
    wrap.innerHTML = '<canvas class="pdf"></canvas><canvas class="ink"></canvas><div class="notes"></div>';
    for (const c of wrap.querySelectorAll('canvas')) { c.width = vp.width * dpr; c.height = vp.height * dpr; }
    await p.render({ canvasContext: wrap.firstChild.getContext('2d'), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
    return wrap;
  }));
  if (id !== renderId) return; // a newer page turn won
  pages.forEach(w => { drawInk(w); drawNotes(w); bindInk(w); });
  spread.replaceChildren(...pages);
  spread.className = '';
  if (dir) { void spread.offsetWidth; spread.className = dir > 0 ? 'turn-next' : 'turn-prev'; }
  stage.classList.toggle('zoomed', zoom > 1);
  $('#seek').value = page;
  $('#pageLabel').textContent = `Page ${nums.join('–')} of ${pdf.numPages} · ${Math.round((nums.at(-1) / pdf.numPages) * 100)}%`;
  $('#bookmark').classList.toggle('on', nums.some(n => st.marks.includes(n)));
}
const refresh = n => { const w = spread.querySelector(`.page[data-n="${n}"]`); if (w) { drawInk(w); drawNotes(w); } };

// ---------- ink (pen / highlighter / eraser). Points are stored 0..1 so they survive zoom & resize.
function drawInk(wrap) {
  const c = wrap.querySelector('.ink'), x = c.getContext('2d'), w = c.width, h = c.height;
  x.clearRect(0, 0, w, h);
  x.lineCap = x.lineJoin = 'round';
  for (const s of st.ink[wrap.dataset.n] || []) {
    x.globalAlpha = s.t === 'hl' ? 0.38 : 1;
    x.strokeStyle = s.c; x.lineWidth = s.w * w;
    x.beginPath();
    s.p.forEach(([px, py], i) => (i ? x.lineTo : x.moveTo).call(x, px * w, py * h));
    if (s.p.length === 1) x.lineTo(s.p[0][0] * w + 0.5, s.p[0][1] * h); // a dot
    x.stroke(); // one stroke() per mark, so a highlighter doesn't darken where it crosses itself
  }
}

function bindInk(wrap) {
  const ink = wrap.querySelector('.ink'), n = wrap.dataset.n;
  const pt = e => { const r = ink.getBoundingClientRect(); return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]; };
  let stroke = null, erasing = false;
  ink.onpointerdown = e => {
    if (tool === 'read' || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    if (tool === 'sticky') return addNote(n, pt(e));
    ink.setPointerCapture(e.pointerId);
    snap(n);
    if (tool === 'erase') { erasing = true; erase(n, pt(e), wrap); return; }
    stroke = { t: tool, c: colors[tool], w: WIDTH[tool], p: [pt(e)] };
    (st.ink[n] ||= []).push(stroke);
    drawInk(wrap);
  };
  // ponytail: full redraw per move is O(strokes on page); fine for hand annotation, use an incremental layer if pages get thousands of marks
  ink.onpointermove = e => {
    if (erasing) erase(n, pt(e), wrap);
    else if (stroke) { stroke.p.push(pt(e)); drawInk(wrap); }
  };
  ink.onpointerup = ink.onpointercancel = () => { if (stroke || erasing) save(); stroke = null; erasing = false; };
}

function erase(n, [x, y], wrap) {
  const list = st.ink[n] || [], kept = list.filter(s => !s.p.some(([a, b]) => Math.hypot(a - x, b - y) < 0.02));
  if (kept.length !== list.length) { st.ink[n] = kept; drawInk(wrap); }
}

// ---------- undo (snapshot of one page before each change)
function snap(n) {
  undoStack.push({ n, ink: structuredClone(st.ink[n] || []), notes: structuredClone(st.notes[n] || []) });
  if (undoStack.length > 100) undoStack.shift();
}
function undo() {
  const u = undoStack.pop();
  if (!u) return;
  st.ink[u.n] = u.ink; st.notes[u.n] = u.notes; save();
  spreadOf(page).includes(+u.n) ? refresh(u.n) : go(+u.n);
}

// ---------- sticky notes
function addNote(n, [x, y]) {
  snap(n);
  (st.notes[n] ||= []).push({ x: Math.min(x, 0.85), y: Math.min(y, 0.9), text: '', c: colors.sticky, tilt: +(Math.random() * 6 - 3).toFixed(1) });
  save(); refresh(n); setTool('read');
  spread.querySelector(`.page[data-n="${n}"] .sticky:last-child textarea`)?.focus();
}
function drawNotes(wrap) {
  const n = wrap.dataset.n;
  wrap.querySelector('.notes').replaceChildren(...(st.notes[n] || []).map(note => stickyEl(n, note, wrap)));
}
function stickyEl(n, note, wrap) {
  const el = document.createElement('div');
  el.className = 'sticky' + (note.min ? ' min' : '');
  el.style.left = note.x * 100 + '%'; el.style.top = note.y * 100 + '%'; el.style.background = note.c;
  el.style.setProperty('--tilt', note.tilt + 'deg');
  el.innerHTML = '<div class="grip" title="Drag to move · double-click to fold"><button class="x" title="Remove note">×</button></div><textarea placeholder="Write…" aria-label="Sticky note"></textarea>';
  const ta = el.querySelector('textarea'), grip = el.querySelector('.grip');
  ta.value = note.text;
  ta.oninput = () => { note.text = ta.value; saveSoon(); };
  el.querySelector('.x').onclick = () => { snap(n); st.notes[n].splice(st.notes[n].indexOf(note), 1); save(); refresh(n); };
  grip.ondblclick = () => { note.min = !note.min; el.classList.toggle('min', note.min); save(); };
  grip.onpointerdown = e => {
    if (e.target.closest('.x')) return;
    grip.setPointerCapture(e.pointerId);
    const r = wrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, nx = note.x, ny = note.y;
    let moved = false;
    grip.onpointermove = ev => {
      if (!moved) { snap(n); moved = true; }
      note.x = Math.min(0.95, Math.max(-0.1, nx + (ev.clientX - sx) / r.width));
      note.y = Math.min(0.95, Math.max(0, ny + (ev.clientY - sy) / r.height));
      el.style.left = note.x * 100 + '%'; el.style.top = note.y * 100 + '%';
    };
    grip.onpointerup = () => { grip.onpointermove = null; if (moved) save(); };
  };
  return el;
}

// ---------- tools & controls
function setTool(t) {
  tool = t; stage.dataset.tool = t;
  document.querySelectorAll('.tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const col = $('#color');
  col.hidden = !colors[t];
  if (colors[t]) col.value = colors[t];
}
document.querySelectorAll('.tools [data-tool]').forEach(b => (b.onclick = () => setTool(b.dataset.tool)));
$('#color').oninput = e => { colors[tool] = e.target.value; try { localStorage.colors = JSON.stringify(colors); } catch {} };
$('#back').onclick = showLibrary;
$('#undo').onclick = undo;
$('#zoomIn').onclick = () => { zoom = Math.min(4, zoom * 1.25); render(); };
$('#zoomOut').onclick = () => { zoom = Math.max(0.5, zoom / 1.25); render(); };
$('#seek').onchange = e => go(+e.target.value);
$('#notesBtn').onclick = toggleNotes;
$('#bookmark').onclick = () => {
  const nums = spreadOf(page), marked = nums.filter(n => st.marks.includes(n));
  st.marks = marked.length ? st.marks.filter(n => !nums.includes(n)) : [...st.marks, nums[0]];
  save();
  spread.querySelectorAll('.page').forEach(w => w.classList.toggle('marked', st.marks.includes(+w.dataset.n)));
  $('#bookmark').classList.toggle('on', !marked.length);
};

function toggleNotes() {
  const panel = $('#notesPanel');
  if (!panel.hidden) return (panel.hidden = true);
  const items = st.marks.map(n => [n, '🔖 Folded corner']);
  for (const [n, list] of Object.entries(st.notes)) for (const note of list) if (note.text.trim()) items.push([+n, '🗒️ ' + note.text]);
  for (const [n, list] of Object.entries(st.ink)) if (list.length) items.push([+n, `✒️ ${list.length} mark${list.length > 1 ? 's' : ''}`]);
  items.sort((a, b) => a[0] - b[0]);
  panel.innerHTML = '<h2>Notes & marks</h2>';
  if (!items.length) panel.insertAdjacentHTML('beforeend', '<p class="empty">Nothing yet. Pick the pen, highlighter or a sticky note and mark up a page.</p>');
  for (const [n, text] of items) {
    const b = document.createElement('button');
    b.innerHTML = `<b>p. ${n}</b>  `; b.append(text);
    b.onclick = () => { panel.hidden = true; go(n); };
    panel.append(b);
  }
  panel.hidden = false;
}

// turn pages: tap the left/right edge or swipe (in read mode); keyboard anywhere
let down = null;
stage.onpointerdown = e => { down = tool === 'read' && !e.target.closest('.sticky') ? { x: e.clientX, y: e.clientY } : null; };
stage.onpointerup = e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (zoom <= 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
    const r = stage.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
    if (fx < 0.3) prev(); else if (fx > 0.7) next();
  }
};
document.onkeydown = e => {
  if ($('#reader').hidden || e.target.matches('textarea, input')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const act = {
    ArrowRight: next, ArrowLeft: prev, PageDown: next, PageUp: prev, ' ': next,
    r: () => setTool('read'), p: () => setTool('pen'), h: () => setTool('hl'), e: () => setTool('erase'), s: () => setTool('sticky'),
    b: () => $('#bookmark').click(), n: toggleNotes, Escape: () => { setTool('read'); $('#notesPanel').hidden = true; },
  }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (act) { e.preventDefault(); act(); }
};
let resizeTimer;
addEventListener('resize', () => { if (pdf) { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => render(), 200); } });

showLibrary();
