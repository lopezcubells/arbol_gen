/* Raíces — árbol genealógico PWA. Todo se guarda en el dispositivo. */
'use strict';

const STORAGE_KEY = 'raices:v1';
const NODE_W = 168, NODE_H = 64;
const COUPLE_GAP = 22, SIB_GAP = 24, FAM_GAP = 60, ROW_H = 150, COMP_GAP = 140;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let state = { people: {}, settings: { growUp: false } };
let selectedId = null;
let layout = { pos: {}, bounds: null };
const view = { x: 0, y: 0, k: 1 };
let deferredInstall = null;

/* ======================= Datos ======================= */

const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function blankPerson(over = {}) {
  return Object.assign({
    id: uid(), name: '', surname: '', gender: '', birth: '', death: '',
    birthPlace: '', notes: '', photo: '', parents: [], partners: [],
  }, over);
}

function normalizeAll() {
  const P = state.people;
  for (const id of Object.keys(P)) {
    const p = P[id] = Object.assign(blankPerson({ id }), P[id], { id });
    p.parents = [...new Set((p.parents || []).filter(x => x !== id && P[x]))].slice(0, 2);
    p.partners = [...new Set((p.partners || []).filter(x => x !== id && P[x]))];
  }
  for (const id of Object.keys(P)) {
    for (const s of P[id].partners) if (!P[s].partners.includes(id)) P[s].partners.push(id);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state.people = d.people || {};
      state.settings = Object.assign({ growUp: false }, d.settings || {});
    }
  } catch (e) { console.warn(e); }
  normalizeAll();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar: el almacenamiento del navegador está lleno'); }
}

