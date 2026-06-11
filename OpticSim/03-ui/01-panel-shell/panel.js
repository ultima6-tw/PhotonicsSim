// Panel Shell — app layout: left sidebar + 3D viewport + stats bar
//
// createPanelShell(root) modifies root to contain the full layout.
// Returns handles used by later UI modules to plug in content.
//
// Layout:
//   ┌─ left panel (280px) ──┬─ viewport (flex) ─┐
//   │  [header + collapse]  │  Three.js canvas  │
//   │  [body / sections]    │                   │
//   │  [footer / compute]   │                   │
//   └───────────────────────┴───────────────────┘
//   └─────────────── stats bar (28px) ──────────┘

function createPanelShell(root) {
  root.style.cssText = [
    'display:flex', 'flex-direction:column',
    'width:100vw', 'height:100vh', 'overflow:hidden',
    'background:#0d1117', 'color:#c0d0e0', 'font-family:monospace',
  ].join(';');

  // ── Top row ───────────────────────────────────────────────────────────────
  const topRow = _el('div', 'display:flex;flex:1;overflow:hidden;');

  // ── Left panel ────────────────────────────────────────────────────────────
  const panel = _el('div', [
    'width:280px', 'min-width:280px',
    'background:#080d14', 'border-right:1px solid #1a2a3a',
    'display:flex', 'flex-direction:column', 'overflow:hidden',
    'transition:width 0.2s,min-width 0.2s',
  ].join(';'));

  // Header
  const hdr = _el('div', [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:0.65rem 0.85rem', 'border-bottom:1px solid #1a2a3a',
    'background:#060b12', 'flex-shrink:0',
  ].join(';'));

  const logo = _el('span', 'color:#7ec8e3;font-weight:bold;font-size:0.88rem;letter-spacing:0.04em;');
  logo.textContent = '⬡  OpticSim';

  const collapseBtn = _el('button', [
    'background:none', 'border:none', 'color:#4a6a8a', 'cursor:pointer',
    'font-size:1.1rem', 'padding:0 0.15rem', 'line-height:1',
  ].join(';'));
  collapseBtn.textContent = '‹';

  let collapsed = false;
  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.style.width    = collapsed ? '0' : '280px';
    panel.style.minWidth = collapsed ? '0' : '280px';
    collapseBtn.textContent = collapsed ? '›' : '‹';
  });

  hdr.append(logo, collapseBtn);
  panel.appendChild(hdr);

  // Body (scrollable, sections injected here)
  const body = _el('div', 'flex:1;overflow-y:auto;padding:0.3rem 0;');
  body.id = 'panel-body';
  panel.appendChild(body);

  // Footer with Compute button
  const ftr = _el('div', [
    'padding:0.55rem 0.8rem', 'border-top:1px solid #1a2a3a',
    'background:#060b12', 'flex-shrink:0',
  ].join(';'));

  const computeBtn = _el('button', [
    'width:100%', 'padding:0.42rem',
    'background:#0e2438', 'border:1px solid #2a5070',
    'color:#7ec8e3', 'font-family:monospace', 'font-size:0.8rem',
    'cursor:pointer', 'border-radius:4px', 'transition:background 0.15s',
  ].join(';'));
  computeBtn.textContent = '▶  Compute';
  computeBtn.addEventListener('mouseover', () => { computeBtn.style.background = '#163448'; });
  computeBtn.addEventListener('mouseout',  () => { computeBtn.style.background = '#0e2438'; });

  ftr.appendChild(computeBtn);
  panel.appendChild(ftr);

  // ── Viewport ───────────────────────────────────────────────────────────────
  const viewport = _el('div', 'flex:1;position:relative;overflow:hidden;');
  viewport.id = 'optic-viewport';

  topRow.append(panel, viewport);

  // ── Stats bar ──────────────────────────────────────────────────────────────
  const statsBar = _el('div', [
    'height:28px', 'line-height:28px',
    'background:#060b12', 'border-top:1px solid #1a2a3a',
    'color:#3a6a8a', 'font-size:0.72rem',
    'padding:0 1rem', 'white-space:nowrap', 'overflow:hidden',
    'flex-shrink:0',
  ].join(';'));
  statsBar.textContent = '—';

  root.append(topRow, statsBar);

  // ── Public API ─────────────────────────────────────────────────────────────

  // Add a collapsible section to the panel body.
  // Returns { section, content } where content is where you inject children.
  function addSection(id, title, startOpen = true) {
    const sec = _el('div', 'border-bottom:1px solid #0f1820;');
    sec.id = id;

    const secHdr = _el('div', [
      'padding:0.35rem 0.85rem', 'color:#4a7a9a', 'font-size:0.7rem',
      'text-transform:uppercase', 'letter-spacing:0.07em',
      'cursor:pointer', 'user-select:none',
      'display:flex', 'justify-content:space-between', 'align-items:center',
    ].join(';'));
    secHdr.innerHTML = `<span>${title}</span><span class="sec-arr">${startOpen?'▾':'▸'}</span>`;

    const content = _el('div', `padding:0.3rem 0.85rem 0.55rem;display:${startOpen?'':'none'}`);

    let open = startOpen;
    secHdr.addEventListener('click', () => {
      open = !open;
      content.style.display = open ? '' : 'none';
      secHdr.querySelector('.sec-arr').textContent = open ? '▾' : '▸';
    });

    sec.append(secHdr, content);
    body.appendChild(sec);
    return { section: sec, content };
  }

  function setStats(text) { statsBar.textContent = text; }

  return { panel, viewport, statsBar, body, computeBtn, setStats, addSection };
}

// ── Tiny DOM helper ───────────────────────────────────────────────────────────
function _el(tag, css) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  return e;
}

if (typeof module !== 'undefined') module.exports = { createPanelShell };
