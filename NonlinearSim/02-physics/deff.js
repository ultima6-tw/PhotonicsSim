// Phase 14 — d_eff(θ) from d-tensor
// Dynamic effective nonlinear coefficient calculation.
// Replaces hardcoded DEFF_TABLE with angle-dependent formulas.
//
// Sources:
//   Dmitriev et al., "Handbook of Nonlinear Optical Crystals", 3rd ed. (1999)
//   Kato & Takaoka, Appl. Opt. 41, 5040 (2002) for KTP d-values
//
// Derivation method (for each crystal):
//   d_eff = ê(2ω) · d̂ : [ê(ω) ⊗ ê(ω)]   (or ê₁⊗ê₂ for Type-II)
//   where d̂ is the 2nd-rank Voigt d-tensor and ê are polarization unit vectors.

// ── BBO (point group 3m) ─────────────────────────────────────────────────────
// Independent components: d_22, d_31 (d_15 = d_31 by Kleinman symmetry)
// Values: d_22 = 2.2 pm/V, d_31 = -0.16 pm/V  (Dmitriev 1999)
//
// Standard cut: φ = 90° (XZ-plane propagation, or equivalently Z-X principal plane)
//
// Type-I  (o+o→e, two ordinary pump → extraordinary SH):
//   ê₁ = ê₂ = ô(ω)  polarized in XY plane perpendicular to k
//   ê₃ = ê(2ω)      extraordinary, in plane of k and Z
//   d_eff = d_22 cos(θ) + d_31 sin(θ)     [for standard φ=90° cut]
//
// Type-II (o+e→e):
//   d_eff ≈ d_22 cos(2θ)                  [approximate, for φ=90°]

const _BBO = { d22: 2.2, d31: -0.16 };

/**
 * d_eff for BBO SHG.
 * @param {string} type  'I' or 'II'
 * @param {number} theta_deg  PM angle θ from optical axis [degrees]
 * @returns {number} d_eff [pm/V]
 */
function deff_bbo(type, theta_deg) {
  const t = theta_deg * Math.PI / 180;
  if (type === 'I') {
    return _BBO.d22 * Math.cos(t) + _BBO.d31 * Math.sin(t);
  }
  if (type === 'II') {
    return Math.abs(_BBO.d22 * Math.cos(2 * t));
  }
  return null;
}

// ── KTP (point group mm2) ─────────────────────────────────────────────────────
// d-tensor components (Kato 1994, matching our Sellmeier source):
//   d_15 = 2.04 pm/V,  d_24 = 3.92 pm/V,  d_33 = 15.3 pm/V
//   d_31 = 2.04 pm/V,  d_32 = 3.92 pm/V
//
// XY-plane Type-II (SF→F):
//   Propagation at angle φ from X-axis.
//   Slow wave: ê_slow = ẑ  (nz, z-polarized)
//   Fast wave: ê_fast = (-sin φ, cos φ, 0)
//
//   Voigt S-vector for ê_slow × ê_fast:
//     S_4 = ê_slow_z × ê_fast_y = cos φ
//     S_5 = ê_slow_z × ê_fast_x = -sin φ
//   P(2ω)_x = d_15 × S_5 = -d_15 sin φ
//   P(2ω)_y = d_24 × S_4 =  d_24 cos φ
//   d_eff = ê_fast(2ω) · P = (-sin φ)(-d_15 sin φ) + (cos φ)(d_24 cos φ)
//         = d_15 sin²φ + d_24 cos²φ

const _KTP = { d15: 2.04, d24: 3.92, d33: 15.3 };

/**
 * d_eff for KTP SHG in XY plane.
 * @param {string} type  'II' (only Type-II supported in XY plane for SHG 1064nm)
 * @param {number} phi_deg  PM angle φ from X-axis in XY plane [degrees]
 * @returns {number} d_eff [pm/V]
 */
function deff_ktp(type, phi_deg) {
  if (type === 'II') {
    const p = phi_deg * Math.PI / 180;
    const s = Math.sin(p), c = Math.cos(p);
    return _KTP.d15 * s * s + _KTP.d24 * c * c;
  }
  return null;
}

