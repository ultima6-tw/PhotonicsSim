// KTP (KTiOPO₄) — biaxial positive crystal (nx < ny < nz)
// Sellmeier: Kato 1994, IEEE J. Quantum Electron. 30, 2950
// Valid range: 0.35–4.5 µm
// Common use: Type-II SHG 1064→532nm (θ=90°, φ=23.5°)

const KTP = {
  id: 'ktp',
  label: 'KTP (KTiOPO₄)',
  crystal_type: 'biaxial_positive',   // nx < ny < nz
  axes: ['x', 'y', 'z'],
  transparency_um: [0.35, 4.5],
  sellmeier_ref: 'Kato 1994, IEEE J. QE 30, 2950',

  nx(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(3.0065 + 0.03901 / (l2 - 0.04251) - 0.01327 * l2);
  },

  ny(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(3.0333 + 0.04154 / (l2 - 0.04547) - 0.01408 * l2);
  },

  nz(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(3.3134 + 0.05694 / (l2 - 0.05658) - 0.01682 * l2);
  },

  // Generic interface: axis = 'x' | 'y' | 'z'
  n(lambda_m, axis) {
    if (axis === 'x') return this.nx(lambda_m);
    if (axis === 'y') return this.ny(lambda_m);
    if (axis === 'z') return this.nz(lambda_m);
    throw new Error(`KTP: unknown axis '${axis}' — use 'x', 'y', or 'z'`);
  },
};

if (typeof module !== 'undefined') module.exports = { KTP };
