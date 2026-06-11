// Gaussian Beam Envelope — 3D tube mesh
// Depends on: Three.js (window.THREE)
//
// Supports both on-axis (tilt=0) and off-axis beams.
// Each z-slice is a ring of N vertices centred at (rc * tScale, 0, z)
// with radius w * tScale. Adjacent rings are connected with quads.
//
// When rc=0 for all samples the result is identical to the old LatheGeometry
// approach (backward compatible).
//
// Transverse scale:
//   Physical beam radius (mm) vs system length (m) → ~1000:1 aspect ratio.
//   Auto-scale: max beam radius ≈ 8% of system length in world space.

function buildEnvelope(gaussianSamples, options) {
  const THREE = window.THREE;
  const opts  = options || {};

  const L    = gaussianSamples[gaussianSamples.length - 1].z;
  const maxW = Math.max(...gaussianSamples.map(s => s.w));
  const tScale = opts.transverseScale || (L * 0.08) / maxW;

  // Downsample to ≤ 300 slices for geometry performance
  const stride = Math.max(1, Math.floor(gaussianSamples.length / 300));
  const slices = [];
  for (let i = 0; i < gaussianSamples.length; i += stride) slices.push(gaussianSamples[i]);
  const last = gaussianSamples[gaussianSamples.length - 1];
  if (slices[slices.length - 1] !== last) slices.push(last);

  const SEGS = opts.radialSegments || 36;  // vertices per ring

  // ── Build custom BufferGeometry ───────────────────────────────────────────
  // Each slice = one ring; adjacent rings = quad strip.
  // Ring i at (rc_i * tScale, 0, z_i), radius = w_i * tScale
  const nSlices   = slices.length;
  const nVerts    = nSlices * SEGS;
  const nQuads    = (nSlices - 1) * SEGS;   // quads between adjacent rings
  const nTris     = nQuads * 2;

  const positions = new Float32Array(nVerts * 3);
  const normals   = new Float32Array(nVerts * 3);
  const indices   = new Uint32Array(nTris * 3);

  // Fill vertex positions
  for (let si = 0; si < nSlices; si++) {
    const s  = slices[si];
    const z  = s.z;
    const r  = s.w  * tScale;            // ring radius in world units
    const cx = (s.rc !== undefined ? s.rc : 0) * tScale;  // centroid x offset

    for (let vi = 0; vi < SEGS; vi++) {
      const phi = (vi / SEGS) * Math.PI * 2;
      const vIdx = (si * SEGS + vi) * 3;
      positions[vIdx]     = cx + r * Math.cos(phi);
      positions[vIdx + 1] = r  * Math.sin(phi);
      positions[vIdx + 2] = z;
    }
  }

  // Fill indices (two triangles per quad between ring si and si+1)
  let idx = 0;
  for (let si = 0; si < nSlices - 1; si++) {
    for (let vi = 0; vi < SEGS; vi++) {
      const a = si * SEGS + vi;
      const b = si * SEGS + (vi + 1) % SEGS;
      const c = (si + 1) * SEGS + (vi + 1) % SEGS;
      const d = (si + 1) * SEGS + vi;
      // quad: a-b-c and a-c-d
      indices[idx++] = a; indices[idx++] = b; indices[idx++] = c;
      indices[idx++] = a; indices[idx++] = c; indices[idx++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  // ── Materials (same as before) ────────────────────────────────────────────
  const outerMat = new THREE.MeshPhongMaterial({
    color:       opts.color    || 0x7ec8e3,
    emissive:    opts.emissive || 0x0a2030,
    transparent: true,
    opacity:     opts.opacity !== undefined ? opts.opacity : 0.18,
    side:        THREE.FrontSide,
    depthWrite:  false,
  });
  const innerMat = new THREE.MeshPhongMaterial({
    color:       opts.color    || 0x7ec8e3,
    emissive:    opts.emissive || 0x0a2030,
    transparent: true,
    opacity:     (opts.opacity !== undefined ? opts.opacity : 0.18) * 0.6,
    side:        THREE.BackSide,
    depthWrite:  false,
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, outerMat));
  group.add(new THREE.Mesh(geo, innerMat));
  group.userData.transverseScale = tScale;

  return group;
}

// ── Waist ring markers ────────────────────────────────────────────────────────
function buildWaistRings(waists, transverseScale, options) {
  const THREE = window.THREE;
  const opts  = options || {};
  const group = new THREE.Group();

  waists.forEach(w => {
    const r   = w.w * transverseScale;
    const cx  = (w.rc !== undefined ? w.rc : 0) * transverseScale;
    const geo = new THREE.TorusGeometry(r, r * 0.08, 8, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: opts.color || 0x7ed87e,
      transparent: true, opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, w.z);
    group.add(mesh);
  });

  return group;
}

if (typeof module !== 'undefined') module.exports = { buildEnvelope, buildWaistRings };
