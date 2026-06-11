// Phase 7 — NonlinearSim Solver API
// Clean, callable interface for AI tools and OpticSim integration.
//
// Depends on (loaded in browser via <script> or globally available):
//   01-crystals: bbo.js, ktp.js, lbo.js, kdp.js, ppln.js, index.js
//   02-physics:  sellmeier.js, phase-match.js, opo-tuning.js,
//                ppln-qpm.js, efficiency.js
//
// All wavelengths in [nm], angles in [degrees], lengths in [mm],
// temperatures in [°C], powers in [W], beam radius in [µm].
// ─────────────────────────────────────────────────────────────────────────────

// ── Internal helpers ──────────────────────────────────────────────────────────

const _DEG = Math.PI / 180;

// Phase 14: d_eff is now computed dynamically from d-tensor via deff.js.
// getDeff(crystal_id, type, angle_deg) replaces the old hardcoded _DEFF table.
// Requires deff.js to be loaded before solver.js.

// Retrieve crystal by ID; returns null if unknown
function _crystal(id) {
  try { return getCrystal(id); } catch (_) { return null; }
}

// Attempt SHG PM angle for a crystal; returns null if not phase-matchable
// solveSHG(crystal, lambda_m) → [{type:'Type-I'|'Type-II', theta_deg, ...}]
function _shgAngle(crystal, pump_nm, type) {
  try {
    const results = solveSHG(crystal, pump_nm * 1e-9);
    const match = results.find(r => r.type === `Type-${type}`);
    return match?.theta_deg ?? null;
  } catch (_) { return null; }
}

// ── NL Namespace ─────────────────────────────────────────────────────────────
const NL = {};

// ─────────────────────────────────────────────────────────────────────────────
// NL.getSHGAngle
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Find SHG phase-matching angle for a given crystal and pump wavelength.
 *
 * @param {object} opts
 * @param {string}  opts.crystal    Crystal ID: 'bbo'|'ktp'|'lbo'|'kdp'
 * @param {number}  opts.pump_nm    Pump wavelength [nm]
 * @param {string}  [opts.type]     'I' or 'II' (default tries both)
 * @param {number}  [opts.L_mm]     Crystal length [mm] for bandwidth (default 10)
 * @param {number}  [opts.P_W]      Pump power [W] for efficiency (default 1)
 * @param {number}  [opts.w0_um]    Beam radius [µm] (default 50)
 * @returns {object|null}
 *   { crystal, crystal_label, pump_nm, sh_nm, theta_pm_deg, match_type,
 *     deff_pmV, eta_pct, bw_nm, bw_mrad, walk_off_mrad, n_pump, n_sh }
 */
