// Phase 16 — Temperature-Dependent Refractive Index n(λ,T)
//
// Model: first-order thermo-optic correction to room-temperature Sellmeier
//   n(λ,T) ≈ n(λ,T₀) + α(λ) × (T − T₀),  T₀ = 25°C
//
// Provides thermoCorrectedCrystal(id, T_C) which returns a crystal wrapper
// with the same interface as getCrystal(), so solveSHG() works unchanged.
//
// Thermo-optic sources:
//   LBO: Ye & Kurtz (1993), calibrated to T_noncrit = 149°C
//        Key physics: dnx(532)/dT ≈ +2.0×10⁻⁴/°C (positive, unusual)
//                     dnz(1064)/dT ≈ −1.8×10⁻⁵/°C (near-zero)
//                     Difference 2.18×10⁻⁴/°C closes the gap 0.0269 in 124°C → 149°C ✓
//   KTP: Feve et al. (1995) — all axes positive dn/dT
//   BBO: Kato (1986) / Eimerl (1987) — small negative dn/dT

const _TREF = 25;  // reference temperature [°C]

// ── Thermo-optic coefficient tables ──────────────────────────────────────────
// α(λ) [/°C] evaluated by linear interpolation between 532 nm and 1064 nm.
// Format: { l532, l1064 } = α at each wavelength, linearly interpolated elsewhere.

const _ALPHA = {
  // LBO (calibrated: T_noncrit(XY Type-I 1064nm) = 149°C at φ=90°)
  lbo_x: { l532:  2.00e-4, l1064:  6.0e-5 },  // strongly positive at 532nm
  lbo_y: { l532:  1.10e-4, l1064:  4.0e-5 },
  lbo_z: { l532: -1.8e-5,  l1064: -1.8e-5 },  // near-zero, weakly negative

  // KTP (Feve 1995, approximate) — all positive
  ktp_x: { l532:  1.5e-5,  l1064:  1.0e-5 },
  ktp_y: { l532:  2.0e-5,  l1064:  1.3e-5 },
  ktp_z: { l532:  2.3e-5,  l1064:  1.5e-5 },

  // BBO (Kato 1986) — small negative, weak λ-dependence
  bbo_o: { l532: -1.80e-5, l1064: -1.60e-5 },
  bbo_e: { l532: -1.00e-5, l1064: -0.90e-5 },
};

function _alpha(key, lam_nm) {
  const { l532, l1064 } = _ALPHA[key];
  const t = Math.max(0, Math.min(1, (lam_nm - 532) / (1064 - 532)));
  return l532 + t * (l1064 - l532);
}

// ── Thermal correction helpers ────────────────────────────────────────────────

function _dnLBO(axis, lam_nm, dT) {
  return _alpha(`lbo_${axis}`, lam_nm) * dT;
}

function _dnKTP(axis, lam_nm, dT) {
  return _alpha(`ktp_${axis}`, lam_nm) * dT;
}

function _dnBBO(pol, lam_nm, dT) {
  // pol: 'o' or 'e'
  const key = pol === 'e' ? 'bbo_e' : 'bbo_o';
  return _alpha(key, lam_nm) * dT;
}

// ── Crystal wrappers ──────────────────────────────────────────────────────────

/**
 * Return a temperature-corrected crystal wrapper with the same n(λ_m, axis) interface.
 * solveSHG(), neEff(), walkOffAngle() etc. all work unchanged.
 *
 * @param {string} crystal_id  'bbo' | 'ktp' | 'lbo' | 'kdp' | 'ppln'
 * @param {number} T_C         temperature [°C]
 * @returns {object} crystal wrapper with n(lam_m, axis) method
 */
function thermoCorrectedCrystal(crystal_id, T_C) {
  const base = getCrystal(crystal_id);   // room-temperature crystal
  const dT   = T_C - _TREF;

  if (dT === 0) return base;  // no correction needed

  const wrapper = Object.create(base);  // inherit all properties

  switch (crystal_id) {
    case 'lbo':
      wrapper.n = function(lam_m, axis) {
        const lam_nm = lam_m * 1e9;
        return base.n(lam_m, axis) + _dnLBO(axis, lam_nm, dT);
      };
      break;
    case 'ktp':
      wrapper.n = function(lam_m, axis) {
        const lam_nm = lam_m * 1e9;
        return base.n(lam_m, axis) + _dnKTP(axis, lam_nm, dT);
      };
      break;
    case 'bbo':
      wrapper.n = function(lam_m, axis) {
        const lam_nm = lam_m * 1e9;
        return base.n(lam_m, axis) + _dnBBO(axis, lam_nm, dT);
      };
      break;
    case 'kdp':
      // KDP thermo-optic effect is small; use approximate uniform correction
      // dno/dT ≈ -1.9e-5, dne/dT ≈ +0.6e-5  (Eimerl 1987)
      wrapper.n = function(lam_m, axis) {
        const dn = axis === 'e' ? 0.6e-5 * dT : -1.9e-5 * dT;
        return base.n(lam_m, axis) + dn;
      };
      break;
    default:
      // PPLN and others: return base (PPLN already handles T in ppln.js)
      return base;
  }

  wrapper._T_C = T_C;
  wrapper._base_id = crystal_id;
  return wrapper;
}

/**
 * Temperature-corrected refractive index [direct, for plotting].
 *
 * @param {string} crystal_id  'bbo'|'ktp'|'lbo'|'kdp'
 * @param {string} axis        axis label ('o','e','x','y','z')
 * @param {number} lam_nm      wavelength [nm]
 * @param {number} T_C         temperature [°C]
 * @returns {number} n(λ,T)
 */
function nAtT(crystal_id, axis, lam_nm, T_C) {
  const base = getCrystal(crystal_id);
  const dT   = T_C - _TREF;
  const n0   = base.n(lam_nm * 1e-9, axis);
  switch (crystal_id) {
    case 'lbo': return n0 + _dnLBO(axis, lam_nm, dT);
    case 'ktp': return n0 + _dnKTP(axis, lam_nm, dT);
    case 'bbo': return n0 + _dnBBO(axis, lam_nm, dT);
    case 'kdp': return n0 + (axis === 'e' ? 0.6e-5 : -1.9e-5) * dT;
    default:    return n0;
  }
}

/**
 * LBO noncritical PM temperature for XY-plane Type-I SHG at pump_nm.
 * Solves for T where nz(pump,T) = nx(SH,T) exactly.
 *
 * @param {number} pump_nm  pump wavelength [nm]
 * @returns {number} T_noncrit [°C]
 */
function lbo_noncritical_T(pump_nm) {
  const sh_nm = pump_nm / 2;
  const base  = getCrystal('lbo');
  const nz0   = base.n(pump_nm * 1e-9, 'z');
  const nx0   = base.n(sh_nm   * 1e-9, 'x');
  const az    = _alpha('lbo_z', pump_nm);
  const ax    = _alpha('lbo_x', sh_nm);
  // nz0 + az×ΔT = nx0 + ax×ΔT → (nx0-nz0) = (az-ax)×ΔT
  const gap   = nz0 - nx0;           // > 0 at room T (nz > nx)
  const rate  = ax - az;             // > 0 (ax strongly positive)
  if (Math.abs(rate) < 1e-8) return Infinity;
  return _TREF + gap / rate;
}

if (typeof module !== 'undefined') {
  module.exports = { thermoCorrectedCrystal, nAtT, lbo_noncritical_T };
}