const people = () => Object.values(state.people);
const get = id => state.people[id];
const fullName = p => [p.name, p.surname].filter(Boolean).join(' ') || 'Sin nombre';
const childrenOf = id => people().filter(p => p.parents.includes(id)).sort(byBirth);
const year = s => { const m = String(s || '').match(/\b(\d{3,4})\b(?!.*\b\d{3,4}\b)/); return m ? +m[1] : null; };
function byBirth(a, b) { return (year(a.birth) ?? 9999) - (year(b.birth) ?? 9999); }
function siblingsOf(id) {
  const p = get(id); if (!p.parents.length) return [];
  return people().filter(o => o.id !== id && o.parents.some(x => p.parents.includes(x))).sort(byBirth);
}
function lifeSpan(p, long = false) {
  const b = long ? p.birth : year(p.birth), d = long ? p.death : year(p.death);
  if (!b && !d) return '';
  if (b && !d) return long ? `Nació ${b}` : `${b}`;
  return `${b || '?'} – ${d || '?'}`;
}
function initials(p) {
  const s = ((p.name || '')[0] || '') + ((p.surname || '')[0] || '');
  return (s || '·').toUpperCase();
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function descendants(id, acc = new Set()) {
  for (const c of childrenOf(id)) if (!acc.has(c.id)) { acc.add(c.id); descendants(c.id, acc); }
  return acc;
}
function ancestors(id, acc = new Set()) {
  for (const p of get(id).parents) if (!acc.has(p)) { acc.add(p); ancestors(p, acc); }
  return acc;
}

function linkPartners(a, b) {
  if (a === b) return;
  const A = get(a), B = get(b);
  if (!A.partners.includes(b)) A.partners.push(b);
  if (!B.partners.includes(a)) B.partners.push(a);
}
function unlinkPartners(a, b) {
  get(a).partners = get(a).partners.filter(x => x !== b);
  get(b).partners = get(b).partners.filter(x => x !== a);
}
function addParent(childId, parentId) {
  const c = get(childId);
  if (c.parents.includes(parentId)) return true;
  if (c.parents.length >= 2) { toast('Esta persona ya tiene dos progenitores'); return false; }
  if (descendants(childId).has(parentId) || parentId === childId) { toast('Ese vínculo crearía un círculo en el árbol'); return false; }
  const other = c.parents[0];
  c.parents.push(parentId);
  if (other) linkPartners(other, parentId);
  return true;
}
function removePerson(id) {
  delete state.people[id];
  for (const p of people()) {
    p.parents = p.parents.filter(x => x !== id);
    p.partners = p.partners.filter(x => x !== id);
  }
}

/* ======================= Disposición del árbol ======================= */

function computeLayout() {
  const P = state.people, ids = Object.keys(P);
  const kids = {};
  ids.forEach(id => kids[id] = []);
  ids.forEach(id => P[id].parents.forEach(p => kids[p] && kids[p].push(id)));
  ids.forEach(id => kids[id].sort((a, b) => byBirth(P[a], P[b])));

  // Generaciones y componentes conexos
  const gen = {}, comps = [];
  for (const start of ids) {
    if (gen[start] !== undefined) continue;
    const members = [], q = [start];
    gen[start] = 0;
    while (q.length) {
      const id = q.shift(); members.push(id);
      const push = (o, g) => { if (P[o] && gen[o] === undefined) { gen[o] = g; q.push(o); } };
      P[id].partners.forEach(s => push(s, gen[id]));
      P[id].parents.forEach(p => push(p, gen[id] - 1));
      kids[id].forEach(c => push(c, gen[id] + 1));
    }
    const min = Math.min(...members.map(m => gen[m]));
    members.forEach(m => gen[m] -= min);
    comps.push(members);
  }
  comps.sort((a, b) => b.length - a.length);

  const pos = {};
  let cursor = 0, maxGen = 0;
  for (const members of comps) {
    const res = layoutComponent(members, gen, kids, P);
    let minX = Infinity, maxX = -Infinity;
    for (const id in res) { minX = Math.min(minX, res[id] - NODE_W / 2); maxX = Math.max(maxX, res[id] + NODE_W / 2); }
    for (const id in res) pos[id] = { x: res[id] - minX + cursor, gen: gen[id] };
    cursor += (maxX - minX) + COMP_GAP;
    members.forEach(m => maxGen = Math.max(maxGen, gen[m]));
  }
  const up = state.settings.growUp;
  for (const id in pos) pos[id].y = (up ? (maxGen - pos[id].gen) : pos[id].gen) * ROW_H + NODE_H / 2;
  const bounds = ids.length ? {
    minX: 0, minY: 0, maxX: Math.max(NODE_W, cursor - COMP_GAP), maxY: maxGen * ROW_H + NODE_H,
  } : null;
  return { pos, bounds, gen, kids, maxGen };
}

function layoutComponent(members, gen, kids, P) {
  // Unidades: personas unidas con su(s) pareja(s) en la misma generación
  const unitOf = {}, units = [];
  for (const id of members) {
    if (unitOf[id]) continue;
    const u = { members: [], gen: gen[id], x: 0, off: {} };
    const st = [id]; unitOf[id] = u;
    while (st.length) {
      const m = st.pop(); u.members.push(m);
      P[m].partners.forEach(s => { if (!unitOf[s] && gen[s] === gen[m]) { unitOf[s] = u; st.push(s); } });
    }
    if (u.members.length > 2) {
      const hub = u.members.reduce((a, b) => P[b].partners.length > P[a].partners.length ? b : a);
      const rest = u.members.filter(m => m !== hub);
      const left = rest.filter((_, i) => i % 2 === 1), right = rest.filter((_, i) => i % 2 === 0);
      u.members = [...left.reverse(), hub, ...right];
    }
    u.w = u.members.length * NODE_W + (u.members.length - 1) * COUPLE_GAP;
    u.parentSet = new Set(u.members.flatMap(m => P[m].parents));
    setOffsets(u);
    units.push(u);
  }
  const maxG = Math.max(...units.map(u => u.gen));
  const rows = Array.from({ length: maxG + 1 }, () => []);

  // Orden inicial por recorrido en profundidad
  const seen = new Set();
  const visit = u => {
    if (!u || seen.has(u)) return;
    seen.add(u); rows[u.gen].push(u);
    u.members.forEach(m => kids[m].forEach(c => visit(unitOf[c])));
    u.members.forEach(m => P[m].parents.forEach(p => visit(unitOf[p])));
  };
  [...members].sort((a, b) => gen[a] - gen[b]).forEach(m => visit(unitOf[m]));

  const px = id => unitOf[id].x + unitOf[id].off[id];
  const sep = (a, b) => a.w / 2 + b.w / 2 + ([...a.parentSet].some(p => b.parentSet.has(p)) ? SIB_GAP : FAM_GAP);

  function place(row, desired) {
    // Regresión isotónica (PAV) con separaciones mínimas
    const n = row.length; if (!n) return;
    const c = [0];
    for (let i = 1; i < n; i++) c[i] = c[i - 1] + sep(row[i - 1], row[i]);
    const blocks = [];
    for (let i = 0; i < n; i++) {
      blocks.push({ sum: desired[i] - c[i], cnt: 1, start: i });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.cnt <= b.sum / b.cnt) break;
        a.sum += b.sum; a.cnt += b.cnt; blocks.pop();
      }
    }
    blocks.forEach((b, bi) => {
      const end = bi + 1 < blocks.length ? blocks[bi + 1].start : n;
      for (let i = b.start; i < end; i++) row[i].x = b.sum / b.cnt + c[i];
    });
  }
  function reorderAndPlace(row, desiredOf) {
    const d = new Map(row.map(u => [u, desiredOf(u)]));
    row.sort((a, b) => d.get(a) - d.get(b));
    place(row, row.map(u => d.get(u)));
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

  // Colocación inicial compacta
  rows.forEach(row => { let x = 0; row.forEach((u, i) => { if (i) x += sep(row[i - 1], u); u.x = x; }); });

  for (let it = 0; it < 12; it++) {
    // Hacia abajo: los hijos bajo sus padres
    for (let g = 1; g <= maxG; g++) {
      rows[g].forEach(u => {
        if (u.members.length === 2) {
          const v = u.members.map(m => P[m].parents.filter(p => unitOf[p]).map(px));
          if (v[0].length && v[1].length && mean(v[0]) > mean(v[1])) { u.members.reverse(); setOffsets(u); }
        }
      });
      reorderAndPlace(rows[g], u => {
        const vals = [];
        u.members.forEach(m => {
          const ps = P[m].parents.filter(p => unitOf[p]);
          if (ps.length) vals.push(mean(ps.map(px)) - u.off[m]);
        });
        return vals.length ? mean(vals) : u.x;
      });
    }
    // Hacia arriba: los padres centrados sobre sus hijos
    for (let g = maxG - 1; g >= 0; g--) {
      reorderAndPlace(rows[g], u => {
        const vals = [], done = new Set();
        u.members.forEach(m => kids[m].forEach(c => {
          if (done.has(c) || !unitOf[c]) return; done.add(c);
          const inU = P[c].parents.filter(p => u.members.includes(p));
          vals.push(px(c) - mean(inU.map(p => u.off[p])));
        }));
        return vals.length ? mean(vals) : u.x;
      });
    }
  }

  const res = {};
  units.forEach(u => u.members.forEach(m => res[m] = u.x + u.off[m]));
  return res;
}

function setOffsets(u) {
  u.off = {};
  u.members.forEach((m, i) => u.off[m] = -u.w / 2 + NODE_W / 2 + i * (NODE_W + COUPLE_GAP));
}

/* ======================= Dibujo ======================= */

const stage = $('#stage'), world = $('#world'), linksEl = $('#links'), nodesEl = $('#nodes');

function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