// ── LBO (point group mm2) ─────────────────────────────────────────────────────
// d-tensor components (Kato 1994):
//   d_31 = -0.67 pm/V,  d_32 = 0.85 pm/V,  d_33 ≈ 0.0 pm/V
//
// XY-plane Type-I (SS→F): two slow (Z-polarized) → one fast (in-plane)
//   ê₁ = ê₂ = ẑ  (z-polarized slow waves)
//   ê_fast = (-sin φ, cos φ, 0)
//
//   S-vector for ẑ × ẑ:
//     S_3 = 1  (zz component)
//   P(2ω) = (d_31, d_32, d_33) × 1 = (d_31, d_32, d_33)
//   d_eff = ê_fast · P = -sin φ × d_31 + cos φ × d_32
//         = d_32 cos φ - d_31 sin φ

const _LBO = { d31: -0.67, d32: 0.85, d33: 0.0 };

/**
 * d_eff for LBO SHG in XY plane.
 * @param {string} type  'I' (Type-I SS→F in XY plane)
 * @param {number} phi_deg  PM angle φ from X-axis in XY plane [degrees]
 * @returns {number} d_eff [pm/V]
 */
function deff_lbo(type, phi_deg) {
  if (type === 'I') {
    const p = phi_deg * Math.PI / 180;
    return _LBO.d32 * Math.cos(p) - _LBO.d31 * Math.sin(p);
  }
  return null;
}

// ── KDP (point group -42m) ────────────────────────────────────────────────────
// Only non-zero d-component for SHG: d_36 = 0.39 pm/V  (Dmitriev 1999)
//
// For propagation in principal plane (φ = 45° standard cut):
//   d_eff = d_36 sin θ cos θ × (some φ factor) → simplifies to d_36 sin(θ)
//   at φ=45°, sin(2φ) = 1, so d_eff = d_36 |sin θ|

const _KDP = { d36: 0.39 };

/**
 * d_eff for KDP SHG (Type-I, standard φ=45° cut).
 * @param {string} type  'I'
 * @param {number} theta_deg  PM angle θ from optical axis [degrees]
 * @returns {number} d_eff [pm/V]
 */
function deff_kdp(type, theta_deg) {
  if (type === 'I') {
    return Math.abs(_KDP.d36 * Math.sin(theta_deg * Math.PI / 180));
  }
  return null;
}

// ── PPLN (QPM, 3m LiNbO₃) ────────────────────────────────────────────────────
// Quasi-phase matching uses the d_33 component.
// d_33 = 27 pm/V  (MgO:LiNbO₃, Gayer 2008)
// QPM 1st-order duty-cycle correction: d_eff = (2/π) × d_33

const _PPLN = { d33: 27.0 };

/**
 * d_eff for PPLN QPM SHG (angle-independent).
 * @returns {number} d_eff [pm/V]
 */
function deff_ppln() {
  return (2 / Math.PI) * _PPLN.d33;  // = 17.19 pm/V
}

// ── Unified dispatcher ────────────────────────────────────────────────────────

/**
 * Compute d_eff [pm/V] for a given crystal, interaction type, and PM angle.
 * Replaces the hardcoded DEFF_TABLE lookup in efficiency.js / solver.js.
 *
 * @param {string} crystal_id  'bbo' | 'ktp' | 'lbo' | 'kdp' | 'ppln'
 * @param {string} type        'I' | 'II' | 'QPM'
 * @param {number} angle_deg   PM angle (θ for uniaxial, φ for biaxial) [degrees]
 * @returns {number|null} d_eff [pm/V], or null if not available
 */
function getDeff(crystal_id, type, angle_deg) {
  switch (crystal_id) {
    case 'bbo':  return deff_bbo(type, angle_deg);
    case 'ktp':  return deff_ktp(type, angle_deg);
    case 'lbo':  return deff_lbo(type, angle_deg);
    case 'kdp':  return deff_kdp(type, angle_deg);
    case 'ppln': return deff_ppln();
    default:     return null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { getDeff, deff_bbo, deff_ktp, deff_lbo, deff_kdp, deff_ppln };
}
