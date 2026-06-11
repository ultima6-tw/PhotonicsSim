// Param Editor — per-element parameter editing UI
// Pure DOM, no physics dependency.
//
// createParamEditor(container, onUpdate)
//   container : DOM element to render into
//   onUpdate(patch): called when any param changes; patch = { key: siValue, ... }
// Returns: { show(element) }  — call whenever selected element changes

const _PE_CFG = {
  free: {
    title: 'Free Space',
    fields: [
      { key: 'd', label: 'Propagation distance', unit: 'cm',
        toDisp: v => (v * 100).toFixed(1),
        fromIn: s => parseFloat(s) / 100,
        step: 1, min: 0.1,
        hint: 'Must be > 0',
        presets: [2, 5, 10, 20, 30, 50, 100, 200],
      },
    ],
  },
  lens: {
    title: 'Thin Lens (ideal)',
    fields: [
      { key: 'f', label: 'Focal length', unit: 'mm',
        toDisp: v => (v * 1000).toFixed(1),
        fromIn: s => parseFloat(s) / 1000,
        step: 5,
        hint: 'Positive → converging   Negative → diverging',
        presets: [-200, -100, -50, 25, 50, 100, 150, 200, 300, 500],
      },
    ],
  },
  thickLens: {
    title: 'Thick Lens',
    fields: [
      { key: '_efl', label: 'EFL (computed)', unit: 'mm', readOnly: true,
        compute: el => {
          const { R1, R2, d, n } = el;
          const inv1  = isFinite(R1) ? 1 / R1 : 0;
          const inv2  = isFinite(R2) ? 1 / R2 : 0;
          const thick = (isFinite(R1) && isFinite(R2)) ? (n - 1) * d / (n * R1 * R2) : 0;
          const power = (n - 1) * (inv1 - inv2 + thick);
          if (Math.abs(power) < 1e-15) return '∞';
          return (1000 / power).toFixed(1);
        },
      },
      { key: 'material', label: 'Glass material', type: 'select',
        options: [
          { value: 'custom',      label: 'Custom (manual n)' },
          { value: 'bk7',         label: 'BK7' },
          { value: 'nsf11',       label: 'N-SF11' },
          { value: 'fusedsilica', label: 'Fused silica' },
          { value: 'znse',        label: 'ZnSe' },
        ],
        onSelect: (val, el) => {
          if (val === 'custom') return { material: 'custom' };
          const n = (typeof sellmeierN === 'function') ? sellmeierN(val, 1064e-9) : null;
          return { material: val, n: (n && isFinite(n)) ? n : el.n };
        },
        hint: 'Sellmeier dispersion applied per wavelength when simulating',
      },
      { key: 'R1', label: 'R₁  (front surface radius)', unit: 'mm',
        toDisp: v => isFinite(v) ? (v * 1000).toFixed(1) : '',
        fromIn: s => { const t = s.trim(); return (!t || t === '∞') ? Infinity : parseFloat(t) / 1000; },
        step: 10, placeholder: '∞ or blank = flat',
        hint: 'R₁ > 0 → convex front (biconvex/plano-convex).  Flat: blank',
        presets: [-300, -200, -100, 100, 200, 300],
      },
      { key: 'R2', label: 'R₂  (back surface radius)', unit: 'mm',
        toDisp: v => isFinite(v) ? (v * 1000).toFixed(1) : '',
        fromIn: s => { const t = s.trim(); return (!t || t === '∞') ? Infinity : parseFloat(t) / 1000; },
        step: 10, placeholder: '∞ or blank = flat',
        hint: 'R₂ < 0 → convex back (biconvex/convex-plano).  Flat: blank',
        presets: [-300, -200, -100, 100, 200, 300],
      },
      { key: 'd', label: 'Center thickness', unit: 'mm',
        toDisp: v => (v * 1000).toFixed(1),
        fromIn: s => parseFloat(s) / 1000,
        step: 0.5, min: 0.01,
        presets: [2, 3, 5, 8, 10, 15],
      },
      { key: 'n', label: 'Refractive index  n', unit: '',
        toDisp: v => v.toFixed(4),
        fromIn: s => parseFloat(s),
        step: 0.001, min: 1.0,
        hint: 'Fused silica 1.449 · BK7 1.517 · N-SF11 1.784 · ZnSe 2.403',
        presets: [1.449, 1.517, 1.784, 2.403],
        isDisabled: el => el.material && el.material !== 'custom',
      },
    ],
  },
  mirror: {
    title: 'Mirror',
    fields: [
      { key: 'R', label: 'Radius of curvature', unit: 'mm',
        toDisp: v => isFinite(v) ? (v * 1000).toFixed(0) : '',
        fromIn: s => { const t = s.trim(); return (!t || t === '∞') ? Infinity : parseFloat(t) / 1000; },
        step: 10, placeholder: '∞  or blank = flat',
        hint: 'Positive: concave (focusing)   Negative: convex',
        presets: [-300, -200, -100, 100, 200, 300, 500, 1000],
      },
    ],
  },
  interface: {
    title: 'Refractive Interface',
    fields: [
      { key: 'n1', label: 'n₁  (incident medium)', unit: '',
        toDisp: v => v.toFixed(4), fromIn: s => parseFloat(s),
        step: 0.01, min: 1.0,
        presets: [1.0],
      },
      { key: 'n2', label: 'n₂  (transmitted medium)', unit: '',
        toDisp: v => v.toFixed(4), fromIn: s => parseFloat(s),
        step: 0.001, min: 1.0,
        hint: 'Glass 1.5 · Fused silica 1.45 · Water 1.33',
        presets: [1.0, 1.33, 1.45, 1.5, 1.77, 2.0],
      },
    ],
  },
  crystal: {
    title: 'Crystal Slab',
    fields: [
      { key: 'material', label: 'Crystal material', type: 'select',
        options: [
          { value: 'custom',  label: 'Custom (manual n)' },
          { value: 'ktp',     label: 'KTP  (nx≈1.74, ny≈1.75, nz≈1.86)' },
          { value: 'bbo',     label: 'BBO  (no≈1.67, ne≈1.56)' },
          { value: 'lbo',     label: 'LBO  (nx≈1.57, ny≈1.59, nz≈1.61)' },
          { value: 'ppln',    label: 'PPLN (ne≈2.14)' },
          { value: 'znse',    label: 'ZnSe (n≈2.40)' },
        ],
        onSelect: (val, el) => {
          const nMap = { ktp: 1.745, bbo: 1.655, lbo: 1.585, ppln: 2.14, znse: 2.403 };
          if (val === 'custom') return { material: 'custom' };
          return { material: val, n: nMap[val] || el.n };
        },
        hint: 'Sets n to a typical value; override manually for exact polarisation/angle',
      },
      { key: 'n', label: 'Refractive index  n', unit: '',
        toDisp: v => v.toFixed(4), fromIn: s => parseFloat(s),
        step: 0.001, min: 1.0,
        hint: 'KTP 1.74–1.86 · BBO 1.56–1.67 · LBO 1.57–1.61 · PPLN 2.14 · ZnSe 2.40',
        presets: [1.585, 1.655, 1.745, 2.14, 2.403],
        isDisabled: el => el.material && el.material !== 'custom',
      },
      { key: 't', label: 'Physical length', unit: 'mm',
        toDisp: v => (v * 1000).toFixed(1), fromIn: s => parseFloat(s) / 1000,
        step: 1, min: 0.1,
        hint: 'Optical path = t / n',
        presets: [2, 5, 10, 15, 20, 30, 50],
      },
    ],
  },
  beamExpander: {
    title: 'Beam Expander',
    fields: [
      { key: 'mag', label: 'Magnification', unit: '×',
        toDisp: v => v.toFixed(2), fromIn: s => parseFloat(s),
        step: 0.5, min: 0.1,
        hint: '>1 expands beam   <1 collimates into smaller beam',
        presets: [0.25, 0.5, 2, 3, 5, 10],
      },
    ],
  },
};