function render() {
  const all = people();
  const empty = all.length === 0;
  $('#empty').hidden = !empty;
  stage.classList.toggle('is-empty', empty);
  $('#zoomCtl').style.display = empty ? 'none' : '';

  layout = computeLayout();
  updateStats();
  const { pos, gen, maxGen } = layout;
  const up = state.settings.growUp, dir = up ? -1 : 1;

  // Ramas
  let svg = '';
  const leaf = (x, y, ang, cls) =>
    `<path class="twig-leaf ${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})" d="M0 0C4-5 11-6 16 0 11 6 4 5 0 0Z"/>`;

  const drawn = new Set();
  for (const p of all) {
    for (const s of p.partners) {
      const key = [p.id, s].sort().join('|');
      if (drawn.has(key) || !pos[s]) continue; drawn.add(key);
      const a = pos[p.id], b = pos[s];
      const rel = `data-a="${p.id}" data-b="${s}"`;
      if (a.y === b.y) {
        svg += `<line class="couple" ${rel} x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
        if (Math.abs(a.x - b.x) <= NODE_W + COUPLE_GAP + 1) svg += `<circle class="bud" cx="${(a.x + b.x) / 2}" cy="${a.y}" r="3.5"/>`;
      } else {
        svg += `<path class="couple" ${rel} d="M${a.x} ${a.y}C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}"/>`;
      }
    }
  }
  for (const c of all) {
    const ps = c.parents.filter(x => pos[x]); if (!ps.length) continue;
    const cp = pos[c.id];
    let sx, sy, sy2;
    const together = ps.length === 2 && pos[ps[0]].y === pos[ps[1]].y && Math.abs(pos[ps[0]].x - pos[ps[1]].x) <= NODE_W + COUPLE_GAP + 1;
    if (together) {
      sx = (pos[ps[0]].x + pos[ps[1]].x) / 2; sy = pos[ps[0]].y; sy2 = sy + dir * NODE_H / 2;
    } else if (ps.length === 2) {
      const ys = [pos[ps[0]].y, pos[ps[1]].y];
      sx = (pos[ps[0]].x + pos[ps[1]].x) / 2; sy = sy2 = (up ? Math.min(...ys) : Math.max(...ys)) + dir * NODE_H / 2;
    } else {
      sx = pos[ps[0]].x; sy = sy2 = pos[ps[0]].y + dir * NODE_H / 2;
    }
    const ex = cp.x, ey = cp.y - dir * NODE_H / 2;
    const my = (sy2 + ey) / 2;
    const g = Math.min(...ps.map(x => gen[x]));
    const width = Math.max(1.6, 4.2 - g * 0.55);
    const d = `M${sx} ${sy}L${sx} ${sy2}C${sx} ${my} ${ex} ${my} ${ex} ${ey}`;
    svg += `<path class="branch" data-c="${c.id}" data-p="${ps.join(' ')}" stroke-width="${width.toFixed(2)}" d="${d}"/>`;

    // Una hoja posada en cada rama
    const h = hash(c.id);
    const t = 0.42 + (h % 20) / 100, mt = 1 - t;
    const bx = mt ** 3 * sx + 3 * mt * mt * t * sx + 3 * mt * t * t * ex + t ** 3 * ex;
    const by = mt ** 3 * sy2 + 3 * mt * mt * t * my + 3 * mt * t * t * my + t ** 3 * ey;
    const dxdt = 6 * mt * t * (ex - sx);
    const dydt = 3 * mt * mt * (my - sy2) + 3 * t * t * (ey - my);
    const ang = Math.atan2(dydt, dxdt) * 180 / Math.PI;
    const side = h % 2 ? 1 : -1;
    svg += leaf(bx, by, ang + side * 50, 'c' + (h % 4)).replace('class="twig-leaf', `data-c="${c.id}" class="twig-leaf`);
  }

  const b = layout.bounds;
  linksEl.setAttribute('width', b ? b.maxX : 0);
  linksEl.setAttribute('height', b ? b.maxY : 0);
  linksEl.innerHTML = svg;

  // Personas
  nodesEl.innerHTML = all.map((p, i) => {
    const q = pos[p.id];
    const cls = ['node', p.gender || 'o', p.death ? 'gone' : '', p.id === selectedId ? 'selected' : ''].join(' ');
    return `<button class="${cls}" data-id="${p.id}" style="left:${q.x - NODE_W / 2}px;top:${q.y - NODE_H / 2}px;animation-delay:${Math.min(i * 18, 400)}ms" aria-label="${esc(fullName(p))}">
      ${avatarHTML(p)}
      <span class="meta"><span class="nm">${esc(p.name || 'Sin nombre')}</span>${p.surname ? `<span class="sn">${esc(p.surname)}</span>` : ''}${lifeSpan(p) ? `<span class="yrs">${esc(lifeSpan(p))}</span>` : ''}</span>
    </button>`;
  }).join('');

  highlight();
  applyView();
}

function avatarHTML(p, cls = '') {
  return `<span class="avatar ${cls}">${p.photo ? `<img src="${p.photo}" alt="">` : esc(initials(p))}</span>`;
}

function highlight() {
  const on = !!selectedId && !!get(selectedId);
  stage.classList.toggle('dimmed', on);
  linksEl.classList.toggle('dim', on);
  $$('.node', nodesEl).forEach(n => n.classList.toggle('selected', n.dataset.id === selectedId));
  if (!on) { $$('.related', nodesEl).forEach(n => n.classList.remove('related')); $$('.hl', linksEl).forEach(n => n.classList.remove('hl')); return; }
  const rel = new Set([selectedId, ...ancestors(selectedId), ...descendants(selectedId), ...get(selectedId).partners]);
  $$('.node', nodesEl).forEach(n => n.classList.toggle('related', rel.has(n.dataset.id)));
  const line = new Set([selectedId, ...ancestors(selectedId), ...descendants(selectedId)]);
  $$('.branch, .twig-leaf', linksEl).forEach(el => el.classList.toggle('hl', line.has(el.dataset.c) && (el.dataset.p ? el.dataset.p.split(' ').some(x => line.has(x)) : true)));
  $$('.couple', linksEl).forEach(el => el.classList.toggle('hl', el.dataset.a === selectedId || el.dataset.b === selectedId));
}

function updateStats() {
  const n = people().length;
  if (!n) { $('#stats').textContent = ''; return; }
  const l = layout && layout.maxGen != null ? layout.maxGen + 1 : 1;
  $('#stats').textContent = `${n} ${n === 1 ? 'persona' : 'personas'}` + (n > 1 ? ` · ${l} ${l === 1 ? 'generación' : 'generaciones'}` : '');
}

/* ======================= Vista: mover y ampliar ======================= */

function applyView() { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; }
const clampK = k => Math.min(2.5, Math.max(0.15, k));

function zoomAt(cx, cy, f) {
  const k = clampK(view.k * f); f = k / view.k;
  view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k;
  applyView();
}

function visibleRect() {
  const w = innerWidth, h = innerHeight, open = $('#panel').classList.contains('open');
  const top = 70;
  if (open && w > 720) return { x: 0, y: top, w: w - 400, h: h - top };
  if (open) return { x: 0, y: top, w, h: Math.max(120, h - panel.offsetHeight - top) };
  return { x: 0, y: top, w, h: h - top };
}

let anim = null;
function animateTo(x, y, k, ms = 450) {
  cancelAnimationFrame(anim);
  const s = { ...view }, t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), e = ease(t);
    view.x = s.x + (x - s.x) * e; view.y = s.y + (y - s.y) * e; view.k = s.k + (k - s.k) * e;
    applyView();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function fit(animate = true) {
  const b = layout.bounds; if (!b) return;
  const r = visibleRect(), pad = 48;
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  const k = clampK(Math.min((r.w - pad * 2) / bw, (r.h - pad * 2) / bh, 1.1));
  const x = r.x + (r.w - bw * k) / 2 - b.minX * k, y = r.y + (r.h - bh * k) / 2 - b.minY * k;
  animate ? animateTo(x, y, k) : (Object.assign(view, { x, y, k }), applyView());
}

function focusPerson(id) {
  const q = layout.pos[id]; if (!q) return;
  const r = visibleRect();
  const k = Math.max(view.k, 0.85);
  animateTo(r.x + r.w / 2 - q.x * k, r.y + r.h / 2 - q.y * k, k);
}

const pointers = new Map();
let gesture = null, suppressClick = false;

stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (e.target.closest('.zoom, .empty')) return;
  cancelAnimationFrame(anim);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  suppressClick = false;
  if (pointers.size === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, id: e.pointerId };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, vx: view.x, vy: view.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, moved: true };
    suppressClick = true;
  }
});
stage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.type === 'pan') {
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) > 5) {
      gesture.moved = true; suppressClick = true; stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    }
    if (gesture.moved) { view.x = gesture.vx + dx; view.y = gesture.vy + dy; applyView(); }
  } else if (gesture.type === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const k = clampK(gesture.k * d / gesture.d), f = k / gesture.k;
    view.k = k;
    view.x = cx - (gesture.cx - gesture.vx) * f;
    view.y = cy - (gesture.cy - gesture.vy) * f;
    applyView();
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { gesture = null; stage.classList.remove('dragging'); }
  else if (pointers.size === 1 && gesture && gesture.type === 'pinch') {
    const [[id, p]] = [...pointers.entries()];
    gesture = { type: 'pan', sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: true, id };
  }
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('wheel', e => {
  if (!people().length) return;
  e.preventDefault();
  const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
  zoomAt(e.clientX, e.clientY, f);
}, { passive: false });

stage.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; return; }
  const n = e.target.closest('.node');
  if (n) { select(n.dataset.id); return; }
  if (e.target.closest('.zoom, .empty')) return;
  if (selectedId) closePanel();
});

