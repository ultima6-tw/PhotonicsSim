// LBO (LiB₃O₅) — biaxial negative crystal (nz > ny > nx)
// Crystal class: mm2, biaxial negative: nz > ny > nx
// Sellmeier: Kato 1994, IEEE J. Quantum Electron. 30, 881
// Valid range: 0.16–2.6 µm
// Common use: high-power SHG 1064→532nm (non-critical phase matching at ~149°C),
//             type-I SHG 1064nm at θ=90°, φ=11.4°

const LBO = {
  id: 'lbo',
  label: 'LBO (LiB₃O₅)',
  crystal_type: 'biaxial_negative',   // nz > ny > nx
  axes: ['x', 'y', 'z'],
  transparency_um: [0.16, 2.6],
  sellmeier_ref: 'Kato & Takaoka 2002, Appl. Opt. 41, 5040',

  nx(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(2.4542 + 0.01125 / (l2 - 0.01135) - 0.01388 * l2);
  },

  ny(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(2.5390 + 0.01277 / (l2 - 0.01189) - 0.01848 * l2);
  },

  nz(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(2.5865 + 0.01310 / (l2 - 0.01223) - 0.01861 * l2);
  },

  // Generic interface: axis = 'x' | 'y' | 'z'
  n(lambda_m, axis) {
    if (axis === 'x') return this.nx(lambda_m);
    if (axis === 'y') return this.ny(lambda_m);
    if (axis === 'z') return this.nz(lambda_m);
    throw new Error(`LBO: unknown axis '${axis}' — use 'x', 'y', or 'z'`);
  },
};

if (typeof module !== 'undefined') module.exports = { LBO };
