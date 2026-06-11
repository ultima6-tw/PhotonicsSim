// CavitySim Phase 3 — Eigenmode Extraction & Beam Profile
// Depends on: 01-elements/elements.js, 02-physics/roundtrip.js
//
// The eigenmode q satisfies the self-consistency condition:
//   q = (A·q + B) / (C·q + D)  →  C·q² + (D−A)·q − B = 0
//
// Complex beam parameter:  1/q = 1/R(z) − i·λ/(π·w²(z))
//   w(z): beam radius [m]
//   R(z): wavefront radius of curvature [m]
//   z_R:  Rayleigh range = Im(q) [m]   (when Re(q)=0, i.e. at waist)

// ── Complex number helpers ────────────────────────────────────────────────────

const _C = {
  add:  (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub:  (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul:  (a, b) => ({ re: a.re*b.re - a.im*b.im,  im: a.re*b.im + a.im*b.re }),
  div:  (a, b) => {
    const d = b.re*b.re + b.im*b.im;
    return { re: (a.re*b.re + a.im*b.im) / d,  im: (a.im*b.re - a.re*b.im) / d };
  },
  sqrt: (a) => {
    const r  = Math.sqrt(a.re*a.re + a.im*a.im);
    const th = Math.atan2(a.im, a.re) / 2;
    return { re: Math.sqrt(r) * Math.cos(th),  im: Math.sqrt(r) * Math.sin(th) };
  },
  real: (x) => ({ re: x, im: 0 }),
};

// ── Core eigenmode solver ─────────────────────────────────────────────────────

/**
 * Solve for the eigenmode complex beam parameter q at the reference plane
 * (just inside mirror1) from the round-trip ABCD matrix.
 *
 * @param {number[][]} M_rt   2×2 round-trip matrix [[A,B],[C,D]]
 * @param {number} lambda_m   wavelength [m]
 * @returns {{ q, w_m, R_m, zR, stable }}
 *   q:      complex beam parameter {re, im} [m]
 *   w_m:    beam radius at reference plane [m]
 *   R_m:    wavefront curvature at reference plane [m] (Infinity if Im(1/q)→0)
 *   zR:     Rayleigh range Im(q) [m]  (meaningful only when Re(q)≈0)
 *   stable: boolean
 */
function solveEigenmode(M_rt, lambda_m) {
  const A = M_rt[0][0], B = M_rt[0][1];
  const C = M_rt[1][0], D = M_rt[1][1];

  if (!isStable(M_rt)) {
    return { q: null, w_m: null, R_m: null, zR: null, stable: false };
  }

  // Solve C·q² + (D−A)·q − B = 0
  // Discriminant: (A+D)² − 4  (< 0 for stable cavity → complex sqrt)
  const disc = { re: (A + D)*(A + D) - 4, im: 0 };
  const sqrtDisc = _C.sqrt(disc);  // Im(sqrtDisc) > 0 for stable cavity

  // Take root with Im(q) > 0
  const num1 = { re: A - D, im: 0 };
  const denom = { re: 2 * C, im: 0 };

  let q;
  if (Math.abs(C) < 1e-15) {
    // C ≈ 0: degenerate case (e.g. planar cavity) — return null for ambiguous mode
    return { q: null, w_m: null, R_m: null, zR: null, stable: true };
  }

  const q1 = _C.div(_C.add(num1,  sqrtDisc), denom);
  const q2 = _C.div(_C.sub(num1, sqrtDisc), denom);

  // Choose root with Im(q) > 0
  q = (q1.im > 0) ? q1 : q2;

  if (q.im <= 0) {
    return { q: null, w_m: null, R_m: null, zR: null, stable: false };
  }

  // Extract beam parameters from q
  const inv_q = _C.div(_C.real(1), q);   // 1/q = 1/R − i·λ/(π·w²)
  const w_m = Math.sqrt(-lambda_m / (Math.PI * inv_q.im));
  const R_m = (Math.abs(inv_q.re) < 1e-15) ? Infinity : 1 / inv_q.re;
  const zR  = q.im;

  return { q, w_m, R_m, zR, stable: true };
}

// ── q propagation ─────────────────────────────────────────────────────────────

/**
 * Propagate complex beam parameter through an ABCD element.
 * q_out = (A·q_in + B) / (C·q_in + D)
 */
function propagateQ(q, M) {
  const A = _C.real(M[0][0]), B = _C.real(M[0][1]);
  const C = _C.real(M[1][0]), D = _C.real(M[1][1]);
  return _C.div(_C.add(_C.mul(A, q), B), _C.add(_C.mul(C, q), D));
}

/**
 * Beam radius from complex beam parameter q.
 * w = sqrt(−λ / (π · Im(1/q)))
 */
function beamRadius(q, lambda_m) {
  const inv_q = _C.div(_C.real(1), q);
  if (inv_q.im >= 0) return null;  // unphysical
  return Math.sqrt(-lambda_m / (Math.PI * inv_q.im));
}

/**
 * Wavefront radius of curvature from q.
 * R = 1 / Re(1/q)
 */
function beamCurvature(q) {
  const inv_q = _C.div(_C.real(1), q);
  return Math.abs(inv_q.re) < 1e-15 ? Infinity : 1 / inv_q.re;
}

/**
 * Sample beam profile w(z) along the cavity axis.
 * Starts at reference plane (just inside mirror1), steps through each element.
 *
 * @param {object}   q_ref     complex beam parameter at reference plane
 * @param {object[]} elements  elements in physical order [fwd..., mirror2, bwd...]
 *                             for one-way pass from mirror1 to mirror2
 * @param {number}   lambda_m  wavelength [m]
 * @param {number}   N         samples per element for free-space segments
 * @returns {Array<{z_m, w_m, label}>}
 */
function modeProfile(q_ref, fwd_elements, lambda_m, N = 50) {
  const points = [];
  let q  = q_ref;
  let z  = 0;

  // Always record the starting plane
  points.push({ z_m: z, w_m: beamRadius(q, lambda_m), label: 'Mirror 1' });

  for (const el of fwd_elements) {
    if (el.type === 'freeSpace') {
      const L = el.params.L_m;
      for (let i = 1; i <= N; i++) {
        const dz = L * i / N;
        const M_step = [[1, dz], [0, 1]];
        const q_step = propagateQ(q, M_step);
        points.push({ z_m: z + dz, w_m: beamRadius(q_step, lambda_m), label: '' });
      }
      q = propagateQ(q, el.M);
      z += L;
    } else {
      // Thin element: propagate q, no z advance
      q = propagateQ(q, el.M);
      points.push({ z_m: z, w_m: beamRadius(q, lambda_m), label: el.label });
    }
  }

  points.push({ z_m: z, w_m: beamRadius(q, lambda_m), label: 'Mirror 2' });
  return { points, q_at_mirror2: q };
}

if (typeof module !== 'undefined') {
  module.exports = { solveEigenmode, propagateQ, beamRadius, beamCurvature, modeProfile, _C };
}