$('#zoomIn').onclick = () => { const r = visibleRect(); zoomAt(r.x + r.w / 2, r.y + r.h / 2, 1.25); };
$('#zoomOut').onclick = () => { const r = visibleRect(); zoomAt(r.x + r.w / 2, r.y + r.h / 2, 0.8); };
$('#zoomFit').onclick = () => fit();

/* ======================= Panel ======================= */

const panel = $('#panel'), panelBody = $('#panelBody');

function openPanel() {
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
}
function closePanel() {
  panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  selectedId = null; highlight();
}
$('#panelClose').onclick = closePanel;

function select(id, focus = true) {
  selectedId = id;
  showPerson(id);
  highlight();
  if (focus) requestAnimationFrame(() => focusPerson(id));
}

function chip(p, removable) {
  return `<span class="chip ${p.gender || 'o'}" data-go="${p.id}">${avatarHTML(p)}<span class="t">${esc(fullName(p))}</span>${removable ? `<button class="x" data-unlink="${removable}" data-other="${p.id}" aria-label="Quitar vínculo"><svg class="ic"><use href="#i-close"/></svg></button>` : ''}</span>`;
}

function relationsHTML(id, editable) {
  const p = get(id);
  const groups = [
    ['Padres', p.parents.map(get), 'parent'],
    [p.partners.length > 1 ? 'Parejas' : 'Pareja', p.partners.map(get), 'partner'],
    ['Hijos', childrenOf(id), 'child'],
  ];
  if (!editable) groups.push(['Hermanos', siblingsOf(id), null]);
  return groups.filter(g => g[1].length).map(([t, list, kind]) =>
    `<div class="rel"><h3>${t}</h3><div class="chips">${list.map(o => chip(o, editable && kind)).join('')}</div></div>`).join('');
}

function showPerson(id) {
  const p = get(id); if (!p) return closePanel();
  const facts = [];
  if (p.birth) facts.push(['Nacimiento', p.birth]);
  if (p.birthPlace) facts.push(['Lugar', p.birthPlace]);
  if (p.death) facts.push(['Fallecimiento', p.death]);
  panelBody.innerHTML = `
    <div class="p-head ${p.gender || 'o'}">
      ${avatarHTML(p)}
      <h2>${esc(fullName(p))}</h2>
      ${lifeSpan(p) ? `<div class="life">${esc(lifeSpan(p))}</div>` : ''}
    </div>
    ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
    ${relationsHTML(id, false)}
    <div class="grow-actions">
      <button data-grow="parent" ${p.parents.length >= 2 ? 'disabled' : ''}><svg class="ic"><use href="#i-sprout"/></svg>Padre o madre</button>
      <button data-grow="partner"><svg class="ic"><use href="#i-leaf"/></svg>Pareja</button>
      <button data-grow="child"><svg class="ic"><use href="#i-plus"/></svg>Hijo o hija</button>
    </div>
    <div class="p-foot">
      <button class="btn ghost" data-act="edit"><svg class="ic"><use href="#i-edit"/></svg>Editar</button>
      <button class="btn ghost" data-act="focus"><svg class="ic"><use href="#i-target"/></svg>Centrar</button>
      <button class="btn ghost danger" data-act="delete"><svg class="ic"><use href="#i-trash"/></svg>Eliminar</button>
    </div>`;
  openPanel();
  panelBody.scrollTop = 0;
}

