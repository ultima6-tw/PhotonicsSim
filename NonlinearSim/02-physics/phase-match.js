// Phase 2 — Phase mismatch Δk calculation
// All k-vectors use the physical definition: k = 2πn/λ (SI units: rad/m)
// Δk > 0: phase mismatch, Δk = 0: perfect phase matching

// ── SHG Type-I: o(ω) + o(ω) → e(2ω) ──────────────────────────────────────
// Δk = k_e(2ω) - 2·k_o(ω)
//    = 2π·ne_eff(θ, λ/2)/（λ/2） - 2·2π·no(λ)/λ
//    = (4π/λ) · [ne_eff(θ, λ/2) - no(λ)]
function deltaK_typeI(theta_rad, lambda_pump_m, crystal) {
  const lambda_sh = lambda_pump_m / 2;
  const no_pump = crystal.n(lambda_pump_m, 'o');
  const ne_sh   = neEff(theta_rad, lambda_sh, crystal);
  return (4 * Math.PI / lambda_pump_m) * (ne_sh - no_pump);
}

// ── SHG Type-II: o(ω) + e(ω) → e(2ω) ─────────────────────────────────────
// Δk = k_e(2ω) - k_o(ω) - k_e(ω)
//    = 2π·ne_eff(θ,λ/2)/(λ/2) - 2π·no(λ)/λ - 2π·ne_eff(θ,λ)/λ
//    = (2π/λ) · [2·ne_eff(θ,λ/2) - no(λ) - ne_eff(θ,λ)]
function deltaK_typeII(theta_rad, lambda_pump_m, crystal) {
  const lambda_sh = lambda_pump_m / 2;
  const no_pump  = crystal.n(lambda_pump_m, 'o');
  const ne_pump  = neEff(theta_rad, lambda_pump_m, crystal);
  const ne_sh    = neEff(theta_rad, lambda_sh, crystal);
  return (2 * Math.PI / lambda_pump_m) * (2 * ne_sh - no_pump - ne_pump);
}

// ── Biaxial Type-I (XZ plane): ny(ω)+ny(ω) → ne_xz(2ω) ───────────────────
function deltaK_biaxial_typeI_xz(theta_rad, lambda_pump_m, crystal) {
  const lambda_sh = lambda_pump_m / 2;
  const no_pump  = noEff_biaxial_xz(lambda_pump_m, crystal);
  const ne_sh    = neEff_biaxial_xz(theta_rad, lambda_sh, crystal);
  return (4 * Math.PI / lambda_pump_m) * (ne_sh - no_pump);
}

// ── Biaxial: XY-plane propagation (φ = angle from x-axis in XY plane) ──────
// In XY plane: fast ray polarized in-plane (n_fast), slow ray = nz
//
// Type-I SS→F: nz(ω)+nz(ω) → n_fast(2ω,φ)   [LBO-like]
// Δk = (4π/λ) · (n_fast(2ω,φ) - nz(ω))
function deltaK_biaxial_typeI_xy_ssf(phi_rad, lambda_pump_m, crystal) {
  const lsh = lambda_pump_m / 2;
  return (4 * Math.PI / lambda_pump_m) * (
    neEff_biaxial_xy(phi_rad, lsh, crystal) - noEff_biaxial_xy(lambda_pump_m, crystal)
  );
}

// Type-I FF→S: n_fast(ω,φ)+n_fast(ω,φ) → nz(2ω)
// Δk = (4π/λ) · (nz(2ω) - n_fast(ω,φ))
function deltaK_biaxial_typeI_xy_ffs(phi_rad, lambda_pump_m, crystal) {
  const lsh = lambda_pump_m / 2;
  return (4 * Math.PI / lambda_pump_m) * (
    noEff_biaxial_xy(lsh, crystal) - neEff_biaxial_xy(phi_rad, lambda_pump_m, crystal)
  );
}

