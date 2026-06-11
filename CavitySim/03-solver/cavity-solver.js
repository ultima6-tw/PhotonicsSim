// CavitySim Phase 5 — High-level Solver API
// Depends on: 01-elements/elements.js, 02-physics/roundtrip.js,
//             02-physics/eigenmode.js, 02-physics/stability.js
//
// Namespace: CAVITY

const CAVITY = (() => {

  /**
   * Solve the complete cavity mode for a linear standing-wave cavity.
   *
   * @param {object} config
   *   @param {object}   config.mirror1          element object (flatMirror | curvedMirror)
   *   @param {object[]} config.intracavity       elements from mirror1 to mirror2, in order
   *   @param {object}   config.mirror2           element object
   *   @param {number}   config.lambda_nm         wavelength [nm]
   *
   * @returns {{
   *   stable:    boolean,
   *   M_rt:      number[][],
   *   trace_half: number,
   *   eigenmode: { q, w_m, R_m, zR } | null,
   *   profile:   { points: Array<{z_m, w_m, label}>, q_at_mirror2 } | null,
   * }}
   */
  function solve({ mirror1, intracavity, mirror2, lambda_nm }) {
    const lambda_m = lambda_nm * 1e-9;
    const M_rt = roundTripMatrix(mirror1, intracavity, mirror2);
    const th   = traceHalf(M_rt);
    const em   = solveEigenmode(M_rt, lambda_m);

    let profile = null;
    if (em.stable && em.q !== null) {
      profile = modeProfile(em.q, intracavity, lambda_m);
    }

    return {
      stable:    em.stable,
      M_rt,
      trace_half: th,
      eigenmode: em.stable ? { q: em.q, w_m: em.w_m, R_m: em.R_m, zR: em.zR } : null,
      profile,
    };
  }

  /**
   * Scan cavity length and compute mode properties at each step.
   * Uses a simple two-mirror cavity (mirror1 + freeSpace(L) + mirror2).
   *
   * @param {object} config
   *   @param {number}   config.R1_nm         ROC of mirror1 [nm] (use Infinity for flat)
   *   @param {number}   config.R2_nm         ROC of mirror2 [nm] (use Infinity for flat)
   *   @param {number[]} config.L_range_mm    [L_min, L_max] in mm
   *   @param {number}   config.N             number of scan points (default 200)
   *   @param {number}   config.lambda_nm     wavelength [nm]
   *
   * @returns {Array<{ L_mm, g1, g2, product, stable, w1_um, w2_um }>}
   */
  function scanLength({ R1_mm, R2_mm, L_range_mm, N = 200, lambda_nm }) {
    const R1_m  = isFinite(R1_mm) ? R1_mm * 1e-3 : Infinity;
    const R2_m  = isFinite(R2_mm) ? R2_mm * 1e-3 : Infinity;
    const range = [L_range_mm[0] * 1e-3, L_range_mm[1] * 1e-3];
    const raw   = scanStability(R1_m, R2_m, range, N, lambda_nm * 1e-9);

    return raw.map(r => ({
      L_mm:    r.L_m * 1e3,
      g1:      r.g1,
      g2:      r.g2,
      product: r.product,
      stable:  r.stable,
      w1_um:   r.w1_m !== null ? r.w1_m * 1e6 : null,
      w2_um:   r.w2_m !== null ? r.w2_m * 1e6 : null,
    }));
  }

  /**
   * Find the cavity length that minimises the beam waist at mirror1.
   * Searches a two-mirror cavity over the specified length range.
   *
   * @param {object} config  — same signature as scanLength
   * @returns {{ L_mm, w1_um } | null}
   */
  function findMinWaistLength(config) {
    const scan = scanLength(config);
    const stable = scan.filter(r => r.stable && r.w1_um !== null);
    if (!stable.length) return null;
    const best = stable.reduce((b, r) => r.w1_um < b.w1_um ? r : b, stable[0]);
    return { L_mm: best.L_mm, w1_um: best.w1_um };
  }

  return { solve, scanLength, findMinWaistLength };
})();

if (typeof module !== 'undefined') {
  module.exports = { CAVITY };
}