panelBody.addEventListener('click', async e => {
  const x = e.target.closest('[data-unlink]');
  if (x) {
    e.stopPropagation();
    const id = formCtx.id, other = x.dataset.other, kind = x.dataset.unlink;
    if (kind === 'parent') get(id).parents = get(id).parents.filter(v => v !== other);
    if (kind === 'child') get(other).parents = get(other).parents.filter(v => v !== id);
    if (kind === 'partner') unlinkPartners(id, other);
    save(); render();
    $('.form .rels', panelBody).innerHTML = relationsHTML(id, true);
    toast('Vínculo quitado');
    return;
  }
  const go = e.target.closest('[data-go]');
  if (go && !formCtx) { select(go.dataset.go); return; }
  const grow = e.target.closest('[data-grow]');
  if (grow) { openForm({ mode: 'new', rel: grow.dataset.grow, of: selectedId }); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const id = selectedId;
  if (act.dataset.act === 'edit') openForm({ mode: 'edit', id });
  if (act.dataset.act === 'focus') focusPerson(id);
  if (act.dataset.act === 'delete') {
    if (await confirmBox(`¿Eliminar a <b>${esc(fullName(get(id)))}</b> del árbol? Sus vínculos también se quitarán.`, 'Eliminar', true)) {
      removePerson(id); save(); closePanel(); render(); toast('Persona eliminada');
    }
  }
});

/* ======================= Formulario ======================= */

let formCtx = null, formPhoto = '';

const relTitle = { parent: 'Añadir padre o madre', partner: 'Añadir pareja', child: 'Añadir hijo o hija' };

function eligible(rel, of) {
  const o = get(of);
  let bad = new Set([of]);
  if (rel === 'parent') bad = new Set([of, ...o.parents, ...descendants(of)]);
  if (rel === 'partner') bad = new Set([of, ...o.partners]);
  if (rel === 'child') bad = new Set([of, ...childrenOf(of).map(c => c.id), ...ancestors(of)]);
  return people().filter(p => !bad.has(p.id) && !(rel === 'child' && p.parents.length >= 2))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
}

function openForm(ctx) {
  formCtx = ctx;
  const p = ctx.mode === 'edit' ? get(ctx.id) : blankPerson();
  formPhoto = p.photo || '';
  const of = ctx.of ? get(ctx.of) : null;
  const title = ctx.mode === 'edit' ? 'Editar persona' : ctx.rel ? relTitle[ctx.rel] : (people().length ? 'Añadir persona' : 'La primera semilla');
  const sub = of ? `de ${esc(fullName(of))}` : ctx.mode === 'edit' ? esc(fullName(p)) : 'Cuéntanos sobre esta persona';
  const ex = ctx.rel ? eligible(ctx.rel, ctx.of) : [];
  const otherParents = ctx.rel === 'child' ? of.partners.map(get) : [];
  const g = p.gender || '';

  panelBody.innerHTML = `
  <form class="form" id="personForm" autocomplete="off" novalidate>
    <h2>${title}</h2>
    <p class="sub">${sub}</p>
    ${ex.length ? `
      <div class="existing"><div class="field">
        <label for="fExisting">¿Ya está en el árbol?</label>
        <select id="fExisting"><option value="">— No, es alguien nuevo —</option>
          ${ex.map(o => `<option value="${o.id}">${esc(fullName(o))}${lifeSpan(o) ? ' · ' + esc(lifeSpan(o)) : ''}</option>`).join('')}
        </select>
      </div></div>` : ''}
    <div id="newFields">
      <div class="row2">
        <div class="field"><label for="fName">Nombre</label><input type="text" id="fName" value="${esc(p.name)}" autocapitalize="words"></div>
        <div class="field"><label for="fSurname">Apellidos</label><input type="text" id="fSurname" value="${esc(p.surname || (ctx.rel === 'child' && of ? of.surname : ''))}" autocapitalize="words"></div>
      </div>
      <div class="field"><span class="lbl">Género</span>
        <div class="seg" role="radiogroup">
          ${[['f', 'Mujer'], ['m', 'Hombre'], ['', 'Otro / —']].map(([v, l]) => `<label><input type="radio" name="g" value="${v}" ${g === v ? 'checked' : ''}>${l}</label>`).join('')}
        </div>
      </div>
      <div class="row2">
        <div class="field"><label for="fBirth">Nacimiento</label><input type="text" id="fBirth" value="${esc(p.birth)}" placeholder="12/03/1950 o 1950"></div>
        <div class="field"><label for="fDeath">Fallecimiento</label><input type="text" id="fDeath" value="${esc(p.death)}" placeholder="Si aplica"></div>
      </div>
      <div class="field"><label for="fPlace">Lugar de nacimiento</label><input type="text" id="fPlace" value="${esc(p.birthPlace)}" placeholder="Ciudad, país"></div>
      <div class="field"><span class="lbl">Foto</span>
        <div class="photo-field">
          <span id="fPhotoPrev" class="${g || 'o'}">${avatarHTML(p)}</span>
          <label class="btn ghost" for="fPhoto">Elegir foto</label>
          <input type="file" id="fPhoto" accept="image/*" hidden>
          <button type="button" class="btn ghost" id="fPhotoRm" ${formPhoto ? '' : 'hidden'}>Quitar</button>
        </div>
      </div>
      <div class="field"><label for="fNotes">Notas y recuerdos</label><textarea id="fNotes" placeholder="Oficio, anécdotas, dónde vivió…">${esc(p.notes)}</textarea></div>
    </div>
    ${otherParents.length ? `
      <div class="field"><label for="fOther">Otro progenitor</label>
        <select id="fOther">${otherParents.map(o => `<option value="${o.id}">${esc(fullName(o))}</option>`).join('')}<option value="">Ninguno / desconocido</option></select>
      </div>` : ''}
    ${ctx.mode === 'edit' ? `<div class="rels">${relationsHTML(ctx.id, true)}</div>` : ''}
    <div class="form-actions">
      <button type="button" class="btn ghost" id="fCancel">Cancelar</button>
      <button type="submit" class="btn primary">${ctx.mode === 'edit' ? 'Guardar' : 'Añadir al árbol'}</button>
    </div>
  </form>`;
  openPanel();
  panelBody.scrollTop = 0;

  const form = $('#personForm');
  const exSel = $('#fExisting');
  if (exSel) exSel.onchange = () => { $('#newFields').style.display = exSel.value ? 'none' : ''; };
  $$('input[name=g]', form).forEach(r => r.onchange = () => { $('#fPhotoPrev').className = r.value || 'o'; });
  $('#fPhoto').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      formPhoto = await resizeImage(f, 240);
      $('#fPhotoPrev').innerHTML = `<span class="avatar"><img src="${formPhoto}" alt=""></span>`;
      $('#fPhotoRm').hidden = false;
    } catch (_) { toast('No se pudo leer la imagen'); }
  };
  $('#fPhotoRm').onclick = () => {
    formPhoto = '';
    $('#fPhotoPrev').innerHTML = avatarHTML({ ...p, photo: '', name: $('#fName').value, surname: $('#fSurname').value });
    $('#fPhotoRm').hidden = true;
  };
  $('#fCancel').onclick = () => { const c = formCtx; formCtx = null; if (c.mode === 'edit' || c.of) showPerson(c.id || c.of); else closePanel(); };
  form.onsubmit = e => { e.preventDefault(); submitForm(); };
  if (!(window.matchMedia('(pointer: coarse)').matches)) setTimeout(() => (exSel || $('#fName')).focus(), 350);
}

