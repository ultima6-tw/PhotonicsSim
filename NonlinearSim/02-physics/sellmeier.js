// Phase 2 — Angle-dependent refractive index
// Uniaxial crystals: ne(θ,λ) using the index ellipsoid formula
// Biaxial crystals (XZ plane): effective extraordinary in XZ propagation plane

// ── Uniaxial ne(θ,λ) ───────────────────────────────────────────────────────
// 1/ne²(θ) = cos²θ/no² + sin²θ/ne_principal²
// → ne(θ) = no·ne_p / sqrt(ne_p²·cos²θ + no²·sin²θ)
// θ: angle between propagation direction and optical axis (rad)
// At θ=0: ne(0)=no (ordinary), At θ=π/2: ne(π/2)=ne_p (principal extraordinary)
function neEff(theta_rad, lambda_m, crystal) {
  const no  = crystal.n(lambda_m, 'o');
  const ne_p = crystal.n(lambda_m, 'e');
  const c2  = Math.cos(theta_rad) ** 2;
  const s2  = Math.sin(theta_rad) ** 2;
  return (no * ne_p) / Math.sqrt(ne_p * ne_p * c2 + no * no * s2);
}

// ── Biaxial: XZ-plane propagation ──────────────────────────────────────────
// For biaxial crystal propagating in XZ plane (nz > ny > nx):
//   Slow ray (extraordinary-like): ne_xz(θ) = nx·nz/sqrt(nz²cos²θ + nx²sin²θ)
//   Fast ray (ordinary-like):      ny  (constant)
// θ: angle from Z axis (optical axis Z) toward X
// For KTP: common SHG uses θ=90°,φ=23.5° → close to XZ plane with neff between nx,nz
function neEff_biaxial_xz(theta_rad, lambda_m, crystal) {
  const nx = crystal.n(lambda_m, 'x');
  const nz = crystal.n(lambda_m, 'z');
  const c2 = Math.cos(theta_rad) ** 2;
  const s2 = Math.sin(theta_rad) ** 2;
  return (nx * nz) / Math.sqrt(nz * nz * c2 + nx * nx * s2);
}

// Convenience: ordinary-like ray for biaxial XZ plane = ny
function noEff_biaxial_xz(lambda_m, crystal) {
  return crystal.n(lambda_m, 'y');
}

// ── Biaxial: XY-plane propagation ──────────────────────────────────────────
// For biaxial crystal propagating in XY plane (θ=90°, φ = angle from x in XY):
//   k̂ = (cosφ, sinφ, 0)
//   Fast ray (in-plane polarization ê=(-sinφ,cosφ,0)):
//     1/n² = sin²φ/nx² + cos²φ/ny²
//   Slow ray (z-polarized): nz (constant, independent of φ)
// φ: angle from x-axis in XY plane (rad)
// Used for KTP Type-II (φ≈23.5°) and LBO Type-I (φ≈11.3°)
function neEff_biaxial_xy(phi_rad, lambda_m, crystal) {
  const nx = crystal.n(lambda_m, 'x');
  const ny = crystal.n(lambda_m, 'y');
  const s2 = Math.sin(phi_rad) ** 2;
  const c2 = Math.cos(phi_rad) ** 2;
  return 1.0 / Math.sqrt(s2 / (nx * nx) + c2 / (ny * ny));
}

// Slow (z-polarized) ray for XY-plane propagation = nz
function noEff_biaxial_xy(lambda_m, crystal) {
  return crystal.n(lambda_m, 'z');
}

if (typeof module !== 'undefined') module.exports = {
  neEff, neEff_biaxial_xz, noEff_biaxial_xz, neEff_biaxial_xy, noEff_biaxial_xy,
};
