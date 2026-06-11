// BBO (β-BaB₂O₄) — uniaxial negative crystal (no > ne)
// Sellmeier: Kato 1986, Appl. Opt. 25, 2450
// Valid range: 0.19–2.6 µm
// Common use: OPO (355/532nm pump), UV SHG, broadband tuning

const BBO = {
  id: 'bbo',
  label: 'BBO (β-BaB₂O₄)',
  crystal_type: 'uniaxial_negative',  // no > ne
  axes: ['o', 'e'],
  transparency_um: [0.19, 2.6],
  sellmeier_ref: 'Kato 1986, Appl. Opt. 25, 2450',

  no(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(2.7405 + 0.0184 / (l2 - 0.0179) - 0.0155 * l2);
  },

  ne(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(2.3730 + 0.0128 / (l2 - 0.0156) - 0.0044 * l2);
  },

  // Generic interface: axis = 'o' | 'e'
  n(lambda_m, axis) {
    if (axis === 'o') return this.no(lambda_m);
    if (axis === 'e') return this.ne(lambda_m);
    throw new Error(`BBO: unknown axis '${axis}' — use 'o' or 'e'`);
  },
};

if (typeof module !== 'undefined') module.exports = { BBO };
