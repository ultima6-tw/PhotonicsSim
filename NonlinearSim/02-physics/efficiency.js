// Phase 6 — SHG Conversion Efficiency + Acceptance Bandwidth
// Phase 12 — Depleted pump: tanh² (Armstrong 1962)
// Phase 13 — Boyd-Kleinman focusing: h(ξ,B) replaces plane-wave A=πw₀² approximation
//
// Full formula (Phase 12+13):
//   Γ_BK = 2ω²d²Lk₁ / (π n²_pump n_sh c³ε₀)   [1/W, from bk-focus.js]
//   η = tanh²(√(Γ_BK · P · h(ξ, B)))
//   Plane-wave limit: h(ξ→0) → ξ, Γ_BK·ξ = Γ_plane ✓
//
// Requires bk-focus.js to be loaded before this file.
// Δk convention: k = 2πn/λ (same as phase-match.js)
// Bandwidth: sinc²(ΔkL/2) = 0.5  →  |ΔkL/2| = 1.39  →  Δk_FWHM = 2.78/L

const _C   = 2.997924e8;    // m/s
const _EPS = 8.854188e-12;  // ε₀ [F/m]

// ── Standard d_eff table [pm/V] ──────────────────────────────────────────────
// Sources: Dmitriev et al. "Handbook of Nonlinear Optical Crystals" (1999)
// Convention: P = 2ε₀ d E², d in pm/V = 1e-12 m/V
// For PPLN: (2/π)·d33 corrects for QPM duty cycle (1st-order)
const DEFF_TABLE = {
  bbo: {
    typeI_1064:  2.00,   // θ≈22.8°, φ=90° (common cut)
    typeI_532:   1.85,   // θ≈29.2°, SHG 800nm pump
    typeII_1064: 0.88,
  },
  ktp: {
    typeII_1064: 3.50,   // θ=90°, φ=23.5°; higher estimates cite 7-9 pm/V (see note)
    // Note: literature quotes vary 3-9 pm/V depending on d-tensor convention
  },
  lbo: {
    typeI_1064:  0.85,   // noncritical PM (T≈148°C)
    typeII_1064: 0.83,
  },
  kdp: {
    typeI_1064:  0.24,   // θ≈41°
  },
  ppln: {
    shg_1064:   17.2,    // (2/π) × d33 = (2/π) × 27 pm/V
    shg_generic: 17.2,
  },
};

// ── Core efficiency formula ───────────────────────────────────────────────────

// Internal: normalized coupling coefficient Γ [1/W] at Δk=0, plane wave.
// η_undepleted = Γ · P_W  (valid only for η << 1)
function _shg_Gamma(deff_pmV, lambda_pump_nm, n_pump, n_sh, L_mm, w0_um) {
  const d  = deff_pmV * 1e-12;
  const om = 2 * Math.PI * _C / (lambda_pump_nm * 1e-9);
  const L  = L_mm * 1e-3;
  const A  = Math.PI * (w0_um * 1e-6) ** 2;
  return 2 * om ** 2 * d ** 2 * L ** 2 / (n_pump ** 2 * n_sh * _C ** 3 * _EPS * A);
}

/**
 * SHG single-pass efficiency — Boyd-Kleinman focusing + depleted pump.
 * Uses BK h(ξ,B) for Gaussian beam focusing correction (Phase 13).
 * Uses tanh² for pump depletion (Phase 12).
 *
 * Requires bk-focus.js (bk_Gamma, bk_h, bk_xi, bk_B) to be loaded first.
 *
 * @param {number} deff_pmV        effective NL coefficient [pm/V]
 * @param {number} lambda_pump_nm  pump wavelength [nm]
 * @param {number} n_pump          refractive index at pump
 * @param {number} n_sh            refractive index at SH
 * @param {number} L_mm            crystal length [mm]
 * @param {number} P_W             pump power [W]
 * @param {number} w0_um           1/e² beam radius at waist [µm]
 * @param {number} [rho_mrad=0]    walk-off angle [mrad] (0 for PPLN/noncritical PM)
 * @returns {number} η = tanh²(√(Γ_BK·P·h(ξ,B))) ∈ [0, 1)
 */
function shg_efficiency(deff_pmV, lambda_pump_nm, n_pump, n_sh, L_mm, P_W, w0_um, rho_mrad = 0) {
  const Gamma_BK = bk_Gamma(deff_pmV, lambda_pump_nm, n_pump, n_sh, L_mm);
  const xi       = bk_xi(L_mm, lambda_pump_nm, n_pump, w0_um);
  const B        = bk_B(rho_mrad, L_mm, lambda_pump_nm, n_pump);
  const h        = bk_h(xi, B);
  const gamma    = Math.sqrt(Gamma_BK * P_W * h);
  return Math.tanh(gamma) ** 2;
}

