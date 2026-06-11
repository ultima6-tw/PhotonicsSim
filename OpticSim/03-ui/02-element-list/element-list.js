// Element List — interactive optical element list
// Pure DOM, no Three.js dependency.
//
// createElementList(container, initialElements, onChange)
//   container      : DOM element to render into
//   initialElements: array of { type, ...params }
//   onChange(elements, selectedIdx): called on every structural change
//
// Returns: { getElements(), setElements(els), getSelectedIndex() }

const _EL_DEFAULTS = {
  free:         { type: 'free',         d: 0.20 },
  lens:         { type: 'lens',         f: 0.30 },
  thickLens:    { type: 'thickLens',    R1: 0.1, R2: -0.1, d: 0.005, n: 1.5168 },
  mirror:       { type: 'mirror',       R: Infinity },
  interface:    { type: 'interface',    n1: 1.0, n2: 1.5 },
  crystal:      { type: 'crystal',      n: 1.77, t: 0.010 },
  beamExpander: { type: 'beamExpander', mag: 2 },
};

const _EL_META = {
  free:         { badge: 'FREE',  color: '#4a9a4a' },
  lens:         { badge: 'LENS',  color: '#7ec8e3' },
  thickLens:    { badge: 'THCK',  color: '#e3c87e' },
  mirror:       { badge: 'MIRR',  color: '#aaaacc' },
  interface:    { badge: 'INTF',  color: '#e3b84a' },
  crystal:      { badge: 'XTAL',  color: '#c084fc' },
  beamExpander: { badge: 'BEXP',  color: '#7ed87e' },
};

function _thickLensEFL(el) {
  const { R1, R2, d, n } = el;
  const inv1 = isFinite(R1) ? 1 / R1 : 0;
  const inv2 = isFinite(R2) ? 1 / R2 : 0;
  const thick = (isFinite(R1) && isFinite(R2)) ? (n - 1) * d / (n * R1 * R2) : 0;
  const power = (n - 1) * (inv1 - inv2 + thick);
  return Math.abs(power) < 1e-15 ? Infinity : 1 / power;
}

function _label(el) {
  switch (el.type) {
    case 'free':   return 'Free space';
    case 'lens':   return (el.f >= 0) ? 'Converging lens (ideal)' : 'Diverging lens (ideal)';
    case 'thickLens': {
      const efl = _thickLensEFL(el);
      if (!isFinite(efl)) return 'Thick lens';
      return efl > 0 ? 'Converging thick lens' : 'Diverging thick lens';
    }
    case 'mirror':
      if (!isFinite(el.R)) return 'Flat mirror';
      return (el.R > 0) ? 'Concave mirror' : 'Convex mirror';
    case 'interface':    return 'Interface';
    case 'crystal':      return 'Crystal slab';
    case 'beamExpander': return 'Beam expander';
    default: return el.type;
  }
}

function _param(el) {
  switch (el.type) {
    case 'free':         return `${(el.d * 100).toFixed(0)} cm`;
    case 'lens':         return `f = ${(el.f * 1000).toFixed(0)} mm`;
    case 'thickLens': {
      const efl = _thickLensEFL(el);
      const eflStr = isFinite(efl) ? `EFL = ${(efl * 1000).toFixed(0)} mm` : 'EFL = ∞';
      const MAT_LABELS = { bk7: 'BK7', nsf11: 'N-SF11', fusedsilica: 'SiO₂', znse: 'ZnSe' };
      const matStr = el.material && el.material !== 'custom'
        ? `  [${MAT_LABELS[el.material] || el.material}]` : '';
      return `${eflStr}  n = ${el.n.toFixed(3)}${matStr}`;
    }
    case 'mirror':       return isFinite(el.R) ? `R = ${(el.R * 1000).toFixed(0)} mm` : 'R = ∞';
    case 'interface':    return `n ${el.n1} → ${el.n2}`;
    case 'crystal':      return `n = ${el.n.toFixed(3)}  t = ${(el.t * 1000).toFixed(1)} mm`;
    case 'beamExpander': return `×${el.mag}`;
    default: return '';
  }
}

function _injectStyles() {
  if (document.getElementById('_el-list-css')) return;
  const s = document.createElement('style');
  s.id = '_el-list-css';
  s.textContent = `
    .ell-list   { user-select:none; }
    .ell-row    { display:flex; align-items:center; gap:3px; padding:3px 0;
                  border-radius:3px; cursor:pointer; }
    .ell-row:hover { background:#0e1c28; }
    .ell-row.selected { background:#0e2234; }
    .ell-arrows { display:flex; flex-direction:column; gap:0; flex-shrink:0; }
    .ell-arr    { background:none; border:none; color:#203040; cursor:pointer;
                  font-size:0.55rem; padding:0; line-height:1.1; width:14px; text-align:center; }
    .ell-arr:hover:not(:disabled) { color:#5a9aba; }
    .ell-arr:disabled { cursor:default; }
    .ell-badge  { font-size:0.6rem; padding:2px 4px; border-radius:3px;
                  font-weight:bold; min-width:30px; text-align:center; flex-shrink:0;
                  letter-spacing:0.03em; }
    .ell-info   { flex:1; min-width:0; }
    .ell-name   { font-size:0.76rem; color:#9ab4c8; white-space:nowrap;
                  overflow:hidden; text-overflow:ellipsis; }
    .ell-pstr   { font-size:0.68rem; color:#3a6070; margin-top:1px; }
    .ell-del    { background:none; border:none; color:#1e3040; cursor:pointer;
                  font-size:0.8rem; padding:0 3px; line-height:1; flex-shrink:0; }
    .ell-del:hover { color:#cc4040; }
    .ell-empty  { color:#2a4050; font-size:0.75rem; padding:6px 0; text-align:center;
                  font-style:italic; }
    .ell-add    { display:flex; gap:4px; margin-top:7px; flex-wrap:wrap; }
    .ell-add-btn { font-size:0.62rem; padding:2px 6px; background:#080f18;
                   border:1px solid #1a2a3a; cursor:pointer; border-radius:3px;
                   font-family:monospace; transition:border-color 0.1s, color 0.1s; }
    .ell-add-btn:hover { filter:brightness(1.4); }
  `;
  document.head.appendChild(s);
}

