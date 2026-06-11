// Phase 5 — PPLN QPM (Quasi-Phase-Matching) with temperature tuning
// Depends on: PPLN (ppln.js) loaded in browser or required in Node
//
// Convention: k = n/λ  (same as ppln.js — NOT 2πn/λ)
//   QPM period  Λ = 1/|Δk_free|  where Δk_free = k(2ω) - 2·k(ω)
//
// Process: eee — all extraordinary (uses d33, highest nonlinear coefficient)

// ── Brent's method (bracket-and-converge root finder) ────────────────────────
function _brent(f, a, b, tol, maxIter) {
  let fa = f(a), fb = f(b);
  if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; fa = fb; b = c; fb = fc; c = a; fc = fa;
    }
    const tol1 = 2e-16 * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) < tol1 || Math.abs(fb) < tol) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q, r, s = fb / fa;
      if (a === c) {
        p = 2 * xm * s; q = 1 - s;
      } else {
        q = fa / fc; r = fb / fc;
        p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d; d = p / q;
      } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : tol1 * Math.sign(xm);
    fb = f(b);
  }
  return b;
}

// ── SHG functions ─────────────────────────────────────────────────────────────

/**
 * Residual Δk for PPLN SHG at given pump wavelength, period, temperature.
 * Returns 0 when perfectly phase-matched.
 * @param {number} lambda_pump_m  pump wavelength [m]
 * @param {number} period_m       poling period [m]
 * @param {number} T_C            temperature [°C]
 */
function deltaK_SHG_QPM(lambda_pump_m, period_m, T_C) {
  const np = PPLN.ne(lambda_pump_m, T_C);
  const ns = PPLN.ne(lambda_pump_m / 2, T_C);
  const dk_free = ns / (lambda_pump_m / 2) - 2 * np / lambda_pump_m;  // [1/m]
  return dk_free - 1.0 / period_m;
}

/**
 * Required QPM period for SHG at given pump and temperature.
 * Wraps PPLN.qpmPeriod for SHG (eee process).
 * @returns {number} period [µm]
 */
function ppln_shg_period(lambda_pump_nm, T_C = 25) {
  return PPLN.qpmPeriod(lambda_pump_nm * 1e-9, T_C, 'e') * 1e6;
}

/**
 * Temperature tuning for SHG: fixed period Λ, sweep T.
 * At each T, solves for the pump wavelength where QPM is satisfied.
 * @param {number} period_um  poling period [µm]
 * @param {number} T_min      [°C]
 * @param {number} T_max      [°C]
 * @param {number} n_pts
 * @returns {Array<{T_C, lambda_pump_nm, lambda_sh_nm}>}
 */
function ppln_shg_temp_tuning(period_um, T_min = 20, T_max = 200, n_pts = 100) {
  const period_m = period_um * 1e-6;
  const results = [];
  for (let i = 0; i < n_pts; i++) {
    const T = T_min + (T_max - T_min) * i / (n_pts - 1);
    const f = (lp_nm) => deltaK_SHG_QPM(lp_nm * 1e-9, period_m, T);
    // Search over PPLN transparency window (pump: 700–4000nm, SH: 350–2000nm)
    const lp_nm = _brent(f, 700, 3900, 0.001, 100);
    if (lp_nm !== null) {
      results.push({ T_C: T, lambda_pump_nm: lp_nm, lambda_sh_nm: lp_nm / 2 });
    }
  }
  return results;
}

// ── OPO functions ─────────────────────────────────────────────────────────────

/**
 * Residual Δk for PPLN OPO (eee process) at given signal wavelength.
 * QPM convention: n_p/λ_p - n_s/λ_s - n_i/λ_i = 1/Λ
 * λ_i from energy conservation: λ_i = λ_p·λ_s / (λ_s - λ_p)
 * @param {number} lambda_s_m   signal wavelength [m]
 * @param {number} lambda_p_m   pump wavelength [m]
 * @param {number} period_m     poling period [m]
 * @param {number} T_C          temperature [°C]
 */
function deltaK_OPO_QPM(lambda_s_m, lambda_p_m, period_m, T_C) {
  if (lambda_s_m <= lambda_p_m) return NaN;
  const lambda_i_m = lambda_s_m * lambda_p_m / (lambda_s_m - lambda_p_m);
  if (lambda_i_m > 5e-6) return NaN;
  const np = PPLN.ne(lambda_p_m, T_C);
  const ns = PPLN.ne(lambda_s_m, T_C);
  const ni = PPLN.ne(lambda_i_m, T_C);
  return np / lambda_p_m - ns / lambda_s_m - ni / lambda_i_m - 1.0 / period_m;
}

/**
 * PPLN OPO temperature tuning: fixed pump + period, sweep T.
 * At each T, solves for signal/idler pair satisfying QPM + energy conservation.
 * @param {number} pump_nm    pump wavelength [nm]
 * @param {number} period_um  poling period [µm]
 * @param {number} T_min      [°C]
 * @param {number} T_max      [°C]
 * @param {number} n_pts
 * @returns {Array<{T_C, lambda_signal_nm, lambda_idler_nm}>}
 */
function ppln_opo_temp_tuning(pump_nm, period_um, T_min = 20, T_max = 200, n_pts = 100) {
  const lp_m = pump_nm * 1e-9;
  const period_m = period_um * 1e-6;
  const results = [];
  for (let i = 0; i < n_pts; i++) {
    const T = T_min + (T_max - T_min) * i / (n_pts - 1);
    const pair = _find_opo_pair(lp_m, period_m, T);
    if (pair) results.push({ T_C: T, ...pair });
  }
  return results;
}

function _find_opo_pair(lp_m, period_m, T_C) {
  const degen_m = 2 * lp_m;
  const f = (ls_nm) => deltaK_OPO_QPM(ls_nm * 1e-9, lp_m, period_m, T_C);

  const lo_nm  = lp_m * 1e9 * 1.005;
  const deg_nm = degen_m * 1e9;
  const hi_nm  = 4900;   // near PPLN transparency edge

  // Try both sides of degeneracy; report the "signal" (shorter of the two)
  let ls_nm = null;
  const fl = f(lo_nm), fd_lo = f(deg_nm * 0.999);
  if (isFinite(fl) && isFinite(fd_lo) && fl * fd_lo < 0) {
    ls_nm = _brent(f, lo_nm, deg_nm * 0.999, 1, 100);
  }
  if (ls_nm === null) {
    const fd_hi = f(deg_nm * 1.001), fh = f(hi_nm);
    if (isFinite(fd_hi) && isFinite(fh) && fd_hi * fh < 0) {
      ls_nm = _brent(f, deg_nm * 1.001, hi_nm, 1, 100);
    }
  }
  if (ls_nm === null) return null;

  const li_nm = lp_m * 1e9 * ls_nm / (ls_nm - lp_m * 1e9);
  if (li_nm <= 0 || !isFinite(li_nm)) return null;

  // Return signal as the shorter-wavelength output
  const s = Math.min(ls_nm, li_nm);
  const ii = Math.max(ls_nm, li_nm);
  return { lambda_signal_nm: s, lambda_idler_nm: ii };
}

if (typeof module !== 'undefined') {
  module.exports = {
    deltaK_SHG_QPM, ppln_shg_period, ppln_shg_temp_tuning,
    deltaK_OPO_QPM, ppln_opo_temp_tuning,
  };
}