// ── Numerical derivative helpers ─────────────────────────────────────────────

// d(Δk_typeI)/dλ  [rad/m per m = rad/m²]
function _dkdlam_typeI(theta_rad, lambda_pump_m, crystal, dlam = 1e-11) {
  return (deltaK_typeI(theta_rad, lambda_pump_m + dlam, crystal) -
          deltaK_typeI(theta_rad, lambda_pump_m - dlam, crystal)) / (2 * dlam);
}

// d(Δk_typeII)/dλ
function _dkdlam_typeII(theta_rad, lambda_pump_m, crystal, dlam = 1e-11) {
  return (deltaK_typeII(theta_rad, lambda_pump_m + dlam, crystal) -
          deltaK_typeII(theta_rad, lambda_pump_m - dlam, crystal)) / (2 * dlam);
}

// d(Δk_typeI)/dθ  [rad/m per rad = 1/m]
function _dkdtheta_typeI(theta_rad, lambda_pump_m, crystal, dth = 1e-5) {
  return (deltaK_typeI(theta_rad + dth, lambda_pump_m, crystal) -
          deltaK_typeI(theta_rad - dth, lambda_pump_m, crystal)) / (2 * dth);
}

function _dkdtheta_typeII(theta_rad, lambda_pump_m, crystal, dth = 1e-5) {
  return (deltaK_typeII(theta_rad + dth, lambda_pump_m, crystal) -
          deltaK_typeII(theta_rad - dth, lambda_pump_m, crystal)) / (2 * dth);
}

// ── Spectral acceptance bandwidth ─────────────────────────────────────────────
/**
 * FWHM spectral acceptance bandwidth for SHG (birefringent PM).
 * Δλ_FWHM = 2.78 / (L × |d(Δk)/dλ|)
 * @param {number} theta_deg        PM angle [degrees]
 * @param {number} lambda_pump_nm   pump wavelength [nm]
 * @param {object} crystal          crystal object (from crystal DB)
 * @param {number} L_mm             crystal length [mm]
 * @param {string} type             'I' or 'II'
 * @returns {number} Δλ_FWHM [nm]
 */
function spectral_bw_shg(theta_deg, lambda_pump_nm, crystal, L_mm, type = 'I') {
  const theta = theta_deg * Math.PI / 180;
  const lp    = lambda_pump_nm * 1e-9;
  const L     = L_mm * 1e-3;
  const dkdl  = type === 'I'
    ? _dkdlam_typeI(theta, lp, crystal)
    : _dkdlam_typeII(theta, lp, crystal);
  if (!isFinite(dkdl) || Math.abs(dkdl) < 1e-3) return Infinity;
  return 2.78 / (L * Math.abs(dkdl)) * 1e9;  // nm
}

// ── Angular acceptance bandwidth ──────────────────────────────────────────────
/**
 * FWHM angular acceptance bandwidth for SHG.
 * Δθ_FWHM = 2.78 / (L × |d(Δk)/dθ|)
 * @returns {number} Δθ_FWHM [mrad]
 */
function angular_bw_shg(theta_deg, lambda_pump_nm, crystal, L_mm, type = 'I') {
  const theta = theta_deg * Math.PI / 180;
  const lp    = lambda_pump_nm * 1e-9;
  const L     = L_mm * 1e-3;
  const dkdt  = type === 'I'
    ? _dkdtheta_typeI(theta, lp, crystal)
    : _dkdtheta_typeII(theta, lp, crystal);
  if (!isFinite(dkdt) || Math.abs(dkdt) < 1) return Infinity;
  return 2.78 / (L * Math.abs(dkdt)) * 1e3;  // mrad
}

// ── Walk-off angle (re-exported for convenience) ──────────────────────────────
// walkOffAngle is defined in phase-match.js (if loaded)

// ── Normalised SHG efficiency [%/W] ──────────────────────────────────────────
/**
 * Normalised coupling coefficient Γ [1/W]: η_undepleted = Γ × P_W.
 * Multiply by 100 for %/W. Used for crystal comparison independent of power.
 * Use shg_efficiency() for actual η (includes pump depletion).
 */
function shg_gamma(deff_pmV, lambda_pump_nm, n_pump, n_sh, L_mm, w0_um) {
  return _shg_Gamma(deff_pmV, lambda_pump_nm, n_pump, n_sh, L_mm, w0_um);
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFF_TABLE,
    shg_efficiency,
    spectral_bw_shg,
    angular_bw_shg,
    shg_gamma,
  };
}