function createElementList(container, initialElements, onChange) {
  _injectStyles();

  let items = (initialElements || []).map((el, i) => ({ ...el, _id: i }));
  let nextId = items.length;
  let selectedId = items.length ? items[0]._id : null;

  function render() {
    container.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'ell-list';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ell-empty';
      empty.textContent = 'No elements — add one below';
      list.appendChild(empty);
    }

    items.forEach((el, idx) => {
      const meta  = _EL_META[el.type] || { badge: '?', color: '#888' };
      const row   = document.createElement('div');
      row.className = 'ell-row' + (el._id === selectedId ? ' selected' : '');

      // ── Up / Down arrows ────────────────────────────────────────
      const arrows = document.createElement('div');
      arrows.className = 'ell-arrows';

      const up = document.createElement('button');
      up.className = 'ell-arr'; up.textContent = '▲'; up.disabled = idx === 0;
      up.title = 'Move up';
      up.addEventListener('click', e => { e.stopPropagation(); move(idx, -1); });

      const dn = document.createElement('button');
      dn.className = 'ell-arr'; dn.textContent = '▼'; dn.disabled = idx === items.length - 1;
      dn.title = 'Move down';
      dn.addEventListener('click', e => { e.stopPropagation(); move(idx, 1); });

      arrows.append(up, dn);

      // ── Badge ───────────────────────────────────────────────────
      const badge = document.createElement('span');
      badge.className = 'ell-badge';
      badge.style.cssText = `background:${meta.color}1a;color:${meta.color};border:1px solid ${meta.color}40;`;
      badge.textContent = meta.badge;

      // ── Info ────────────────────────────────────────────────────
      const info = document.createElement('div');
      info.className = 'ell-info';
      const name = document.createElement('div');
      name.className = 'ell-name';
      name.textContent = _label(el);
      const pstr = document.createElement('div');
      pstr.className = 'ell-pstr';
      pstr.textContent = _param(el);
      info.append(name, pstr);

      // ── Delete ──────────────────────────────────────────────────
      const del = document.createElement('button');
      del.className = 'ell-del'; del.textContent = '×'; del.title = 'Remove';
      del.addEventListener('click', e => { e.stopPropagation(); remove(el._id); });

      row.append(arrows, badge, info, del);
      row.addEventListener('click', () => select(el._id));
      list.appendChild(row);
    });

    container.appendChild(list);

    // ── Add strip ────────────────────────────────────────────────
    const strip = document.createElement('div');
    strip.className = 'ell-add';

    Object.entries(_EL_DEFAULTS).forEach(([type]) => {
      const meta = _EL_META[type] || { badge: type, color: '#888' };
      const btn = document.createElement('button');
      btn.className = 'ell-add-btn';
      btn.style.cssText = `border-color:${meta.color}40;color:${meta.color};`;
      btn.textContent = '+ ' + meta.badge;
      btn.title = `Add ${type}`;
      btn.addEventListener('click', () => addEl(type));
      strip.appendChild(btn);
    });
    container.appendChild(strip);
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function select(id) {
    selectedId = id;
    render();
    fire(false);  // selection change doesn't trigger recompute, just notifies
  }

  function addEl(type) {
    const el = { ..._EL_DEFAULTS[type], _id: nextId++ };
    items.push(el);
    selectedId = el._id;
    render();
    fire(true);
  }

  function remove(id) {
    const idx = items.findIndex(e => e._id === id);
    items = items.filter(e => e._id !== id);
    if (selectedId === id) {
      selectedId = items.length ? items[Math.min(idx, items.length - 1)]._id : null;
    }
    render();
    fire(true);
  }

  function move(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    render();
    fire(true);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function getElements() {
    return items.map(({ _id, ...rest }) => rest);
  }

  function setElements(els) {
    items = els.map((el, i) => ({ ...el, _id: nextId + i }));
    nextId += els.length;
    if (!items.find(e => e._id === selectedId)) selectedId = items.length ? items[0]._id : null;
    render();
  }

  function getSelectedIndex() {
    return items.findIndex(e => e._id === selectedId);
  }

  function getSelected() {
    return items.find(e => e._id === selectedId) || null;
  }

  function updateSelected(patch) {
    const el = items.find(e => e._id === selectedId);
    if (!el) return;
    Object.assign(el, patch);
    render();
    fire(true);
  }

  function fire(structural) {
    if (onChange) onChange(getElements(), getSelectedIndex(), structural);
  }

  render();
  return { getElements, setElements, getSelectedIndex, getSelected, updateSelected };
}

if (typeof module !== 'undefined') module.exports = { createElementList };