NL.getSHGAngle = function({ crystal: cid, pump_nm, type, L_mm = 10, P_W = 1, w0_um = 50 }) {
  const crystal = _crystal(cid);
  if (!crystal) return null;

  // ── Biaxial branch (KTP, LBO): use solveSHG_biaxial results directly ────────
  // solveSHG() now dispatches biaxial → solveSHG_biaxial(), returning {type,
  // plane, process, theta_deg=φ, n_pump, n_sh}. Bandwidth/walk-off formulas
  // are uniaxial-specific, so they are omitted (null) for biaxial.
  if (crystal.crystal_type?.startsWith('biaxial')) {
    let pmResults;
    try { pmResults = solveSHG(crystal, pump_nm * 1e-9); }
    catch (_) { pmResults = []; }
    if (type) pmResults = pmResults.filter(r => r.type === `Type-${type}`);
    if (pmResults.length === 0) return null;

    const sh_nm = pump_nm / 2;
    const mapped = pmResults.map(r => {
      const t    = r.type.replace('Type-', '');
      const deff = getDeff(cid, t, r.theta_deg);
      const eta  = deff
        ? shg_efficiency(deff, pump_nm, r.n_pump, r.n_sh, L_mm, P_W, w0_um) * 100
        : null;
      return {
        crystal:       cid,
        crystal_label: crystal.label ?? cid.toUpperCase(),
        process:       'SHG',
        match_type:    r.type,
        pm_process:    r.process,   // 'SF→F', 'SS→F', etc.
        plane:         r.plane,     // 'XY' or 'XZ'
        pump_nm,
        signal_nm:     sh_nm,
        idler_nm:      null,
        theta_pm_deg:  +r.theta_deg.toFixed(3),
        period_um:     null,
        T_C:           25,
        deff_pmV:      deff,
        eta_pct:       eta !== null ? +eta.toFixed(5) : null,
        bw_nm:         null,
        bw_mrad:       null,
        walk_off_mrad: 0,
        n_pump:        +r.n_pump.toFixed(5),
        n_sh:          +r.n_sh.toFixed(5),
      };
    });
    return mapped.length === 1 ? mapped[0] : mapped;
  }

  // ── Uniaxial branch (BBO, KDP) ───────────────────────────────────────────────
  const types = type ? [type] : ['I', 'II'];
  const results = [];

  for (const t of types) {
    let theta_deg = _shgAngle(crystal, pump_nm, t);
    if (theta_deg === null) continue;

    const sh_nm    = pump_nm / 2;
    const np       = crystal.n(pump_nm * 1e-9, 'o');
    const ns       = (t === 'I')
      ? neEff(theta_deg * _DEG, sh_nm * 1e-9, crystal)
      : crystal.n(sh_nm * 1e-9, 'o');  // simplified for type-II SH
    const deff     = getDeff(cid, t, theta_deg);
    const eta_pct  = deff
      ? shg_efficiency(deff, pump_nm, np, ns, L_mm, P_W, w0_um) * 100
      : null;
    const bw_nm    = spectral_bw_shg(theta_deg, pump_nm, crystal, L_mm, t);
    const bw_mrad  = angular_bw_shg(theta_deg, pump_nm, crystal, L_mm, t);
    const walk_off = walkOffAngle(theta_deg * _DEG, sh_nm * 1e-9, crystal) * 1e3;  // mrad

    results.push({
      crystal:       cid,
      crystal_label: crystal.label ?? cid.toUpperCase(),
      process:       'SHG',
      match_type:    `Type-${t}`,
      pump_nm,
      signal_nm:     sh_nm,
      idler_nm:      null,
      theta_pm_deg:  theta_deg,
      period_um:     null,
      T_C:           25,
      deff_pmV:      deff,
      eta_pct:       eta_pct !== null ? +eta_pct.toFixed(5) : null,
      bw_nm:         isFinite(bw_nm)   ? +bw_nm.toFixed(3)   : null,
      bw_mrad:       isFinite(bw_mrad) ? +bw_mrad.toFixed(4) : null,
      walk_off_mrad: isFinite(walk_off)? +walk_off.toFixed(3) : null,
      n_pump:        +np.toFixed(5),
      n_sh:          +ns.toFixed(5),
    });
  }

  return results.length === 1 ? results[0] : results.length === 0 ? null : results;
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.getSHG_PPLN
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get PPLN QPM SHG parameters (temperature-tuned).
 *
 * @param {object} opts
 * @param {number}  opts.pump_nm   Pump wavelength [nm]
 * @param {number}  [opts.T_C]     Temperature [°C] (default 25)
 * @param {number}  [opts.L_mm]    Crystal length [mm] (default 10)
 * @param {number}  [opts.P_W]     Pump power [W] (default 1)
 * @param {number}  [opts.w0_um]   Beam radius [µm] (default 50)
 * @returns {object}
 */
NL.getSHG_PPLN = function({ pump_nm, T_C = 25, L_mm = 10, P_W = 1, w0_um = 50 }) {
  const period_um = ppln_shg_period(pump_nm, T_C);
  const sh_nm     = pump_nm / 2;
  const np        = PPLN.ne(pump_nm * 1e-9, T_C);
  const ns        = PPLN.ne(sh_nm   * 1e-9, T_C);
  const deff      = getDeff('ppln', 'QPM', 0);
  const eta_pct   = shg_efficiency(deff, pump_nm, np, ns, L_mm, P_W, w0_um) * 100;

  return {
    crystal:       'ppln',
    crystal_label: 'MgO:PPLN',
    process:       'SHG',
    match_type:    'QPM',
    pump_nm,
    signal_nm:     sh_nm,
    idler_nm:      null,
    theta_pm_deg:  null,
    period_um:     +period_um.toFixed(3),
    T_C,
    deff_pmV:      deff,
    eta_pct:       +eta_pct.toFixed(5),
    bw_nm:         null,   // QPM bandwidth needs separate computation
    bw_mrad:       null,
    walk_off_mrad: 0,      // QPM: quasi-non-critical, walk-off ≈ 0
    n_pump:        +np.toFixed(5),
    n_sh:          +ns.toFixed(5),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.getTuningCurve
// ─────────────────────────────────────────────────────────────────────────────
/**
 * OPO tuning curve: signal/idler wavelengths vs phase-matching angle.
 *
 * @param {object} opts
 * @param {string}  opts.crystal    Crystal ID
 * @param {string}  opts.type       'I' or 'II'
 * @param {number}  opts.pump_nm    Pump wavelength [nm]
 * @param {number}  [opts.theta_min]  Start angle [deg] (default 10)
 * @param {number}  [opts.theta_max]  End angle [deg] (default 50)
 * @param {number}  [opts.n_pts]    Points (default 100)
 * @returns {Array<{theta_deg, lambda_signal_nm, lambda_idler_nm}>}
 */
NL.getTuningCurve = function({
  crystal: cid, type, pump_nm,
  theta_min = 10, theta_max = 50, n_pts = 100,
}) {
  const crystal = _crystal(cid);
  if (!crystal) return [];
  const opoType = `type${type}`;  // 'I'→'typeI', 'II'→'typeII'
  return opoTuningCurve(pump_nm * 1e-9, crystal, opoType, theta_min, theta_max, n_pts);
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.getAcceptance
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Acceptance bandwidths at a given PM angle.
 *
 * @param {object} opts
 * @param {string}  opts.crystal     Crystal ID
 * @param {number}  opts.theta_deg   PM angle [degrees]
 * @param {number}  opts.pump_nm     Pump wavelength [nm]
 * @param {number}  [opts.L_mm]      Crystal length [mm] (default 10)
 * @param {string}  [opts.type]      'I' or 'II' (default 'I')
 * @returns {{ bw_nm, bw_mrad, walk_off_mrad }}
 */
NL.getAcceptance = function({ crystal: cid, theta_deg, pump_nm, L_mm = 10, type = 'I' }) {
  const crystal = _crystal(cid);
  if (!crystal) return null;
  const bw_nm   = spectral_bw_shg(theta_deg, pump_nm, crystal, L_mm, type);
  const bw_mrad = angular_bw_shg(theta_deg, pump_nm, crystal, L_mm, type);
  const walk    = walkOffAngle(theta_deg * _DEG, (pump_nm / 2) * 1e-9, crystal) * 1e3;
  return {
    bw_nm:         isFinite(bw_nm)   ? +bw_nm.toFixed(3)   : null,
    bw_mrad:       isFinite(bw_mrad) ? +bw_mrad.toFixed(4) : null,
    walk_off_mrad: isFinite(walk)    ? +walk.toFixed(3)     : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.findCombinations
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Search all crystals for ways to reach a target output wavelength.
 * Covers: SHG (birefringent + QPM), OPO signal/idler.
 *
 * @param {object} opts
 * @param {number}  opts.target_nm  Desired output wavelength [nm]
 * @param {number}  opts.pump_nm    Available pump laser wavelength [nm]
 * @param {number}  [opts.tol_nm]   Match tolerance [nm] (default 5)
 * @param {number}  [opts.L_mm]     Crystal length [mm] (default 10)
 * @param {number}  [opts.P_W]      Pump power [W] (default 1)
 * @param {number}  [opts.w0_um]    Beam radius [µm] (default 50)
 * @returns {{ query, combinations: Array<ResultObject> }}
 *   ResultObject fields: crystal, crystal_label, process, match_type,
 *     pump_nm, signal_nm, idler_nm, theta_pm_deg, period_um, T_C,
 *     deff_pmV, eta_pct, bw_nm, bw_mrad, walk_off_mrad, n_pump, n_sh
 */
NL.findCombinations = function({
  target_nm, pump_nm, tol_nm = 5,
  L_mm = 10, P_W = 1, w0_um = 50,
}) {
  const combos = [];
  const crystalIds = ['bbo', 'ktp', 'lbo', 'kdp'];

  // ── SHG: target = pump/2 ─────────────────────────────────────────────────
  if (Math.abs(target_nm - pump_nm / 2) <= tol_nm) {
    for (const cid of crystalIds) {
      for (const type of ['I', 'II']) {
        const r = NL.getSHGAngle({ crystal: cid, pump_nm, type, L_mm, P_W, w0_um });
        if (!r || Array.isArray(r)) {
          if (Array.isArray(r)) r.forEach(x => combos.push(x));
        } else {
          combos.push(r);
        }
      }
    }
    // PPLN QPM SHG
    combos.push(NL.getSHG_PPLN({ pump_nm, T_C: 25, L_mm, P_W, w0_um }));
  }

  // ── OPO: target is signal or idler ───────────────────────────────────────
  // For birefringent OPO, scan theta and find the angle where signal/idler ≈ target
  const isOPOTarget = target_nm > pump_nm;  // signal or idler > pump
  if (isOPOTarget) {
    for (const cid of crystalIds) {
      const crystal = _crystal(cid);
      if (!crystal) continue;

      for (const type of ['I', 'II']) {
        let curve;
        try { curve = opoTuningCurve(pump_nm * 1e-9, crystal, `type${type}`, 10, 55, 200); }
        catch (_) { continue; }
        if (!curve || curve.length === 0) continue;

        // Find closest point on tuning curve to target_nm
        let best = null, bestDist = Infinity;
        for (const pt of curve) {
          const ds = Math.abs(pt.lambda_s_nm - target_nm);
          const di = Math.abs(pt.lambda_i_nm - target_nm);
          const d  = Math.min(ds, di);
          if (d < bestDist) { bestDist = d; best = pt; }
        }
        if (!best || bestDist > tol_nm) continue;

        // Build result
        const theta_deg = best.theta_deg;
        const np  = neEff(theta_deg * _DEG, pump_nm * 1e-9, crystal);
        const ns  = crystal.n(best.lambda_s_nm * 1e-9, 'o');
        const ni  = crystal.n(best.lambda_i_nm * 1e-9, 'o');
        const deff = _getDeff(cid, type);

        combos.push({
          crystal:       cid,
          crystal_label: crystal.label ?? cid.toUpperCase(),
          process:       'OPO',
          match_type:    `Type-${type}`,
          pump_nm,
          signal_nm:     +best.lambda_s_nm.toFixed(1),
          idler_nm:      +best.lambda_i_nm.toFixed(1),
          theta_pm_deg:  +theta_deg.toFixed(2),
          period_um:     null,
          T_C:           25,
          deff_pmV:      deff,
          eta_pct:       null,  // OPO efficiency needs separate threshold calculation
          bw_nm:         null,
          bw_mrad:       null,
          walk_off_mrad: +( walkOffAngle(theta_deg * _DEG, pump_nm * 1e-9, crystal) * 1e3 ).toFixed(3),
          n_pump:        +np.toFixed(5),
          n_sh:          +ns.toFixed(5),
        });
      }
    }
  }

  // Sort by eta_pct (desc), putting nulls last
  combos.sort((a, b) => {
    if (a.eta_pct === null && b.eta_pct === null) return 0;
    if (a.eta_pct === null) return 1;
    if (b.eta_pct === null) return -1;
    return b.eta_pct - a.eta_pct;
  });

  return { query: { target_nm, pump_nm, tol_nm }, combinations: combos };
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.toOpticSimWavelengths
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Convert a solver result to OpticSim wavelength entries.
 * Designed for OpticSim's beamCfg.wavelengths = [{lambda}, ...].
 *
 * Returns up to 3 wavelengths: pump, signal (or SH), idler.
 * Each entry includes {lambda_m, lambda_nm, role} for use in OpticSim.
 *
 * @param {object} result  A single combination result from findCombinations
 *                         or getSHGAngle
 * @returns {Array<{lambda_m, lambda_nm, role}>}
 *   role: 'pump' | 'sh' | 'signal' | 'idler'
 */
NL.toOpticSimWavelengths = function(result) {
  if (!result) return [];
  const waves = [];

  waves.push({ lambda_m: result.pump_nm * 1e-9, lambda_nm: result.pump_nm, role: 'pump' });

  if (result.process === 'SHG') {
    waves.push({ lambda_m: result.signal_nm * 1e-9, lambda_nm: result.signal_nm, role: 'sh' });
  } else if (result.process === 'OPO') {
    waves.push({ lambda_m: result.signal_nm * 1e-9, lambda_nm: result.signal_nm, role: 'signal' });
    if (result.idler_nm) {
      waves.push({ lambda_m: result.idler_nm * 1e-9, lambda_nm: result.idler_nm, role: 'idler' });
    }
  }

  return waves;
};

// ─────────────────────────────────────────────────────────────────────────────
// NL.toOpticSimElement
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Convert a solver result to an OpticSim element spec for the nonlinear crystal.
 * The crystal is modeled as a thick flat slab (type 'thickLens' with infinite radii).
 * This accounts for focusing effects inside the crystal but NOT the wavelength conversion
 * (OpticSim handles multi-wavelength propagation separately via toOpticSimWavelengths).
 *
 * @param {object} result    Single combination result
 * @param {number} L_mm      Crystal length [mm]
 * @returns {object} OpticSim element spec
 *   { type: 'thickLens', R1: Infinity, R2: Infinity, d: L_m, n: n_pump, material: 'custom',
 *     _nlmeta: { crystal, process, match_type, pump_nm, signal_nm, ... } }
 */
NL.toOpticSimElement = function(result, L_mm = 10) {
  if (!result) return null;
  return {
    type:     'crystal',
    t:        L_mm * 1e-3,
    n:        result.n_pump ?? 1.5,
    material: result.crystal || 'custom',
    _nlmeta:  {                   // metadata for NonlinearSim context
      crystal:       result.crystal,
      crystal_label: result.crystal_label,
      process:       result.process,
      match_type:    result.match_type,
      pump_nm:       result.pump_nm,
      signal_nm:     result.signal_nm,
      idler_nm:      result.idler_nm,
      theta_pm_deg:  result.theta_pm_deg,
      period_um:     result.period_um,
      T_C:           result.T_C,
      deff_pmV:      result.deff_pmV,
      eta_pct:       result.eta_pct,
    },
  };
};

// ── OPO threshold API (requires opo-threshold.js + bk-focus.js loaded first) ──
// These are thin aliases — the computation lives in 02-physics/opo-threshold.js.
// HTML pages must include bk-focus.js and opo-threshold.js before solver.js.
if (typeof opo_threshold === 'function') {
  /**
   * CW OPO threshold pump power from beam waist.
   * @see opo_threshold in 02-physics/opo-threshold.js
   */
  NL.getOPOThreshold = opo_threshold;

  /**
   * CW OPO threshold from CavitySim Rayleigh range (free-space zR).
   * zR_m comes directly from CAVITY.solve().eigenmode.zR.
   * @see opo_threshold_from_zR
   */
  NL.getOPOThreshold_zR = opo_threshold_from_zR;

  /** Scan P_th vs crystal length L (fixed w₀). */
  NL.getOPOScanL = opo_scanL;

  /** Scan P_th vs beam waist w₀ (fixed L). */
  NL.getOPOScanW0 = opo_scanW0;

  /** Find optimal w₀ (minimum P_th) for given L and losses. */
  NL.getOPOOptimalW0 = opo_optimalW0;
}

// ── Module exports (Node.js / browser universal) ──────────────────────────────
if (typeof module !== 'undefined') module.exports = { NL };