function _injectPEStyles() {
  if (document.getElementById('_pe-css')) return;
  const s = document.createElement('style');
  s.id = '_pe-css';
  s.textContent = `
    .pe-type-bar { display:flex; align-items:center; gap:6px; margin-bottom:8px;
                   padding-bottom:6px; border-bottom:1px solid #0f1c28; }
    .pe-type-badge { font-size:0.6rem; padding:2px 5px; border-radius:3px;
                     font-weight:bold; letter-spacing:0.03em; }
    .pe-type-title { color:#7ec8e3; font-size:0.78rem; font-weight:bold; }
    .pe-field  { margin-bottom:0.65rem; }
    .pe-label  { color:#4a7a9a; font-size:0.7rem; margin-bottom:3px; }
    .pe-row    { display:flex; align-items:center; gap:4px; }
    .pe-input  { flex:1; background:#0a1520; border:1px solid #1a2a3a; border-radius:3px;
                 color:#b0d0e8; padding:3px 7px; font-family:monospace; font-size:0.82rem;
                 outline:none; transition:border-color 0.12s; }
    .pe-input:focus { border-color:#2a5070; color:#cce8ff; }
    .pe-input.invalid { border-color:#7a2020; color:#e08080; }
    .pe-unit   { color:#3a6070; font-size:0.72rem; white-space:nowrap; }
    .pe-hint   { color:#265060; font-size:0.64rem; margin-top:2px; line-height:1.4; }
    .pe-presets { display:flex; gap:3px; flex-wrap:wrap; margin-top:5px; }
    .pe-preset  { font-size:0.61rem; padding:1px 5px; background:#080f18;
                  border:1px solid #1a2a3a; color:#3a6080; cursor:pointer;
                  border-radius:3px; font-family:monospace;
                  transition:border-color 0.1s, color 0.1s; }
    .pe-preset:hover { border-color:#2a5070; color:#7ec8e3; }
    .pe-preset.active { border-color:#2a6090; color:#7ec8e3; background:#0e2030; }
    .pe-empty  { color:#2a4050; font-style:italic; font-size:0.73rem; }
  `;
  document.head.appendChild(s);
}