// Type-II SF→F: nz(ω) + n_fast(ω,φ) → n_fast(2ω,φ)   [KTP-like]
// Δk = (2π/λ) · (2·n_fast(2ω,φ) - nz(ω) - n_fast(ω,φ))
function deltaK_biaxial_typeII_xy_f(phi_rad, lambda_pump_m, crystal) {
  const lsh = lambda_pump_m / 2;
  const ns  = noEff_biaxial_xy(lambda_pump_m, crystal);
  const nf  = neEff_biaxial_xy(phi_rad, lambda_pump_m, crystal);
  const nf2 = neEff_biaxial_xy(phi_rad, lsh, crystal);
  return (2 * Math.PI / lambda_pump_m) * (2 * nf2 - ns - nf);
}

// Type-II SF→S: nz(ω) + n_fast(ω,φ) → nz(2ω)
// Δk = (2π/λ) · (2·nz(2ω) - nz(ω) - n_fast(ω,φ))
function deltaK_biaxial_typeII_xy_s(phi_rad, lambda_pump_m, crystal) {
  const lsh = lambda_pump_m / 2;
  const ns  = noEff_biaxial_xy(lambda_pump_m, crystal);
  const nf  = neEff_biaxial_xy(phi_rad, lambda_pump_m, crystal);
  const ns2 = noEff_biaxial_xy(lsh, crystal);
  return (2 * Math.PI / lambda_pump_m) * (2 * ns2 - ns - nf);
}

// ── Biaxial SHG solver: tries XY (4 sub-types) + XZ (Type-I) ───────────────
// Returns same structure as solveSHG, with extra field plane ('XY'|'XZ')
// theta_deg = PM angle: φ (degrees) for XY plane, θ for XZ plane
function solveSHG_biaxial(crystal, lambda_pump_m) {
  const results = [];
  const lsh = lambda_pump_m / 2;
  const R2D = 180 / Math.PI;

  const tryAngle = (fn, type, process, plane) => {
    const angle = findPMAngle(a => fn(a, lambda_pump_m, crystal), 0, Math.PI / 2);
    if (angle === null) return;
    const nf = neEff_biaxial_xy(angle, lambda_pump_m, crystal);
    const nf2 = neEff_biaxial_xy(angle, lsh, crystal);
    const ns  = noEff_biaxial_xy(lambda_pump_m, crystal);
    const ns2 = noEff_biaxial_xy(lsh, crystal);
    const n_pump = process.startsWith('SS') ? ns : (process.startsWith('FF') ? nf : (ns + nf) / 2);
    const n_sh   = process.endsWith('F')    ? nf2 : ns2;
    results.push({ type, process, plane, theta_deg: angle * R2D, rho_deg: 0, n_pump, n_sh });
  };

  // XY plane
  tryAngle(deltaK_biaxial_typeI_xy_ssf,  'Type-I',  'SS→F', 'XY');
  tryAngle(deltaK_biaxial_typeI_xy_ffs,  'Type-I',  'FF→S', 'XY');
  tryAngle(deltaK_biaxial_typeII_xy_f,   'Type-II', 'SF→F', 'XY');
  tryAngle(deltaK_biaxial_typeII_xy_s,   'Type-II', 'SF→S', 'XY');

  // XZ plane Type-I
  const theta_xz = findPMAngle(a => deltaK_biaxial_typeI_xz(a, lambda_pump_m, crystal), 0, Math.PI / 2);
  if (theta_xz !== null) {
    const ns_pump = noEff_biaxial_xz(lambda_pump_m, crystal);
    const ne_sh   = neEff_biaxial_xz(theta_xz, lsh, crystal);
    results.push({ type: 'Type-I', process: 'FF→S(xz)', plane: 'XZ', theta_deg: theta_xz * R2D, rho_deg: 0, n_pump: ns_pump, n_sh: ne_sh });
  }

  return results;
}

