// Geometric Ray Lines — 3D LineSegments
// Depends on: Three.js (window.THREE)
//
// Physics rays are 2D (r, z). To create a 3D visual we repeat each ray plane
// around the optical axis at evenly-spaced azimuthal angles φ.
//
// For each ray at height r(z), its 3D position at azimuth φ is:
//   x = r(z) * tScale * cos(φ)
//   y = r(z) * tScale * sin(φ)
//   z = z
//
// With azimuthalCount=3 we get a triangular fan of ray planes; count=1 gives
// a single XZ plane (classic 2D optics diagram projected into 3D).

function buildRayLines(rayPaths, transverseScale, options) {
  const THREE = window.THREE;
  const opts  = options || {};

  const tScale         = transverseScale;
  const azimuthalCount = opts.azimuthalCount || 3;
  const baseColors     = opts.colors || RAY_COLORS;
  const group          = new THREE.Group();

  // Azimuthal angles: evenly distributed around full circle
  const phis = [];
  for (let k = 0; k < azimuthalCount; k++) {
    phis.push((k / azimuthalCount) * Math.PI * 2);
  }

  rayPaths.forEach((path, rayIdx) => {
    const color = baseColors[rayIdx % baseColors.length];

    phis.forEach(phi => {
      const positions = new Float32Array(path.length * 3);
      for (let i = 0; i < path.length; i++) {
        const { z, r } = path[i];
        positions[i * 3 + 0] = r * tScale * Math.cos(phi);
        positions[i * 3 + 1] = r * tScale * Math.sin(phi);
        positions[i * 3 + 2] = z;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: opts.opacity !== undefined ? opts.opacity : 0.55,
      });

      group.add(new THREE.Line(geo, mat));
    });
  });

  return group;
}

// Default colour palette — rainbow from edge to centre, visually distinct
const RAY_COLORS = [
  0xe74c3c,  // red   (outermost)
  0xe67e22,  // orange
  0xf1c40f,  // yellow
  0x2ecc71,  // green  (centre)
  0xf1c40f,  // yellow
  0xe67e22,  // orange
  0xe74c3c,  // red   (outermost mirror)
];

if (typeof module !== 'undefined') module.exports = { buildRayLines, RAY_COLORS };
