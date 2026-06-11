// CavitySim Phase 1 — Element ABCD Matrices
//
// Convention:
//   Ray vector: [y; u]  (height; angle in paraxial approx)
//   Single element:  [y_out; u_out] = M × [y_in; u_in]
//   Sequence:        M_total = M_last × ... × M_first  (physical order = left-to-right in array)
//   matChain([e1, e2, e3]) multiplies as M_e3 × M_e2 × M_e1
//
// All parameters in SI units (meters) unless stated.
// Determinant of any lossless element = 1.

// ── Matrix helpers ────────────────────────────────────────────────────────────

function matMul(A, B) {
  return [
    [A[0][0]*B[0][0] + A[0][1]*B[1][0],  A[0][0]*B[0][1] + A[0][1]*B[1][1]],
    [A[1][0]*B[0][0] + A[1][1]*B[1][0],  A[1][0]*B[0][1] + A[1][1]*B[1][1]],
  ];
}

function matDet(M) {
  return M[0][0]*M[1][1] - M[0][1]*M[1][0];
}

function matChain(elements) {
  // elements: array of element objects in physical (beam propagation) order.
  // Returns M_total = M_last × ... × M_first.
  let M = [[1, 0], [0, 1]];  // identity
  for (const el of elements) {
    M = matMul(el.M, M);
  }
  return M;
}

function matTrace(M) {
  return M[0][0] + M[1][1];
}

// ── Element factory ───────────────────────────────────────────────────────────

/**
 * Create a cavity element with its ABCD matrix.
 *
 * @param {string} type  'freeSpace' | 'thinLens' | 'flatMirror' | 'curvedMirror' | 'gainMedium'
 * @param {object} params
 *   freeSpace:    { L_m }         propagation distance [m]
 *   thinLens:     { f_m }         focal length [m] (negative = diverging)
 *   flatMirror:   {}              plane mirror (identity)
 *   curvedMirror: { R_m }         radius of curvature [m] (positive = center of curvature in front)
 *   gainMedium:   { n, t_m }      refractive index, physical thickness [m]
 * @returns {{ type, params, M, label }}
 */
function makeElement(type, params = {}) {
  let M, label;

  switch (type) {
    case 'freeSpace': {
      const L = params.L_m;
      M = [[1, L], [0, 1]];
      label = `FreeSpace(${(L * 1e3).toFixed(2)} mm)`;
      break;
    }
    case 'thinLens': {
      const f = params.f_m;
      M = [[1, 0], [-1 / f, 1]];
      label = `ThinLens(f=${(f * 1e3).toFixed(2)} mm)`;
      break;
    }
    case 'flatMirror': {
      M = [[1, 0], [0, 1]];
      label = 'FlatMirror';
      break;
    }
    case 'curvedMirror': {
      const R = params.R_m;
      // Equivalent focal length for reflection: f = R/2
      M = [[1, 0], [-2 / R, 1]];
      label = `CurvedMirror(R=${(R * 1e3).toFixed(2)} mm)`;
      break;
    }
    case 'gainMedium': {
      const n = params.n;
      const t = params.t_m;
      // Propagation inside medium: optical path = t/n for angle, length = t
      M = [[1, t / n], [0, 1]];
      label = `GainMedium(n=${n}, t=${(t * 1e3).toFixed(2)} mm)`;
      break;
    }
    default:
      throw new Error(`Unknown element type: "${type}"`);
  }

  return { type, params, M, label };
}

if (typeof module !== 'undefined') {
  module.exports = { makeElement, matMul, matDet, matChain, matTrace };
}