function submitForm() {
  const ctx = formCtx;
  const existing = $('#fExisting') ? $('#fExisting').value : '';
  let id;
  if (existing) {
    id = existing;
  } else {
    const data = {
      name: $('#fName').value.trim(), surname: $('#fSurname').value.trim(),
      gender: ($('input[name=g]:checked') || {}).value || '',
      birth: $('#fBirth').value.trim(), death: $('#fDeath').value.trim(),
      birthPlace: $('#fPlace').value.trim(), notes: $('#fNotes').value.trim(), photo: formPhoto,
    };
    if (!data.name && !data.surname) { toast('Escribe al menos un nombre'); $('#fName').focus(); return; }
    if (ctx.mode === 'edit') { Object.assign(get(ctx.id), data); id = ctx.id; }
    else { const p = blankPerson(data); state.people[p.id] = p; id = p.id; }
  }

  if (ctx.rel === 'parent' && !addParent(ctx.of, id)) { if (!existing) delete state.people[id]; return; }
  if (ctx.rel === 'partner') linkPartners(ctx.of, id);
  if (ctx.rel === 'child') {
    const c = get(id), other = $('#fOther') ? $('#fOther').value : '';
    if (!c.parents.includes(ctx.of) && c.parents.length < 2) c.parents.push(ctx.of);
    if (other && !c.parents.includes(other) && c.parents.length < 2) c.parents.push(other);
  }

  const wasNew = ctx.mode === 'new';
  formCtx = null;
  save(); render();
  const focusId = ctx.rel && existing ? ctx.of : id;
  select(focusId);
  toast(wasNew ? (existing ? 'Vínculo creado' : 'Una hoja nueva en el árbol 🍃') : 'Cambios guardados');
}

function resizeImage(file, size) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = rej;
    img.src = url;
  });
}

/* ======================= Buscar ======================= */

const searchEl = $('#search'), searchInput = $('#searchInput'), results = $('#searchResults');
let activeIdx = -1;

function runSearch() {
  const q = norm(searchInput.value.trim());
  activeIdx = -1;
  if (!q) { results.innerHTML = ''; return; }
  const found = people().filter(p => norm(fullName(p) + ' ' + p.birthPlace).includes(q)).slice(0, 12);
  results.innerHTML = found.length
    ? found.map(p => `<li data-id="${p.id}" class="${p.gender || 'o'}" role="option">${avatarHTML(p)}<span>${esc(fullName(p))}</span><small>${esc(lifeSpan(p))}</small></li>`).join('')
    : '<li class="none">Nadie con ese nombre… todavía</li>';
  $$('.avatar', results).forEach(a => { a.style.width = a.style.height = '28px'; a.style.fontSize = '.7rem'; });
}
function pickResult(id) {
  searchInput.value = ''; results.innerHTML = ''; searchEl.classList.remove('open'); searchInput.blur();
  select(id);
}
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', e => {
  const items = $$('li[data-id]', results);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!items.length) return;
    activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
  } else if (e.key === 'Enter') {
    const li = items[Math.max(0, activeIdx)]; if (li) pickResult(li.dataset.id);
  } else if (e.key === 'Escape') { searchInput.value = ''; runSearch(); searchEl.classList.remove('open'); searchInput.blur(); }
});
results.addEventListener('pointerdown', e => { const li = e.target.closest('li[data-id]'); if (li) { e.preventDefault(); pickResult(li.dataset.id); } });
$('#btnSearch').onclick = () => { searchEl.classList.toggle('open'); if (searchEl.classList.contains('open')) searchInput.focus(); };

/* ======================= Menú, importar y exportar ======================= */

const menu = $('#menu'), btnMenu = $('#btnMenu');
function toggleMenu(open) {
  menu.hidden = !open; btnMenu.setAttribute('aria-expanded', String(open));
}
btnMenu.onclick = e => { e.stopPropagation(); toggleMenu(menu.hidden); };
document.addEventListener('click', e => {
  if (!menu.hidden && !e.target.closest('.menu-wrap')) toggleMenu(false);
  if (!e.target.closest('.search, #btnSearch')) { results.innerHTML = ''; if (!searchInput.value) searchEl.classList.remove('open'); }
});

