// Beam Spot Viewer — cross-section disc at a user-chosen z position
// Depends on: Three.js (window.THREE)
//
// Shows a 2D Gaussian intensity texture on a disc perpendicular to the optical axis.
//
// createSpotViewer(scene)
//   Returns: {
//     update(gaussianSamples, transverseScale)
//     setZ(z)       — reposition + redraw
//     getZ()        — current z (metres)
//     getW()        — beam radius w(z) (metres)
//     show() / hide()
//     attachDrag(renderer, camera, controls)
//     detachDrag()
//   }

function createSpotViewer(scene) {
  const THREE = window.THREE;

  const DISC_FACTOR = 2.5;   // disc radius = DISC_FACTOR × w (so ±2.5σ visible)
  const TEX_SIZE    = 256;

  // ── State ──────────────────────────────────────────────────────────────────
  let _samples  = [];
  let _tScale   = 1;
  let _z        = 0;
  let _w        = 0;
  let _visible  = false;
  let _dragActive = null;   // null | { offsetZ: number }
  let _cleanupDrag = null;  // cleanup fn from attachDrag

  // ── Canvas texture ─────────────────────────────────────────────────────────
  const _canvas  = document.createElement('canvas');
  _canvas.width  = _canvas.height = TEX_SIZE;
  const _ctx     = _canvas.getContext('2d');
  const _texture = new THREE.CanvasTexture(_canvas);

  function _drawTexture() {
    // σ in pixel units: 1 beam-radius = TEX_SIZE/2 / DISC_FACTOR pixels
    const N  = TEX_SIZE;
    const cx = N / 2;
    const sigma_pix = cx / DISC_FACTOR;

    const img = _ctx.createImageData(N, N);
    const d   = img.data;

    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const dx = (px - cx) / sigma_pix;
        const dy = (py - cx) / sigma_pix;
        const r2 = dx * dx + dy * dy;
        const I  = Math.exp(-2 * r2);       // I = exp(-2r²/w²)
        const i4 = (py * N + px) * 4;

        // Colour: white-hot core → cyan → transparent beyond 3σ
        const white = I * Math.max(0, 1 - r2 * 0.5);
        d[i4]     = Math.round(126 + 129 * white);   // R
        d[i4 + 1] = Math.round(200 + 55  * white);   // G
        d[i4 + 2] = 227;                              // B
        d[i4 + 3] = r2 < 9 ? Math.round(I * 220) : 0;  // α: 0 beyond 3σ
      }
    }

    _ctx.putImageData(img, 0, 0);
    _texture.needsUpdate = true;
  }

  // ── 3D objects ─────────────────────────────────────────────────────────────
  const _disc = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: _texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  _disc.visible = false;
  scene.add(_disc);

  const _ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.5 * 0.018, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x7ec8e3, transparent: true, opacity: 0.55 })
  );
  _ring.visible = false;
  scene.add(_ring);

  // ── Interpolate w at arbitrary z ───────────────────────────────────────────
  function _wAtZ(z) {
    const s = _samples;
    if (!s.length) return 0;
    if (z <= s[0].z)             return s[0].w;
    if (z >= s[s.length - 1].z)  return s[s.length - 1].w;
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].z <= z) lo = m; else hi = m; }
    const t = (z - s[lo].z) / (s[hi].z - s[lo].z);
    return s[lo].w + t * (s[hi].w - s[lo].w);
  }

  // ── Refresh disc geometry + texture ───────────────────────────────────────
  function _refresh() {
    _w = _wAtZ(_z);
    const r = _w * _tScale * DISC_FACTOR;  // disc radius in world units
    const d = r * 2;                       // disc diameter

    _drawTexture();

    _disc.scale.set(d, d, 1);
    _disc.position.set(0, 0, _z);

    _ring.scale.set(d, d, 1);
    _ring.position.set(0, 0, _z);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function update(gaussianSamples, transverseScale) {
    _samples = gaussianSamples || [];
    _tScale  = transverseScale || 1;
    if (_visible) _refresh();
  }

  function setZ(z) {
    _z = z;
    if (_visible) _refresh();
  }

  function getZ() { return _z; }
  function getW() { return _w; }

  function show() {
    _visible = true;
    _disc.visible = true;
    _ring.visible = true;
    _refresh();
  }

  function hide() {
    _visible = false;
    _disc.visible = false;
    _ring.visible = false;
  }

  // ── 3D drag: reposition disc along Z ──────────────────────────────────────
  function attachDrag(renderer, camera, controls) {
    if (_cleanupDrag) detachDrag();   // remove any previous listeners

    const canvas    = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();
    const plane     = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPt     = new THREE.Vector3();

    function ndc(e) {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1,
               y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    }

    function zAt(ndcX, ndcY) {
      mouse.set(ndcX, ndcY);
      raycaster.setFromCamera(mouse, camera);
      return raycaster.ray.intersectPlane(plane, hitPt) ? hitPt.z : null;
    }

    function onDown(e) {
      if (e.button !== 0 || !_visible) return;
      const { x, y } = ndc(e);
      mouse.set(x, y);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects([_disc, _ring], false);
      if (!hits.length) return;
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), _disc.position);
      const z = zAt(x, y);
      if (z === null) return;
      _dragActive = { offsetZ: z - _z };
      controls.enabled = false;
      canvas.style.cursor = 'ew-resize';
      e.stopPropagation();
    }

    function onMove(e) {
      if (!_dragActive) return;
      const { x, y } = ndc(e);
      const z = zAt(x, y);
      if (z === null) return;
      let newZ = z - _dragActive.offsetZ;
      if (_samples.length) {
        newZ = Math.max(_samples[0].z, Math.min(_samples[_samples.length - 1].z, newZ));
      }
      setZ(newZ);
    }

    function onUp() {
      if (!_dragActive) return;
      _dragActive = null;
      controls.enabled = true;
      canvas.style.cursor = '';
    }

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);

    _cleanupDrag = () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }

  function detachDrag() {
    if (_cleanupDrag) { _cleanupDrag(); _cleanupDrag = null; }
  }

  return { update, setZ, getZ, getW, show, hide, attachDrag, detachDrag };
}

if (typeof module !== 'undefined') module.exports = { createSpotViewer };
