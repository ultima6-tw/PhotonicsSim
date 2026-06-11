// MgO:PPLN (5% MgO-doped periodically-poled LiNbO₃)
// Sellmeier: Gayer et al. 2008, Appl. Phys. B 91, 343
// Temperature-dependent, valid 0.4–5.0 µm, 20–200°C
// Common use: QPM SHG, OPO with temperature or period tuning

// f(T) = (T - 24.5)(T + 570.82),  T in °C
// n²(λ,T) = (a1 + b1·f) + (a2 + b2·f)/(λ²-(a3+b3·f)²) + (a4+b4·f)/(λ²-a5²) - a6·λ²

const _PPLN_COEFF = {
  // ordinary polarization (Gayer 2008 Table 1)
  o: {
    a: [5.756,   0.0983,  0.2020, 189.32, 12.52, 1.32e-2],
    b: [2.860e-6, 4.700e-8, 6.113e-8, 1.516e-4],
  },
  // extraordinary polarization (Gayer 2008 Table 1)
  e: {
    a: [5.7789,  0.1022,  0.2029, 189.32, 12.52, 1.327e-2],
    b: [2.160e-6, 5.765e-8, 6.593e-8, 1.516e-4],
  },
};

const PPLN = {
  id: 'ppln',
  label: 'MgO:PPLN (LiNbO₃)',
  crystal_type: 'uniaxial_negative_qpm',
  axes: ['o', 'e'],
  transparency_um: [0.40, 5.0],
  sellmeier_ref: 'Gayer et al. 2008, Appl. Phys. B 91, 343',

  // lambda_m: wavelength in metres
  // axis: 'o' (ordinary) or 'e' (extraordinary)
  // T_C: temperature in °C (default 25)
  n(lambda_m, axis, T_C = 25) {
    const c = _PPLN_COEFF[axis];
    if (!c) throw new Error(`PPLN: unknown axis '${axis}' — use 'o' or 'e'`);
    const [a1, a2, a3, a4, a5, a6] = c.a;
    const [b1, b2, b3, b4]         = c.b;
    const lum  = lambda_m * 1e6;   // µm
    const lum2 = lum * lum;
    const F    = (T_C - 24.5) * (T_C + 570.82);

    const n2 =
      (a1 + b1 * F)
      + (a2 + b2 * F) / (lum2 - (a3 + b3 * F) ** 2)
      + (a4 + b4 * F) / (lum2 - a5 * a5)
      - a6 * lum2;

    return Math.sqrt(Math.max(n2, 0));
  },

  // Convenience wrappers
  no(lambda_m, T_C = 25) { return this.n(lambda_m, 'o', T_C); },
  ne(lambda_m, T_C = 25) { return this.n(lambda_m, 'e', T_C); },

  // QPM poling period needed for a given process at temperature T_C
  // process: 'SHG' → pump λ_p generates 2ω; 'OPO' → use phase-match solver
  // Returns Λ in metres (NaN if outside transparency range)
  qpmPeriod(lambda_pump_m, T_C = 25, axis = 'e') {
    const np  = this.n(lambda_pump_m,     axis, T_C);
    const n2p = this.n(lambda_pump_m / 2, axis, T_C);
    const kp  = np  / lambda_pump_m;
    const k2p = n2p / (lambda_pump_m / 2);
    const dk  = k2p - 2 * kp;                   // Δk without QPM
    // k = n/λ (not 2πn/λ), so QPM = 1/|dk| not 2π/|dk|
    return Math.abs(dk) > 1e-10 ? 1.0 / Math.abs(dk) : Infinity;
  },
};

if (typeof module !== 'undefined') module.exports = { PPLN };
