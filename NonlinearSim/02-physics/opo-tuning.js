// Phase 4 — OPO tuning curve calculation
// Type-I OPO: e(pump) → o(signal) + o(idler)   [most common for BBO, KDP]
// Type-II OPO: e(pump) → o(signal) + e(idler)  [less common]
//
// Energy conservation: 1/λ_p = 1/λ_s + 1/λ_i  →  λ_i = λ_s·λ_p / (λ_s - λ_p)
// Phase matching:  k_p = k_s + k_i
//   Type-I:  ne_eff(θ,λ_p)/λ_p = no(λ_s)/λ_s + no(λ_i)/λ_i

// ── Δk for OPO (Type-I: e→o+o) ─────────────────────────────────────────────
// λ_s is the signal wavelength; λ_i is derived from energy conservation.
// Returns Δk in units of 1/m (same convention as phase-match.js: k=n/λ).
function deltaK_OPO_typeI(lambda_s_m, theta_rad, lambda_pump_m, crystal) {
  if (lambda_s_m <= lambda_pump_m) return NaN;
  const lambda_i_m = lambda_s_m * lambda_pump_m / (lambda_s_m - lambda_pump_m);
  const np = neEff(theta_rad, lambda_pump_m, crystal);
  const ns = crystal.n(lambda_s_m, 'o');
  const ni = crystal.n(lambda_i_m, 'o');
  return np / lambda_pump_m - ns / lambda_s_m - ni / lambda_i_m;
}

// Type-II OPO (e→o+e)
function deltaK_OPO_typeII(lambda_s_m, theta_rad, lambda_pump_m, crystal) {
  if (lambda_s_m <= lambda_pump_m) return NaN;
  const lambda_i_m = lambda_s_m * lambda_pump_m / (lambda_s_m - lambda_pump_m);
  const np = neEff(theta_rad, lambda_pump_m, crystal);
  const ns = crystal.n(lambda_s_m, 'o');
  const ni = neEff(theta_rad, lambda_i_m, crystal);   // idler is e-polarized
  return np / lambda_pump_m - ns / lambda_s_m - ni / lambda_i_m;
}

// ── Solve for signal wavelength at a given θ ────────────────────────────────
// Returns { lambda_s_m, lambda_i_m } where lambda_s_m ≤ lambda_i_m (signal = shorter),
// or null if no phase-matching in range.
//
// Algorithm: Δk has a local maximum at the degenerate wavelength (2×λ_pump).
// Simple endpoint bisection misses solutions when both endpoints have the same Δk sign.
// Fix: split search at 2×λ_pump and check each half independently.
//
// Lower bound fix: lo_m near pump → λ_i → ∞ → NaN in Sellmeier.
// Instead: ensure λ_i < lambda_s_max_m using energy conservation algebra.
function findOPOPair(theta_rad, lambda_pump_m, crystal, type = 'typeI',
                     lambda_s_max_m = 4e-6) {
  const dkFn = type === 'typeII'
    ? (ls) => deltaK_OPO_typeII(ls, theta_rad, lambda_pump_m, crystal)
    : (ls) => deltaK_OPO_typeI(ls,  theta_rad, lambda_pump_m, crystal);

  // lo_m: ensure λ_i = λ_s·λ_p/(λ_s−λ_p) < lambda_s_max_m
  // → λ_s > λ_p·lambda_s_max / (lambda_s_max − λ_p)
  const lo_min = lambda_pump_m * lambda_s_max_m / (lambda_s_max_m - lambda_pump_m);
  const lo_m  = Math.max(lambda_pump_m * 1.001, lo_min * 1.005);
  const hi_m  = lambda_s_max_m;
  const mid_m = 2 * lambda_pump_m;  // degenerate wavelength (Δk local max)

  function bisect(a, b) {
    const fa = dkFn(a), fb = dkFn(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    let lo = a, hi = b;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) * 0.5;
      if (hi - lo < 1e-13) break;
      if (dkFn(lo) * dkFn(mid) <= 0) hi = mid; else lo = mid;
    }
    const lambda_s_m = (lo + hi) * 0.5;
    const lambda_i_m = lambda_s_m * lambda_pump_m / (lambda_s_m - lambda_pump_m);
    return { lambda_s_m, lambda_i_m };
  }

  // Lower half [lo_m, 2λ_p]: λ_s < 2λ_p → λ_i > 2λ_p (signal = shorter, conventional)
  const lower = bisect(lo_m, mid_m);
  if (lower) return lower;

  // Upper half [2λ_p, hi_m]: λ_s > 2λ_p → λ_i < λ_s; swap to return shorter as signal
  const upper = bisect(mid_m, hi_m);
  if (upper) {
    return { lambda_s_m: upper.lambda_i_m, lambda_i_m: upper.lambda_s_m };
  }

  return null;
}

// ── Generate tuning curve ────────────────────────────────────────────────────
// Returns array of { theta_deg, lambda_s_nm, lambda_i_nm }
// Only includes angles where phase matching exists.
function opoTuningCurve(lambda_pump_m, crystal, type = 'typeI',
                        theta_min_deg = 0, theta_max_deg = 90, nPoints = 80) {
  const results = [];
  const DEG = Math.PI / 180;
  for (let i = 0; i <= nPoints; i++) {
    const theta = (theta_min_deg + (theta_max_deg - theta_min_deg) * i / nPoints) * DEG;
    const pair = findOPOPair(theta, lambda_pump_m, crystal, type);
    if (pair) {
      results.push({
        theta_deg:    theta / DEG,
        lambda_s_nm:  pair.lambda_s_m * 1e9,
        lambda_i_nm:  pair.lambda_i_m * 1e9,
      });
    }
  }
  return results;
}

if (typeof module !== 'undefined') {
  module.exports = { deltaK_OPO_typeI, deltaK_OPO_typeII, findOPOPair, opoTuningCurve };
}