// ── Find phase-matching angle via bisection ─────────────────────────────────
// Returns θ_pm in radians, or null if no crossing in [θ_min, θ_max]
// deltaKfn: function(theta_rad) → Δk
function findPMAngle(deltaKfn, theta_min_rad = 0, theta_max_rad = Math.PI / 2, tol = 1e-8) {
  const fa = deltaKfn(theta_min_rad);
  const fb = deltaKfn(theta_max_rad);
  if (fa * fb > 0) return null;  // no sign change, no crossing

  let lo = theta_min_rad, hi = theta_max_rad;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if ((hi - lo) < tol) return mid;
    if (deltaKfn(lo) * deltaKfn(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ── Convenience: find Type-I SHG angle ─────────────────────────────────────
function SHG_typeI_angle(lambda_pump_m, crystal) {
  return findPMAngle(θ => deltaK_typeI(θ, lambda_pump_m, crystal));
}

function SHG_typeII_angle(lambda_pump_m, crystal) {
  return findPMAngle(θ => deltaK_typeII(θ, lambda_pump_m, crystal));
}

// ── Walk-off angle ρ (uniaxial, for the extraordinary ray at angle θ) ─────
// tan(ρ) = [(no² - ne_p²) sinθ cosθ] / [no²sin²θ + ne_p²cos²θ]
// ρ > 0 for negative uniaxial (ne < no); returns radians
function walkOffAngle(theta_rad, lambda_m, crystal) {
  const no   = crystal.n(lambda_m, 'o');
  const ne_p = crystal.n(lambda_m, 'e');
  const no2  = no * no, ne2 = ne_p * ne_p;
  const s = Math.sin(theta_rad), c = Math.cos(theta_rad);
  return Math.atan2((no2 - ne2) * s * c, no2 * s * s + ne2 * c * c);
}

// ── Unified SHG solver ──────────────────────────────────────────────────────
// Returns array of PM configurations. For biaxial crystals, delegates to
// solveSHG_biaxial. For uniaxial, returns { type, process, theta_deg, rho_deg,
// ne_sh, no_fund, plane:'uniaxial' }.
function solveSHG(crystal, lambda_pump_m) {
  if (crystal.crystal_type.startsWith('biaxial')) return solveSHG_biaxial(crystal, lambda_pump_m);
  if (!['uniaxial_negative', 'uniaxial_positive'].includes(crystal.crystal_type)) return [];

  const results = [];
  const lambda_sh = lambda_pump_m / 2;

  const theta_I = SHG_typeI_angle(lambda_pump_m, crystal);
  if (theta_I !== null) {
    results.push({
      type:      'Type-I',
      process:   'o+o→e',
      theta_deg: theta_I / (Math.PI / 180),
      rho_deg:   walkOffAngle(theta_I, lambda_sh, crystal) / (Math.PI / 180),
      ne_sh:     neEff(theta_I, lambda_sh, crystal),
      no_fund:   crystal.n(lambda_pump_m, 'o'),
    });
  }

  const theta_II = SHG_typeII_angle(lambda_pump_m, crystal);
  if (theta_II !== null) {
    results.push({
      type:      'Type-II',
      process:   'o+e→e',
      theta_deg: theta_II / (Math.PI / 180),
      rho_deg:   walkOffAngle(theta_II, lambda_sh, crystal) / (Math.PI / 180),
      ne_sh:     neEff(theta_II, lambda_sh, crystal),
      no_fund:   crystal.n(lambda_pump_m, 'o'),
      ne_fund:   neEff(theta_II, lambda_pump_m, crystal),
    });
  }

  return results;
}

if (typeof module !== 'undefined') {
  module.exports = {
    deltaK_typeI, deltaK_typeII, deltaK_biaxial_typeI_xz,
    deltaK_biaxial_typeI_xy_ssf, deltaK_biaxial_typeI_xy_ffs,
    deltaK_biaxial_typeII_xy_f, deltaK_biaxial_typeII_xy_s,
    findPMAngle, SHG_typeI_angle, SHG_typeII_angle,
    walkOffAngle, solveSHG, solveSHG_biaxial,
  };
}