const toggleGrow = $('#toggleGrow');
toggleGrow.onchange = () => {
  state.settings.growUp = toggleGrow.checked; save(); render(); fit();
};

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-action]'); if (!a) return;
  const act = a.dataset.action;
  if (a.closest('.menu')) toggleMenu(false);
  if (act === 'import') $('#fileInput').click();
  if (act === 'export-json') exportJSON();
  if (act === 'export-ged') exportGEDCOM();
  if (act === 'first') openForm({ mode: 'new' });
  if (act === 'install' && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; $('#menuInstall').hidden = true; }
  if (act === 'sample') {
    if (people().length && !(await confirmBox('El árbol de ejemplo reemplazará el árbol actual. ¿Quieres guardar una copia antes?', 'Reemplazar', true))) return;
    loadPeople(sampleTree()); toast('Árbol de ejemplo cargado');
  }
  if (act === 'reset') {
    if (!people().length) return;
    if (await confirmBox('Se borrará todo el árbol de este dispositivo. Esta acción no se puede deshacer.', 'Borrar todo', true)) {
      state.people = {}; save(); closePanel(); render(); toast('El árbol está listo para volver a crecer');
    }
  }
});

$('#btnAdd').onclick = () => { selectedId = null; highlight(); openForm({ mode: 'new' }); };

function loadPeople(list) {
  state.people = {};
  list.forEach(p => state.people[p.id] = p);
  normalizeAll(); save(); closePanel(); render();
  requestAnimationFrame(() => fit(false));
}

$('#fileInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const text = await f.text();
    let list;
    if (/^\s*[{[]/.test(text)) list = parseJSON(text);
    else if (/^\s*(﻿)?0\s+HEAD/m.test(text.slice(0, 500))) list = parseGedcom(text);
    else throw new Error('Formato no reconocido');
    if (!list.length) throw new Error('El archivo no contiene personas');
    if (people().length && !(await confirmBox(`Se cargarán <b>${list.length}</b> personas y reemplazarán el árbol actual.`, 'Cargar', false))) return;
    loadPeople(list);
    toast(`${list.length} personas cargadas`);
  } catch (err) {
    console.error(err);
    toast('No se pudo leer el archivo: ' + (err.message || 'formato no válido'));
  }
};

function parseJSON(text) {
  const d = JSON.parse(text);
  let list = Array.isArray(d) ? d : Array.isArray(d.people) ? d.people : d.people ? Object.values(d.people) : [];
  return list.filter(p => p && p.id).map(p => blankPerson({
    id: String(p.id), name: p.name || '', surname: p.surname || '', gender: ['f', 'm'].includes(p.gender) ? p.gender : '',
    birth: p.birth || '', death: p.death || '', birthPlace: p.birthPlace || '', notes: p.notes || '', photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') ? p.photo : '',
    parents: (p.parents || []).map(String), partners: (p.partners || []).map(String),
  }));
}

function parseGedcom(text) {
  const recs = []; let stack = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^﻿/, '').trim(); if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/); if (!m) continue;
    const lvl = +m[1], node = { xref: m[2] || null, tag: m[3].toUpperCase(), value: m[4] || '', children: [] };
    if (lvl === 0) { recs.push(node); stack = [node]; }
    else { const parent = stack[lvl - 1]; if (!parent) continue; parent.children.push(node); stack[lvl] = node; stack.length = lvl + 1; }
  }
  const sub = (n, tag) => n && n.children.find(c => c.tag === tag);
  const all = (n, tag) => n ? n.children.filter(c => c.tag === tag) : [];
  const notes = {};
  recs.filter(r => r.tag === 'NOTE' && r.xref).forEach(r => notes[r.xref] = r);
  const textOf = n => {
    if (!n) return '';
    if (/^@[^@]+@$/.test(n.value) && notes[n.value]) n = notes[n.value];
    return n.value + n.children.map(c => c.tag === 'CONT' ? '\n' + c.value : c.tag === 'CONC' ? c.value : '').join('');
  };
  const map = {}, out = [];
  for (const r of recs.filter(r => r.tag === 'INDI' && r.xref)) {
    const nm = sub(r, 'NAME');
    let given = '', surname = '';
    if (nm) {
      const mm = nm.value.match(/^([^/]*)\/?([^/]*)\/?(.*)$/);
      given = (mm ? mm[1] + ' ' + mm[3] : nm.value).replace(/\s+/g, ' ').trim();
      surname = (mm ? mm[2] : '').trim();
      if (sub(nm, 'GIVN')) given = sub(nm, 'GIVN').value.trim();
      if (sub(nm, 'SURN')) surname = sub(nm, 'SURN').value.trim();
    }
    const sex = (sub(r, 'SEX') || {}).value || '';
    const birt = sub(r, 'BIRT'), deat = sub(r, 'DEAT');
    const p = blankPerson({
      name: given, surname,
      gender: /^F/i.test(sex) ? 'f' : /^M/i.test(sex) ? 'm' : '',
      birth: (sub(birt, 'DATE') || {}).value || '',
      birthPlace: (sub(birt, 'PLAC') || {}).value || '',
      death: (sub(deat, 'DATE') || {}).value || (deat ? '?' : ''),
      notes: all(r, 'NOTE').map(textOf).filter(Boolean).join('\n\n'),
    });
    map[r.xref] = p; out.push(p);
  }
  for (const f of recs.filter(r => r.tag === 'FAM')) {
    const par = [...all(f, 'HUSB'), ...all(f, 'WIFE')].map(n => map[n.value]).filter(Boolean);
    if (par.length === 2) { par[0].partners.push(par[1].id); par[1].partners.push(par[0].id); }
    for (const c of all(f, 'CHIL')) {
      const ch = map[c.value]; if (!ch) continue;
      par.forEach(pp => { if (!ch.parents.includes(pp.id) && ch.parents.length < 2) ch.parents.push(pp.id); });
    }
  }
  return out;
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

function exportJSON() {
  if (!people().length) return toast('El árbol aún está vacío');
  download(`arbol-familiar-${stamp()}.json`, JSON.stringify({ app: 'raices', version: 1, exported: new Date().toISOString(), people: people() }, null, 2), 'application/json');
  toast('Copia guardada');
}

