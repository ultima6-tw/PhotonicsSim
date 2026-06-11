// OPO Threshold Calculation
// Requires bk-focus.js (bk_h, bk_xi, bk_optimal_w0) to be loaded first.
//
// Physical model: CW OPO with Gaussian pump, perfect phase matching, no walk-off.
//
// Single-pass parametric power gain (small signal):
//   G = Γ²_spec × (P_p / πw₀²) × L² × h(ξ)
//
// Coupling coefficient Γ²_spec [1/W] (independent of beam size and length):
//   Γ²_spec = 2 d_eff² ω_s ω_i / (n_p n_s n_i ε₀ c³)
//
// Threshold conditions:
//   DRO (signal + idler both resonant):  G_th = δ_s × δ_i
//   SRO (signal-only resonant):          G_th = δ_s
//   where δ = round-trip power loss (output coupler T + parasitic absorption A)
//
// Interface with CavitySim:
//   CavitySim gives zR_m (free-space Rayleigh range) → w₀ = √(λ_p × zR / π)
//   ξ = L / (2 n_p zR_free)
//
// Reference: Yariv "Quantum Electronics" 3rd ed., Ch. 17;
//            Boyd & Kleinman, J. Appl. Phys. 39, 3597 (1968).

const _OPO_C   = 2.997924e8;    // m/s
const _OPO_EPS = 8.854188e-12;  // ε₀ [F/m]

// ── Core coupling coefficient ─────────────────────────────────────────────────

/**
 * OPO coupling coefficient Γ²_spec [1/W].
 * Independent of beam size and crystal length.
 *
 * G = Γ²_spec × (P_pump / πw₀²) × L² × h(ξ)
 *
 * @param {number} d_eff_pmV    effective nonlinearity [pm/V]
 * @param {number} lambda_s_nm  signal wavelength [nm]
 * @param {number} lambda_i_nm  idler wavelength [nm]
 * @param {number} n_p          pump refractive index [dimensionless]
 * @param {number} n_s          signal refractive index
 * @param {number} n_i          idler refractive index
 * @returns {number} Γ²_spec [W⁻¹]
 */
function opo_specGamma2(d_eff_pmV, lambda_s_nm, lambda_i_nm, n_p, n_s, n_i) {
  const d   = d_eff_pmV * 1e-12;               // [m/V]
  const w_s = 2 * Math.PI * _OPO_C / (lambda_s_nm * 1e-9);  // [rad/s]
  const w_i = 2 * Math.PI * _OPO_C / (lambda_i_nm * 1e-9);
  return 2 * d * d * w_s * w_i / (n_p * n_s * n_i * _OPO_EPS * _OPO_C * _OPO_C * _OPO_C);
}

// ── Single-pass gain ──────────────────────────────────────────────────────────

/**
 * Single-pass parametric power gain for signal (small-signal, perfect PM).
 *
 * BK formulation: G = Γ²_spec × (2n_p/λ_p) × L × h(ξ) × P_pump
 * Derived by integrating Gaussian pump field through crystal:
 *   G = Γ²_spec × (P/πw₀²) × |∫ dz/(1+iz/z_R)|²
 *     = Γ²_spec × P × 2n_p/λ_p × L × arctan²(ξ)/ξ
 *
 * Optimal focusing: G is maximized at ξ_opt≈1.391 where h(ξ)=arctan²(ξ)/ξ peaks.
 *
 * @param {number} d_eff_pmV   effective nonlinearity [pm/V]
 * @param {number} lambda_p_nm pump wavelength [nm]
 * @param {number} lambda_s_nm signal wavelength [nm]
 * @param {number} lambda_i_nm idler wavelength [nm]
 * @param {number} n_p         pump index
 * @param {number} n_s         signal index
 * @param {number} n_i         idler index
 * @param {number} L_mm        crystal length [mm]
 * @param {number} w0_um       pump beam waist at crystal center [µm]
 * @param {number} P_W         pump power [W]
 * @returns {{ G: number, xi: number, h: number }}
 */
function opo_singlePassGain(d_eff_pmV, lambda_p_nm, lambda_s_nm, lambda_i_nm,
                             n_p, n_s, n_i, L_mm, w0_um, P_W) {
  const Gamma2   = opo_specGamma2(d_eff_pmV, lambda_s_nm, lambda_i_nm, n_p, n_s, n_i);
  const lambda_p = lambda_p_nm * 1e-9;                // [m]
  const L        = L_mm * 1e-3;                       // [m]
  const xi       = bk_xi(L_mm, lambda_p_nm, n_p, w0_um);
  const h        = bk_h(xi);
  const G        = Gamma2 * (2 * n_p / lambda_p) * L * h * P_W;
  return { G, xi, h };
}

// ── OPO threshold ─────────────────────────────────────────────────────────────

/**
 * CW OPO threshold pump power from beam waist.
 *
 * @param {object} p
 * @param {number} p.d_eff_pmV     effective nonlinearity [pm/V]
 * @param {number} p.lambda_p_nm   pump wavelength [nm]
 * @param {number} p.lambda_s_nm   signal wavelength [nm]
 * @param {number} p.lambda_i_nm   idler wavelength [nm]
 * @param {number} p.n_p           pump refractive index
 * @param {number} p.n_s           signal refractive index
 * @param {number} p.n_i           idler refractive index
 * @param {number} p.L_mm          crystal length [mm]
 * @param {number} p.w0_um         pump beam waist at crystal center [µm]
 * @param {number} p.delta_s       signal round-trip power loss (T_s + A_s) [0–1]
 * @param {number} [p.delta_i]     idler round-trip power loss (DRO only; default = delta_s)
 * @param {string} [p.mode]        'DRO' (default) or 'SRO'
 * @returns {{
 *   P_th_W: number,   threshold pump power [W]
 *   xi:     number,   focusing parameter ξ
 *   h:      number,   Boyd-Kleinman h(ξ)
 *   G_th:   number,   threshold gain
 *   Gamma2: number,   Γ²_spec [1/W]
 *   w0_um:  number    beam waist [µm]
 * }}
 */
