// CavitySim Phase 2 — Round-trip ABCD Matrix & Stability
// Depends on: 01-elements/elements.js  (matMul, matChain, matDet)

/**
 * Linear (standing-wave) cavity round-trip ABCD matrix.
 * Reference plane: just inside mirror1 (immediately after reflection).
 *
 * Physical propagation order for one round trip:
 *   [...intracavity forward] → mirror2 → [...intracavity reversed] → mirror1
 *
 * @param {object} mirror1       element object (flatMirror or curvedMirror)
 * @param {object[]} intracavity elements from mirror1 to mirror2, in order
 * @param {object} mirror2       element object (flatMirror or curvedMirror)
 * @returns {number[][]}  2×2 round-trip ABCD matrix
 */
function roundTripMatrix(mirror1, intracavity, mirror2) {
  const fwd = [...intracavity];
  const bwd = [...intracavity].reverse();
  return matChain([...fwd, mirror2, ...bwd, mirror1]);
}

/**
 * (Tr M_rt) / 2 — the stability parameter.
 * Stable cavity: |traceHalf| ≤ 1.
 */
function traceHalf(M_rt) {
  return (M_rt[0][0] + M_rt[1][1]) / 2;
}

/**
 * Returns true if the cavity is stable (including degenerate boundary cases).
 */
function isStable(M_rt) {
  return Math.abs(traceHalf(M_rt)) <= 1 + 1e-9;
}

/**
 * g-parameters for a simple two-mirror cavity (no intracavity elements).
 * g_i = 1 − L / R_i   (R = Infinity for flat mirror)
 * Stability: 0 ≤ g1·g2 ≤ 1
 *
 * @param {number} R1_m  ROC of mirror1 [m]  (use Infinity for flat)
 * @param {number} R2_m  ROC of mirror2 [m]  (use Infinity for flat)
 * @param {number} L_m   mirror separation [m]
 */
function gParams(R1_m, R2_m, L_m) {
  const g1 = isFinite(R1_m) ? 1 - L_m / R1_m : 1;
  const g2 = isFinite(R2_m) ? 1 - L_m / R2_m : 1;
  return { g1, g2, product: g1 * g2 };
}

if (typeof module !== 'undefined') {
  module.exports = { roundTripMatrix, traceHalf, isStable, gParams };
}
