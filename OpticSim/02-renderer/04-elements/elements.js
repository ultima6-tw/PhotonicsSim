// Optical Element 3D Meshes
// Depends on: Three.js (window.THREE)
//
// Lens profiles are built as LatheGeometry outlines (half cross-section),
// then rotated so local Y aligns with world Z (optical axis).
//
// Optic format from sampler: { z, type, params: { type, f?, R?, n1?, n2?, ... } }

// ── Lens ─────────────────────────────────────────────────────────────────────

function _biconvexPts(aperture, N) {
  const THREE = window.THREE;
  const R = aperture;
  const t = aperture * 0.42;   // center half-thickness → ~2.4:1 diameter/thickness ratio
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, t * (r*r/(R*R) - 1)));   // (0,-t) → (R,0)
  }
  for (let i = N - 1; i >= 0; i--) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, t * (1 - r*r/(R*R))));   // (R,0) → (0,+t)
  }
  return pts;
}

function _biconcavePts(aperture, N) {
  const THREE = window.THREE;
  const R = aperture;
  const t_c = aperture * 0.06;   // center half-thickness (thin)
  const t_e = aperture * 0.42;   // edge half-thickness (thick)
  const pts = [];
  // Front surface: center → edge (curves toward -z at edge → concave from outside)
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, -t_c - (t_e - t_c) * (r/R) * (r/R)));  // (0,-t_c) → (R,-t_e)
  }
  // Flat rim
  pts.push(new THREE.Vector2(R, t_e));
  // Back surface: edge → center (mirrors front, toward +z)
  for (let i = N - 1; i >= 0; i--) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(r, t_c + (t_e - t_c) * (r/R) * (r/R)));   // (R,t_e) → (0,t_c)
  }
  return pts;
}

function _thickLensEFL(p) {
  const R1 = p.R1, R2 = p.R2, d = p.d, n = p.n;
  const inv1  = isFinite(R1) ? 1 / R1 : 0;
  const inv2  = isFinite(R2) ? 1 / R2 : 0;
  const thick = (isFinite(R1) && isFinite(R2)) ? (n - 1) * d / (n * R1 * R2) : 0;
  const power = (n - 1) * (inv1 - inv2 + thick);
  return Math.abs(power) < 1e-15 ? Infinity : 1 / power;
}

function buildLensMesh(params, aperture) {
  const THREE = window.THREE;
  const N = 28;

  // Determine effective focal length — handles both thin lens {f} and thick lens {R1,R2,d,n}
  let f = params.f !== undefined ? params.f : (params.params && params.params.f);
  const isThick = (f === undefined || f === null) && params.R1 !== undefined;
  if (isThick) f = _thickLensEFL(params);

  const isConverging = !isFinite(f) || f >= 0;
  const pts = isConverging ? _biconvexPts(aperture, N) : _biconcavePts(aperture, N);

  const lathe = new THREE.LatheGeometry(pts, 72);
  lathe.rotateX(Math.PI / 2);
  lathe.computeVertexNormals();

  // Thick lens: amber tint; ideal thin lens: blue tint
  const color = isThick
    ? (isConverging ? 0xf0d890 : 0xf0c870)
    : (isConverging ? 0xb8d8f0 : 0xcbb8f0);
  const emiss = isThick ? 0x100800 : (isConverging ? 0x000810 : 0x060010);

  const mat = new THREE.MeshPhongMaterial({
    color, emissive: emiss,
    transparent: true, opacity: 0.72,
    side: THREE.FrontSide, shininess: 100,
  });

  const rimColor = isThick ? 0xccaa44 : 0x7799cc;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(lathe, mat));

  const rimGeo = new THREE.TorusGeometry(aperture, aperture * 0.022, 8, 48);
  group.add(new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: rimColor })));

  group.userData.elementType = isThick ? 'thickLens' : 'lens';
  group.userData.converging  = isConverging;
  return group;
}

// ── Mirror ────────────────────────────────────────────────────────────────────

function buildMirrorMesh(params, aperture) {
  const THREE = window.THREE;
  const R_ap   = aperture;
  const N      = 32;
  const R_curv = params.R !== undefined ? params.R
               : (params.params && params.params.R !== undefined ? params.params.R : Infinity);
  const isFlat  = !isFinite(R_curv) || Math.abs(R_curv) > 1e6;
  // Concave (R_curv > 0): center protrudes toward +z (bowl opening toward incoming −z beam)
  // Convex  (R_curv < 0): center protrudes toward −z
  const sign  = (R_curv < 0) ? -1 : 1;
  const depth = isFlat ? 0 : Math.min(R_ap * R_ap / (2 * Math.abs(R_curv)), R_ap * 0.28);

  const pts = [];
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * R_ap;
    pts.push(new THREE.Vector2(r, sign * depth * (1 - r*r/(R_ap*R_ap))));
  }

  const lathe = new THREE.LatheGeometry(pts, 48);
  lathe.rotateX(Math.PI / 2);
  lathe.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    color: 0xd8e8f8, emissive: 0x03070c,
    transparent: true, opacity: 0.88,
    side: THREE.DoubleSide, shininess: 140,
    depthWrite: false,
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(lathe, mat));

  const rimGeo = new THREE.TorusGeometry(R_ap, R_ap * 0.022, 8, 48);
  group.add(new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: 0x4a6888 })));

  group.userData.elementType = 'mirror';
  return group;
}

// ── Interface ─────────────────────────────────────────────────────────────────

function buildInterfaceMesh(params, aperture) {
  const THREE = window.THREE;
  // CircleGeometry in XY plane, normal = +Z — perpendicular to optical axis ✓
  const mat = new THREE.MeshBasicMaterial({
    color: 0x60a0c0, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CircleGeometry(aperture, 48), mat));

  const rimGeo = new THREE.TorusGeometry(aperture, aperture * 0.022, 8, 48);
  group.add(new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: 0x3a6070 })));

  group.userData.elementType = 'interface';
  return group;
}

// ── Build all elements from optics array ──────────────────────────────────────
//
// optics: array of { z, type, params } from buildBeamData().optics
// transverseScale: from buildEnvelope().userData.transverseScale
// w0: input beam waist radius (metres)

function buildElements(optics, transverseScale, maxBeamRadius) {
  // maxBeamRadius: max beam radius over the propagation path (SI, metres)
  // e.g. Math.max(...gaussian.samples.map(s => s.w))
  const THREE = window.THREE;
  const aperture = (maxBeamRadius || 1e-3) * transverseScale * 1.5;
  const group = new THREE.Group();

  optics.forEach(el => {
    let elGroup = null;
    const p = el.params || el;   // handle both {z,type,params} and flat {z,type,f,...}

    if (el.type === 'lens' || el.type === 'thickLens' || el.type === 'beamExpander') {
      elGroup = buildLensMesh(p, aperture);
    } else if (el.type === 'mirror') {
      elGroup = buildMirrorMesh(p, aperture);
    } else if (el.type === 'interface') {
      elGroup = buildInterfaceMesh(p, aperture);
    }

    if (elGroup) {
      elGroup.position.set(0, 0, el.z);
      group.add(elGroup);
    }
  });

  return group;
}

if (typeof module !== 'undefined') {
  module.exports = { buildLensMesh, buildMirrorMesh, buildInterfaceMesh, buildElements };
}