const _PE_EL_META = {
  free:         { badge: 'FREE', color: '#4a9a4a' },
  lens:         { badge: 'LENS', color: '#7ec8e3' },
  thickLens:    { badge: 'THCK', color: '#e3c87e' },
  mirror:       { badge: 'MIRR', color: '#aaaacc' },
  interface:    { badge: 'INTF', color: '#e3b84a' },
  crystal:      { badge: 'XTAL', color: '#c084fc' },
  beamExpander: { badge: 'BEXP', color: '#7ed87e' },
};

function createParamEditor(container, onUpdate) {
  _injectPEStyles();
  let currentEl = null;

  function show(el) {
    currentEl = el ? { ...el } : null;
    render();
  }

  function render() {
    container.innerHTML = '';

    if (!currentEl) {
      const msg = document.createElement('div');
      msg.className = 'pe-empty';
      msg.textContent = 'Select an element to edit its parameters';
      container.appendChild(msg);
      return;
    }

    const cfg = _PE_CFG[currentEl.type];
    if (!cfg) {
      const msg = document.createElement('div');
      msg.className = 'pe-empty';
      msg.style.color = '#6a3030';
      msg.textContent = `No editor for element type "${currentEl.type}"`;
      container.appendChild(msg);
      return;
    }

    // ── Type badge bar ───────────────────────────────────────────
    const meta = _PE_EL_META[currentEl.type] || { badge: '?', color: '#888' };
    const bar = document.createElement('div');
    bar.className = 'pe-type-bar';
    const badge = document.createElement('span');
    badge.className = 'pe-type-badge';
    badge.style.cssText = `background:${meta.color}1a;color:${meta.color};border:1px solid ${meta.color}40;`;
    badge.textContent = meta.badge;
    const title = document.createElement('span');
    title.className = 'pe-type-title';
    title.textContent = cfg.title;
    bar.append(badge, title);
    container.appendChild(bar);

    // ── Fields ───────────────────────────────────────────────────
    cfg.fields.forEach(field => buildField(field));
  }

  function buildField(field) {
    // ── Select field ──────────────────────────────────────────────────────────
    if (field.type === 'select') {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-field';
      const lbl = document.createElement('div');
      lbl.className = 'pe-label';
      lbl.textContent = field.label;
      const sel = document.createElement('select');
      sel.className = 'pe-input';
      sel.style.cssText = 'cursor:pointer;padding:4px 7px;';
      const curVal = currentEl[field.key] || 'custom';
      field.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (curVal === opt.value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const val = sel.value;
        const patch = field.onSelect ? field.onSelect(val, currentEl) : { [field.key]: val };
        Object.assign(currentEl, patch);
        if (onUpdate) onUpdate(patch);
        render();
      });
      const row = document.createElement('div');
      row.className = 'pe-row';
      row.appendChild(sel);
      wrapper.append(lbl, row);
      if (field.hint) {
        const h = document.createElement('div');
        h.className = 'pe-hint';
        h.textContent = field.hint;
        wrapper.appendChild(h);
      }
      container.appendChild(wrapper);
      return;
    }

    if (field.readOnly) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pe-field';
      const lbl = document.createElement('div');
      lbl.className = 'pe-label';
      lbl.textContent = field.label;
      const row = document.createElement('div');
      row.className = 'pe-row';
      const val = document.createElement('span');
      val.className = 'pe-input';
      val.style.cssText = 'color:#7ec8e3;background:#060e18;cursor:default;display:block;';
      val.textContent = field.compute(currentEl);
      if (field.unit) {
        const u = document.createElement('span');
        u.className = 'pe-unit';
        u.textContent = field.unit;
        row.append(val, u);
      } else {
        row.appendChild(val);
      }
      wrapper.append(lbl, row);
      container.appendChild(wrapper);
      return;
    }

    const { key, label, unit, toDisp, fromIn, step, min, hint, placeholder, presets } = field;
    const curVal = currentEl[key];

    const wrapper = document.createElement('div');
    wrapper.className = 'pe-field';

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'pe-label';
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    // Input row
    const row = document.createElement('div');
    row.className = 'pe-row';

    const disabled = field.isDisabled ? field.isDisabled(currentEl) : false;

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'pe-input';
    inp.value = toDisp(curVal);
    if (step        !== undefined) inp.step = step;
    if (min         !== undefined) inp.min  = min;
    if (placeholder) inp.placeholder = placeholder;

    if (disabled) {
      inp.disabled = true;
      inp.style.cssText = 'opacity:0.45;cursor:default;color:#4a7a9a;';
    } else {
      inp.addEventListener('focus', () => inp.style.borderColor = '#2a5070');
      inp.addEventListener('blur',  () => { inp.style.borderColor = '#1a2a3a'; commit(inp, field); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('input', () => {
        inp.classList.toggle('invalid', !_validate(inp.value, field));
      });
    }

    row.appendChild(inp);
    if (unit) {
      const unitSpan = document.createElement('span');
      unitSpan.className = 'pe-unit';
      unitSpan.textContent = unit;
      row.appendChild(unitSpan);
    }
    wrapper.appendChild(row);

    // Hint
    if (hint) {
      const h = document.createElement('div');
      h.className = 'pe-hint';
      h.textContent = hint;
      wrapper.appendChild(h);
    }

    // Presets (hidden when field is disabled)
    if (!disabled && presets && presets.length) {
      const ps = document.createElement('div');
      ps.className = 'pe-presets';
      presets.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'pe-preset';
        btn.textContent = p;
        btn.title = `Set to ${p}${unit || ''}`;
        const siVal = fromIn(String(p));
        if (Math.abs(siVal - curVal) < 1e-12 || (!isFinite(siVal) && !isFinite(curVal))) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
          inp.value = toDisp(siVal);
          inp.classList.remove('invalid');
          applyUpdate(key, siVal, field);
        });
        ps.appendChild(btn);
      });
      wrapper.appendChild(ps);
    }

    container.appendChild(wrapper);
  }

  function commit(inp, field) {
    const { key, fromIn, toDisp, min } = field;
    if (!_validate(inp.value, field)) {
      // Revert to last known good value
      inp.value = toDisp(currentEl[key]);
      inp.classList.remove('invalid');
      return;
    }
    let si = fromIn(inp.value);
    if (min !== undefined && isFinite(si) && si < min) si = min;
    inp.value = toDisp(si);   // reformat
    applyUpdate(key, si, field);
  }

  function applyUpdate(key, siVal, field) {
    currentEl[key] = siVal;
    if (onUpdate) onUpdate({ [key]: siVal });
    // Refresh presets to reflect new active state
    render();
  }

  function _validate(s, field) {
    const { fromIn, min, key } = field;
    const v = fromIn(s);
    if (key === 'R' || key === 'R1' || key === 'R2') return true;  // ∞ valid for surfaces
    if (key === 'f') return isFinite(v) && v !== 0;
    if (min !== undefined) return isFinite(v) && v >= min;
    return isFinite(v);
  }

  return { show };
}

if (typeof module !== 'undefined') module.exports = { createParamEditor };