function opo_threshold({ d_eff_pmV, lambda_p_nm, lambda_s_nm, lambda_i_nm,
                          n_p, n_s, n_i, L_mm, w0_um,
                          delta_s, delta_i, mode = 'DRO' }) {
  if (delta_i === undefined) delta_i = delta_s;
  const Gamma2   = opo_specGamma2(d_eff_pmV, lambda_s_nm, lambda_i_nm, n_p, n_s, n_i);
  const lambda_p = lambda_p_nm * 1e-9;              // [m]
  const L        = L_mm * 1e-3;                     // [m]
  const xi       = bk_xi(L_mm, lambda_p_nm, n_p, w0_um);
  const h        = bk_h(xi);
  const G_th     = (mode === 'SRO') ? delta_s : delta_s * delta_i;
  // P_th = G_th × λ_p / (2n_p × Γ²_spec × L × h(ξ))
  // Derived from G = Γ²_spec × (2n_p/λ_p) × L × h(ξ) × P at threshold
  const P_th     = G_th * lambda_p / (2 * n_p * Gamma2 * L * h);
  return { P_th_W: P_th, xi, h, G_th, Gamma2, w0_um };
}

/**
 * CW OPO threshold from CavitySim Rayleigh range (free-space zR).
 *
 * CavitySim eigenmode returns zR [m] (free-space Rayleigh range).
 * The physical beam waist at the crystal: w₀ = √(λ_p × zR / π).
 *
 * @param {object} p  same as opo_threshold but with zR_m instead of w0_um
 * @param {number} p.zR_m  free-space Rayleigh range from CavitySim [m]
 * @returns same as opo_threshold
 */
function opo_threshold_from_zR({ d_eff_pmV, lambda_p_nm, lambda_s_nm, lambda_i_nm,
                                   n_p, n_s, n_i, L_mm, zR_m,
                                   delta_s, delta_i, mode = 'DRO' }) {
  const lambda_p = lambda_p_nm * 1e-9;
  const w0_m  = Math.sqrt(lambda_p * zR_m / Math.PI);   // w₀ from free-space zR
  const w0_um = w0_m * 1e6;
  return { ...opo_threshold({ d_eff_pmV, lambda_p_nm, lambda_s_nm, lambda_i_nm,
                               n_p, n_s, n_i, L_mm, w0_um,
                               delta_s, delta_i, mode }),
           zR_m };
}

// ── Scan functions ────────────────────────────────────────────────────────────

/**
 * Scan P_th vs crystal length L, keeping w₀ fixed.
 *
 * @param {object} base   same fields as opo_threshold (except L_mm)
 * @param {number} L_min  minimum crystal length [mm]
 * @param {number} L_max  maximum crystal length [mm]
 * @param {number} N      number of points (default 100)
 * @returns {Array<{ L_mm, P_th_W, xi, h }>}
 */
function opo_scanL(base, L_min, L_max, N = 100) {
  const results = [];
  for (let i = 0; i < N; i++) {
    const L_mm = L_min + (L_max - L_min) * i / (N - 1);
    const r = opo_threshold({ ...base, L_mm });
    results.push({ L_mm, P_th_W: r.P_th_W, xi: r.xi, h: r.h });
  }
  return results;
}

/**
 * Scan P_th vs beam waist w₀, keeping L fixed.
 *
 * @param {object} base   same fields as opo_threshold (except w0_um)
 * @param {number} w_min  minimum waist [µm]
 * @param {number} w_max  maximum waist [µm]
 * @param {number} N      number of points (default 100)
 * @returns {Array<{ w0_um, P_th_W, xi, h }>}
 */
function opo_scanW0(base, w_min, w_max, N = 100) {
  const results = [];
  for (let i = 0; i < N; i++) {
    const w0_um = w_min + (w_max - w_min) * i / (N - 1);
    const r = opo_threshold({ ...base, w0_um });
    results.push({ w0_um, P_th_W: r.P_th_W, xi: r.xi, h: r.h });
  }
  return results;
}

/**
 * Find optimal w₀ (minimum P_th) for given crystal length and losses.
 *
 * @param {object} base  same fields as opo_threshold (except w0_um)
 * @returns {{ w0_opt_um, P_th_min_W, xi_opt, h_opt }}
 */
function opo_optimalW0(base) {
  // ξ_opt ≈ 1.391 (B=0, σ=0) — use bk_optimal_w0
  const opt = bk_optimal_w0(base.L_mm, base.lambda_p_nm, base.n_p, 0);
  const r = opo_threshold({ ...base, w0_um: opt.w0_um });
  return { w0_opt_um: opt.w0_um, P_th_min_W: r.P_th_W, xi_opt: opt.xi_opt, h_opt: opt.h_max };
}

if (typeof module !== 'undefined') {
  module.exports = {
    opo_specGamma2,
    opo_singlePassGain,
    opo_threshold,
    opo_threshold_from_zR,
    opo_scanL,
    opo_scanW0,
    opo_optimalW0,
  };
}
