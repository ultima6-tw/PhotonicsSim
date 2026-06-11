// KDP (KH₂PO₄) — uniaxial negative crystal (no > ne)
// Sellmeier: Nikogosyan 2005 (3-term, valid UV to NIR)
// Valid range: 0.18–1.55 µm
// Common use: high-power pulsed SHG/THG (Nd:YAG), historical standard

const KDP = {
  id: 'kdp',
  label: 'KDP (KH₂PO₄)',
  crystal_type: 'uniaxial_negative',
  axes: ['o', 'e'],
  transparency_um: [0.18, 1.55],
  sellmeier_ref: 'Nikogosyan 2005, Nonlinear Optical Crystals',

  no(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    // 3-term: last term ~constant for NIR (400 >> l2)
    return Math.sqrt(
      2.259276
      + 0.01008956 / (l2 - 0.012942625)
      + 13.00522   / (l2 - 400)
    );
  },

  ne(lambda_m) {
    const l2 = (lambda_m * 1e6) ** 2;
    return Math.sqrt(
      2.132668
      + 0.008637494 / (l2 - 0.012281043)
      + 3.2279924   / (l2 - 400)
    );
  },

  n(lambda_m, axis) {
    if (axis === 'o') return this.no(lambda_m);
    if (axis === 'e') return this.ne(lambda_m);
    throw new Error(`KDP: unknown axis '${axis}' — use 'o' or 'e'`);
  },
};

if (typeof module !== 'undefined') module.exports = { KDP };
