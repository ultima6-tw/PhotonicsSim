// CavitySim Phase 4 — Stability Diagram & Parameter Scan
// Depends on: 01-elements/elements.js, 02-physics/roundtrip.js, 02-physics/eigenmode.js

/**
 * Compute the g1g2 stability point for a two-mirror cavity.
 *
 * @param {number} R1_m  ROC of mirror1 [m]  (Infinity for flat)
 * @param {number} R2_m  ROC of mirror2 [m]  (Infinity for flat)
 * @param {number} L_m   cavity length [m]
 * @returns {{ g1, g2, product, region }}
 *   region: 'stable' | 'unstable' | 'boundary'
 */
function g1g2Point(R1_m, R2_m, L_m) {
  const g1  = isFinite(R1_m) ? 1 - L_m / R1_m : 1;
  const g2  = isFinite(R2_m) ? 1 - L_m / R2_m : 1;
  const p   = g1 * g2;
  const eps = 1e-9;
  let region;
  if (Math.abs(p) <= eps || Math.abs(p - 1) <= eps) {
    region = 'boundary';
  } else if (p >= 0 && p <= 1) {
    region = 'stable';
  } else {
    region = 'unstable';
  }
  return { g1, g2, product: p, region };
}

/**
 * Scan cavity stability and beam sizes over a range of cavity lengths.
 * Uses a simple two-mirror cavity (no intracavity elements between mirrors).
 *
 * @param {number}   R1_m       ROC of mirror1 [m]  (Infinity for flat)
 * @param {number}   R2_m       ROC of mirror2 [m]  (Infinity for flat)
 * @param {number[]} L_range_m  [L_min, L_max] [m]
 * @param {number}   N          number of scan points
 * @param {number}   lambda_m   wavelength [m]
 * @returns {Array<{ L_m, g1, g2, product, stable, region, w1_m, w2_m }>}
 *   w1_m, w2_m: beam radii at mirror1/mirror2 [m], null if unstable
 */
function scanStability(R1_m, R2_m, L_range_m, N, lambda_m) {
  const [L_min, L_max] = L_range_m;
  const results = [];

  for (let i = 0; i < N; i++) {
    const L = L_min + (L_max - L_min) * i / (N - 1);
    const pt = g1g2Point(R1_m, R2_m, L);

    const m1  = makeElement(isFinite(R1_m) ? 'curvedMirror' : 'flatMirror',
                            isFinite(R1_m) ? { R_m: R1_m } : {});
    const m2  = makeElement(isFinite(R2_m) ? 'curvedMirror' : 'flatMirror',
                            isFinite(R2_m) ? { R_m: R2_m } : {});
    const ica = [makeElement('freeSpace', { L_m: L })];
    const Mrt = roundTripMatrix(m1, ica, m2);
    const em  = solveEigenmode(Mrt, lambda_m);

    let w1_m = null, w2_m = null;
    if (em.stable && em.q !== null) {
      w1_m = em.w_m;
      const q_m2 = propagateQ(em.q, ica[0].M);
      w2_m = beamRadius(q_m2, lambda_m);
    }

    results.push({
      L_m: L,
      g1:  pt.g1,
      g2:  pt.g2,
      product: pt.product,
      stable:  em.stable,
      region:  pt.region,
      w1_m,
      w2_m,
    });
  }

  return results;
}

/**
 * Find the cavity length that minimizes the beam waist at mirror1.
 * Searches within the scan results returned by scanStability.
 *
 * @param {Array}  scan_results  output of scanStability(...)
 * @returns {{ L_m, w1_m } | null}  null if no stable points found
 */
function findMinWaist(scan_results) {
  const stable = scan_results.filter(r => r.stable && r.w1_m !== null);
  if (!stable.length) return null;
  return stable.reduce((best, r) => r.w1_m < best.w1_m ? r : best, stable[0]);
}

if (typeof module !== 'undefined') {
  module.exports = { g1g2Point, scanStability, findMinWaist };
}