function exportGEDCOM() {
  if (!people().length) return toast('El árbol aún está vacío');
  const all = people(), ix = {};
  all.forEach((p, i) => ix[p.id] = `@I${i + 1}@`);
  const fams = new Map();
  const famKey = ids => [...ids].sort().join('|');
  const fam = ids => { const k = famKey(ids); if (!fams.has(k)) fams.set(k, { ids: [...ids], kids: [] }); return fams.get(k); };
  all.forEach(p => p.partners.forEach(s => fam([p.id, s])));
  all.forEach(p => { if (p.parents.length) fam(p.parents).kids.push(p.id); });
  const famList = [...fams.values()];
  famList.forEach((f, i) => f.x = `@F${i + 1}@`);
  const clean = s => String(s).replace(/[\r\n]+/g, ' ');
  const L = ['0 HEAD', '1 SOUR RAICES', '2 NAME Raices', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
  for (const p of all) {
    L.push(`0 ${ix[p.id]} INDI`, `1 NAME ${clean(p.name)} /${clean(p.surname)}/`);
    if (p.name) L.push(`2 GIVN ${clean(p.name)}`);
    if (p.surname) L.push(`2 SURN ${clean(p.surname)}`);
    if (p.gender) L.push(`1 SEX ${p.gender === 'f' ? 'F' : 'M'}`);
    if (p.birth || p.birthPlace) { L.push('1 BIRT'); if (p.birth) L.push(`2 DATE ${clean(p.birth)}`); if (p.birthPlace) L.push(`2 PLAC ${clean(p.birthPlace)}`); }
    if (p.death) { if (p.death === '?') L.push('1 DEAT Y'); else L.push('1 DEAT', `2 DATE ${clean(p.death)}`); }
    if (p.notes) p.notes.split('\n').forEach((ln, i) => L.push(i ? `2 CONT ${ln}` : `1 NOTE ${ln}`));
    famList.filter(f => f.ids.includes(p.id)).forEach(f => L.push(`1 FAMS ${f.x}`));
    famList.filter(f => f.kids.includes(p.id)).forEach(f => L.push(`1 FAMC ${f.x}`));
  }
  for (const f of famList) {
    L.push(`0 ${f.x} FAM`);
    const ps = f.ids.map(get);
    let husb = ps.find(p => p.gender === 'm'), wife = ps.find(p => p.gender === 'f' && p !== husb);
    ps.forEach(p => { if (p !== husb && p !== wife) { if (!husb) husb = p; else if (!wife) wife = p; } });
    if (husb) L.push(`1 HUSB ${ix[husb.id]}`);
    if (wife) L.push(`1 WIFE ${ix[wife.id]}`);
    f.kids.forEach(k => L.push(`1 CHIL ${ix[k]}`));
  }
  L.push('0 TRLR');
  download(`arbol-familiar-${stamp()}.ged`, L.join('\n') + '\n', 'text/plain');
  toast('GEDCOM exportado');
}

function sampleTree() {
  const P = (id, name, surname, gender, birth, death, birthPlace, parents = [], partners = [], notes = '') =>
    blankPerson({ id, name, surname, gender, birth, death, birthPlace, parents, partners, notes });
  return [
    P('a1', 'Antonio', 'García Ruiz', 'm', '1928', '2009', 'Toledo', [], ['a2'], 'Carpintero. Le encantaba cuidar del huerto los domingos.'),
    P('a2', 'Carmen', 'López Vidal', 'f', '1931', '2015', 'Ávila', [], ['a1']),
    P('b1', 'José', 'Moreno Gil', 'm', '1926', '1998', 'Córdoba', [], ['b2']),
    P('b2', 'Rosa', 'Sanz Prieto', 'f', '1930', '2020', 'Córdoba', [], ['b1'], 'Hacía la mejor tortilla de la familia.'),
    P('c1', 'Manuel', 'García López', 'm', '1955', '', 'Madrid', ['a1', 'a2'], ['c2']),
    P('c2', 'Isabel', 'Moreno Sanz', 'f', '1957', '', 'Córdoba', ['b1', 'b2'], ['c1']),
    P('c3', 'Lucía', 'García López', 'f', '1959', '', 'Madrid', ['a1', 'a2'], ['c4']),
    P('c4', 'Javier', 'Ortega Ríos', 'm', '1956', '', 'Valencia', [], ['c3']),
    P('c5', 'Pilar', 'Moreno Sanz', 'f', '1961', '', 'Córdoba', ['b1', 'b2']),
    P('d1', 'Pablo', 'García Moreno', 'm', '1984', '', 'Madrid', ['c1', 'c2'], ['d3']),
    P('d2', 'Marta', 'García Moreno', 'f', '1988', '', 'Madrid', ['c1', 'c2']),
    P('d3', 'Laura', 'Navarro Díaz', 'f', '1986', '', 'Sevilla', [], ['d1']),
    P('d4', 'Elena', 'Ortega García', 'f', '1990', '', 'Valencia', ['c3', 'c4']),
    P('e1', 'Hugo', 'García Navarro', 'm', '2016', '', 'Madrid', ['d1', 'd3']),
    P('e2', 'Alba', 'García Navarro', 'f', '2019', '', 'Madrid', ['d1', 'd3']),
  ];
}

/* ======================= Utilidades de interfaz ======================= */

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

function confirmBox(html, okLabel = 'Aceptar', danger = false) {
  const d = $('#confirm');
  $('#confirmMsg').innerHTML = html;
  const ok = $('#confirmOk'); ok.textContent = okLabel; ok.classList.toggle('danger-btn', danger);
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#confirm').open) {
    if (!menu.hidden) toggleMenu(false);
    else if (panel.classList.contains('open')) { formCtx = null; closePanel(); }
  }
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === '/') { e.preventDefault(); searchEl.classList.add('open'); searchInput.focus(); }
  if (e.key === '+' || e.key === '=') $('#zoomIn').click();
  if (e.key === '-') $('#zoomOut').click();
  if (e.key === '0') fit();
});

let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!selectedId) fit(false); }, 150); });

/* ======================= Instalación y sin conexión ======================= */

addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#menuInstall').hidden = false; });
addEventListener('appinstalled', () => { $('#menuInstall').hidden = true; toast('Raíces está instalada'); });
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ======================= Inicio ======================= */

load();
toggleGrow.checked = !!state.settings.growUp;
render();
requestAnimationFrame(() => fit(false));
