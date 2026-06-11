// Geometric Ray Tracing
// Depends on: matrices.js (must be loaded before this file)
//
// Ray convention: [r, theta]
//   r     = transverse position (metres)
//   theta = angle with optical axis (radians, paraxial)
//
// Each ray is propagated independently using the same ABCD matrices as the
// Gaussian engine, so both models are always consistent.

// ── Ray factories ─────────────────────────────────────────────────────────────

// n parallel rays uniformly spaced from -halfWidth to +halfWidth.
// tiltAngle (optional, radians): all rays share this initial angle (beam tilt).
function makeParallelRays(halfWidth, n, tiltAngle = 0) {
  const rays = [];
  for (let i = 0; i < n; i++) {
    const r = n === 1 ? 0 : halfWidth * (-1 + 2 * i / (n - 1));
    rays.push({ r, theta: tiltAngle });
  }
  return rays;
}

// n rays diverging from a point at height r0, angles from -maxAngle to +maxAngle
function makePointSourceRays(r0, maxAngle, n) {
  const rays = [];
  for (let i = 0; i < n; i++) {
    const theta = n === 1 ? 0 : maxAngle * (-1 + 2 * i / (n - 1));
    rays.push({ r: r0, theta });
  }
  return rays;
}

// ── Element matrix dispatcher (mirrors gaussian.js) ───────────────────────────

function matrixForEl(el) {
  switch (el.type) {
    case 'free':         return M.free(el.d);
    case 'lens':         return M.lens(el.f);
    case 'mirror':       return M.mirror(el.R !== undefined ? el.R : Infinity);
    case 'interface':    return M.interface(el.n1, el.n2);
    case 'beamExpander': return M.beamExpander(el.mag);
    case 'thickLens':    return M.thickLens(el.R1, el.R2, el.d, el.n);
    default:
      throw new Error(`Unknown element type: ${el.type}`);
  }
}

// ── Main ray tracing function ──────────────────────────────────────────────────
//
// system = {
//   elements: [ { type, ...params }, ... ]
// }
// initialRays = [ { r, theta }, ... ]
//
// Returns:
//   paths   : Array of ray paths — paths[i] = [{ z, r, theta }, ...]
//   optics  : [{ z, type, params }]  — element positions

function traceRays(system, initialRays, samplesPerSegment = 80) {
  const { elements } = system;

  // Each ray gets its own path array
  let rays = initialRays.map(ray => ({ r: ray.r, theta: ray.theta }));
  const paths = rays.map(() => []);

  let z = 0;
  const optics = [];

  // Record initial positions
  rays.forEach((ray, i) => paths[i].push({ z, r: ray.r, theta: ray.theta }));

  for (const el of elements) {
    if (el.type === 'free') {
      const d = el.d;
      for (let step = 1; step <= samplesPerSegment; step++) {
        const dz  = d * step / samplesPerSegment;
        const mat = M.free(dz);
        rays.forEach((ray, i) => {
          const [r2, t2] = M.applyRay(mat, ray.r, ray.theta);
          paths[i].push({ z: z + dz, r: r2, theta: t2 });
        });
      }
      // Advance rays by full d
      const mat = M.free(d);
      rays = rays.map(ray => {
        const [r2, t2] = M.applyRay(mat, ray.r, ray.theta);
        return { r: r2, theta: t2 };
      });
      z += d;
    } else {
      optics.push({ z, type: el.type, params: { ...el } });
      const mat = matrixForEl(el);
      rays = rays.map((ray, i) => {
        const [r2, t2] = M.applyRay(mat, ray.r, ray.theta);
        paths[i].push({ z, r: r2, theta: t2 });  // sample after element
        return { r: r2, theta: t2 };
      });
    }
  }

  return { paths, optics };
}

// ── Convergence finder ────────────────────────────────────────────────────────
// For a set of parallel input rays, find where they converge (all cross r=0)
// Returns z of convergence, or null if no crossing found within system.
function findFocus(paths) {
  if (paths.length < 2) return null;

  // Find z where the outermost positive ray (paths[last]) crosses r=0
  const outerPath = paths[paths.length - 1];
  for (let i = 1; i < outerPath.length; i++) {
    const a = outerPath[i - 1], b = outerPath[i];
    if (a.r * b.r <= 0 && a.r !== b.r) {
      const t = a.r / (a.r - b.r);
      return a.z + t * (b.z - a.z);
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = { makeParallelRays, makePointSourceRays, traceRays, findFocus };
}
