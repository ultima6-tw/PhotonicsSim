// Phase 15 — Group Velocity Dispersion & Group Velocity Mismatch
//
// All functions accept an n_func(lam_nm) callback so they work for any
// polarization (ordinary, extraordinary effective, biaxial) without coupling
// to specific crystal objects.
//
// Outputs:
//   GVD  β₂  [fs²/mm]  — temporal pulse broadening per unit length
//   GVM  δ   [fs/mm]   — temporal walk-off between pump and SH
//
// Physical formulas (λ in meters):
//   Group index:      N = n − λ dn/dλ
//   Group velocity:   vg = c/N                        [m/s]
//   GVD:              β₂ = (λ³/2πc²) × d²n/dλ²      [s²/m] → ×10²⁷ for [fs²/mm]
//   GVM (pump→SH):    δ = (N_pump − N_sh)/c          [s/m]  → ×10¹² for [fs/mm]
//
// Numerical differentiation: 4th-order central 5-point stencil.
// Step size h = 1 nm gives < 0.01% error for smooth Sellmeier curves.

const _GVD_C = 2.997924e8;  // m/s

// ── 5-point numerical derivatives (λ in nm) ───────────────────────────────────

function _d1(f, x, h) {
  return (-f(x + 2*h) + 8*f(x + h) - 8*f(x - h) + f(x - 2*h)) / (12 * h);
}

function _d2(f, x, h) {
  return (-f(x + 2*h) + 16*f(x + h) - 30*f(x) + 16*f(x - h) - f(x - 2*h)) / (12 * h * h);
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Group index N = n − λ(dn/dλ), with λ in nm.
 * N(λ) relates to pulse travel: vg = c/N.
 * For normal dispersion (dn/dλ < 0): N > n (pulse travels slower than phase).
 *
 * @param {function} n_func   (lam_nm: number) → n [dimensionless]
 * @param {number}   lam_nm   wavelength [nm]
 * @param {number}   [h=1]    differentiation step [nm]
 * @returns {number} group index N
 */
function groupIndex(n_func, lam_nm, h = 1.0) {
  const dndl = _d1(n_func, lam_nm, h);  // dn/d(λ_nm) [nm^-1]
  return n_func(lam_nm) - lam_nm * dndl;
}

/**
 * Group velocity vg = c / N(λ) [m/s].
 */
function groupVelocity(n_func, lam_nm) {
  return _GVD_C / groupIndex(n_func, lam_nm);
}

/**
 * Group velocity dispersion (GVD) β₂ [fs²/mm].
 *
 * β₂ = (λ³/2πc²) × d²n/dλ²     (λ in meters, d²n in m⁻²)
 *
 * In nm units: d²n/d(λ_nm)² × (1e9)² [m^-2] = d2n_nm × 1e18 [m^-2]
 * β₂[s²/m] = ((λ_nm×1e-9)³ / (2π c²)) × d2n_nm × 1e18
 * β₂[fs²/mm] = β₂[s²/m] × 10²⁷
 *
 * Positive β₂: normal dispersion (n increases toward shorter λ, common in crystals).
 * Negative β₂: anomalous dispersion (unusual for bulk crystals in visible range).
 *
 * @param {function} n_func   (lam_nm) → n
 * @param {number}   lam_nm   wavelength [nm]
 * @param {number}   [h=1]    differentiation step [nm]
 * @returns {number} β₂ [fs²/mm]
 */
function gvd(n_func, lam_nm, h = 1.0) {
  const lam_m  = lam_nm * 1e-9;
  const d2n_nm = _d2(n_func, lam_nm, h);           // d²n/d(λ_nm)² [nm^-2]
  const d2n_m  = d2n_nm * 1e18;                    // → d²n/d(λ_m)²  [m^-2]
  const beta2_SI = (lam_m ** 3) / (2 * Math.PI * _GVD_C ** 2) * d2n_m;  // [s²/m]
  return beta2_SI * 1e27;                           // [fs²/mm]
}

/**
 * Group velocity mismatch (GVM) between pump (ω) and second harmonic (2ω) [fs/mm].
 *
 * δ = 1/vg(pump) − 1/vg(SH) = (N_pump − N_sh) / c   [s/m]
 * δ [fs/mm] = δ [s/m] × 10¹²
 *
 * Positive δ: pump pulse travels slower than SH (arrives later).
 *
 * Walk-off length: L_walk = τ_pulse / |δ|  (where τ_pulse is the pulse duration [fs])
 *
 * @param {function} n_pump_func  (lam_nm) → n for pump polarization
 * @param {function} n_sh_func    (lam_nm) → n for SH polarization
 * @param {number}   lam_pump_nm  pump wavelength [nm]
 * @returns {number} δ [fs/mm]
 */
function gvm_shg(n_pump_func, n_sh_func, lam_pump_nm) {
  const N_pump = groupIndex(n_pump_func, lam_pump_nm);
  const N_sh   = groupIndex(n_sh_func,   lam_pump_nm / 2);
  const gvm_SI = (N_pump - N_sh) / _GVD_C;         // [s/m]
  return gvm_SI * 1e12;                             // [fs/mm]
}

/**
 * Crystal length limit for a given pulse duration (GVM-limited interaction length).
 * L_walk = τ_FWHM / |GVM|
 *
 * Crystal longer than L_walk: pump and SH walk apart → no further conversion gain.
 *
 * @param {number} tau_fs   pulse duration FWHM [fs]
 * @param {number} gvm_fsmm GVM [fs/mm] from gvm_shg()
 * @returns {number} L_walk [mm]
 */
function gvmWalkoffLength(tau_fs, gvm_fsmm) {
  return tau_fs / Math.abs(gvm_fsmm);
}

/**
 * Spectral bandwidth limit from GVD:
 * For a crystal of length L, the maximum phase-matched bandwidth is:
 * Δλ_GVD = sqrt(2 ln 2 / π) × λ² / (c × |β₂| × L)  [nm]
 *
 * A compressed pulse of this bandwidth accumulates < π phase slip across the crystal.
 * Useful for checking if crystal is GVD-limited for a given pulse duration.
 *
 * @param {number} beta2_fs2mm  GVD [fs²/mm]
 * @param {number} L_mm         crystal length [mm]
 * @param {number} lam_nm       center wavelength [nm]
 * @returns {number} Δλ_FWHM [nm]
 */
function gvdBandwidthLimit(beta2_fs2mm, L_mm, lam_nm) {
  // β₂[fs²/mm] → β₂[s²/m] = β₂[fs²/mm] × 10^-27
  const beta2_SI = beta2_fs2mm * 1e-27;  // s²/m
  const lam_m    = lam_nm * 1e-9;
  const L_m      = L_mm  * 1e-3;
  // Δω = sqrt(2 ln 2 / |β₂ L|) [rad/s]
  const domega = Math.sqrt(2 * Math.LN2 / Math.abs(beta2_SI * L_m));  // rad/s
  // Δλ = λ² / (2πc) × Δω
  return lam_m ** 2 / (2 * Math.PI * _GVD_C) * domega * 1e9;  // nm
}

if (typeof module !== 'undefined') {
  module.exports = { groupIndex, groupVelocity, gvd, gvm_shg, gvmWalkoffLength, gvdBandwidthLimit };
}
