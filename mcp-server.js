#!/usr/bin/env node
// PhotonicsSim MCP Server — JSON-RPC 2.0 over stdio, zero npm dependencies
//
// Claude Code config (add to ~/.claude/settings.json → mcpServers):
//   "photonics": {
//     "command": "node",
//     "args": ["/path/to/PhotonicsSim/mcp-server.js"]
//   }

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const BASE = __dirname;

// ── Physics loading (shared scope via new Function) ───────────────────────────

// efficiency.js and eigenmode.js both declare `const _C` with different values,
// so NonlinearSim and CavitySim are loaded in separate new Function() scopes.

const NL_FILES = [
  'NonlinearSim/01-crystals/bbo.js',
  'NonlinearSim/01-crystals/ktp.js',
  'NonlinearSim/01-crystals/lbo.js',
  'NonlinearSim/01-crystals/kdp.js',
  'NonlinearSim/01-crystals/ppln.js',
  'NonlinearSim/01-crystals/index.js',
  'NonlinearSim/02-physics/sellmeier.js',
  'NonlinearSim/02-physics/phase-match.js',
  'NonlinearSim/02-physics/ppln-qpm.js',
  'NonlinearSim/02-physics/efficiency.js',
  'NonlinearSim/02-physics/deff.js',
  'NonlinearSim/02-physics/gvd.js',
  'NonlinearSim/02-physics/thermal.js',
  'NonlinearSim/02-physics/bk-focus.js',
  'NonlinearSim/02-physics/opo-tuning.js',
  'NonlinearSim/02-physics/opo-threshold.js',
  'NonlinearSim/03-solver/solver.js',
];

const CAV_FILES = [
  'CavitySim/01-elements/elements.js',
  'CavitySim/02-physics/roundtrip.js',
  'CavitySim/02-physics/eigenmode.js',
  'CavitySim/02-physics/stability.js',
  'CavitySim/03-solver/cavity-solver.js',
];

function loadFiles(list) {
  return list.map(f => fs.readFileSync(path.join(BASE, f), 'utf8')).join('\n');
}

let PH;
try {
  const NL  = new Function(loadFiles(NL_FILES)  + '\nreturn{NL,getCrystal,CRYSTAL_DB,bk_h,bk_xi,bk_optimal_w0,opo_threshold,opo_threshold_from_zR,opo_scanL,opo_scanW0,opo_optimalW0};')();
  const CAV = new Function(loadFiles(CAV_FILES) + '\nreturn{CAVITY,makeElement};')();
  PH = Object.assign({}, NL, CAV);
} catch (e) {
  process.stderr.write('Physics load error: ' + e.message + '\n');
  process.exit(1);
}

// ── Element builder ───────────────────────────────────────────────────────────

function buildEl(spec) {
  const p = {};
  if (spec.R_mm !== undefined) p.R_m = spec.R_mm === null ? Infinity : spec.R_mm * 1e-3;
  if (spec.L_mm !== undefined) p.L_m = spec.L_mm * 1e-3;
  if (spec.f_mm !== undefined) p.f_m = spec.f_mm * 1e-3;
  if (spec.t_mm !== undefined) p.t_m = spec.t_mm * 1e-3;
  if (spec.n    !== undefined) p.n   = spec.n;
  return PH.makeElement(spec.type, p);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'nl_shg_angle',
    description:
      'Find SHG phase-matching angle and conversion efficiency for a bulk nonlinear crystal. ' +
      'Returns PM angle (θ for uniaxial, φ for KTP/LBO), d_eff, walk-off, acceptance bandwidth, ' +
      'and estimated output power. Crystal IDs: bbo, ktp, lbo, kdp.',
    inputSchema: {
      type: 'object',
      properties: {
        crystal:  { type: 'string', description: 'Crystal ID: bbo | ktp | lbo | kdp' },
        pump_nm:  { type: 'number', description: 'Pump wavelength [nm], e.g. 1064 for Nd:YAG' },
        type:     { type: 'string', description: 'Phase-matching type: I or II' },
        L_mm:     { type: 'number', description: 'Crystal length [mm] (default 10)' },
        P_W:      { type: 'number', description: 'Pump power [W] (default 1)' },
        w0_um:    { type: 'number', description: 'Pump beam waist at crystal [µm] (default 50)' },
      },
      required: ['crystal', 'pump_nm', 'type'],
    },
  },
  {
    name: 'nl_shg_ppln',
    description:
      'SHG in periodically-poled lithium niobate (PPLN) via quasi-phase matching. ' +
      'Returns poling period Λ, d_eff, normalized efficiency Γ, and output power.',
    inputSchema: {
      type: 'object',
      properties: {
        pump_nm: { type: 'number', description: 'Pump wavelength [nm]' },
        T_C:     { type: 'number', description: 'Crystal temperature [°C] (default 25)' },
        L_mm:    { type: 'number', description: 'Crystal length [mm] (default 10)' },
        P_W:     { type: 'number', description: 'Pump power [W] (default 1)' },
        w0_um:   { type: 'number', description: 'Pump beam waist [µm] (default 50)' },
      },
      required: ['pump_nm'],
    },
  },
  {
    name: 'nl_find_combinations',
    description:
      'Search all available crystals and phase-matching types for a target SHG/OPO process. ' +
      'Returns a ranked list of all phase-matchable combinations with efficiencies. ' +
      'Useful for material selection when designing a new nonlinear system.',
    inputSchema: {
      type: 'object',
      properties: {
        pump_nm:    { type: 'number', description: 'Pump wavelength [nm]' },
        target_nm:  { type: 'number', description: 'Target output wavelength [nm] (optional; if omitted, finds SHG at pump_nm/2)' },
        tol_nm:     { type: 'number', description: 'Wavelength tolerance [nm] for matching (default 5)' },
        L_mm:       { type: 'number', description: 'Crystal length [mm] (default 10)' },
        P_W:        { type: 'number', description: 'Pump power [W] (default 1)' },
        w0_um:      { type: 'number', description: 'Beam waist [µm] (default 50)' },
      },
      required: ['pump_nm'],
    },
  },
  {
    name: 'nl_opo_threshold',
    description:
      'Calculate CW OPO threshold pump power using Boyd-Kleinman focusing theory. ' +
      'Returns P_th [W] for a singly-resonant (SRO) or doubly-resonant (DRO) OPO. ' +
      'Uses the exact BK focusing integral h(ξ) for the specified beam waist.',
    inputSchema: {
      type: 'object',
      properties: {
        d_eff_pmV:    { type: 'number', description: 'Effective nonlinearity d_eff [pm/V]' },
        lambda_p_nm:  { type: 'number', description: 'Pump wavelength [nm]' },
        lambda_s_nm:  { type: 'number', description: 'Signal wavelength [nm]' },
        lambda_i_nm:  { type: 'number', description: 'Idler wavelength [nm]' },
        n_p:          { type: 'number', description: 'Refractive index at pump wavelength' },
        n_s:          { type: 'number', description: 'Refractive index at signal wavelength' },
        n_i:          { type: 'number', description: 'Refractive index at idler wavelength' },
        L_mm:         { type: 'number', description: 'Crystal length [mm]' },
        w0_um:        { type: 'number', description: 'Pump beam waist in crystal [µm]' },
        loss_s:       { type: 'number', description: 'Round-trip signal loss (fractional, e.g. 0.01 for 1%)' },
        loss_i:       { type: 'number', description: 'Round-trip idler loss (fractional, e.g. 1.0 for SRO)' },
      },
      required: ['d_eff_pmV','lambda_p_nm','lambda_s_nm','lambda_i_nm','n_p','n_s','n_i','L_mm','w0_um','loss_s','loss_i'],
    },
  },
  {
    name: 'nl_opo_optimal',
    description:
      'Find the optimal beam waist w₀ that minimises OPO threshold, using Boyd-Kleinman theory. ' +
      'Returns optimal w₀ [µm], corresponding P_th [W], and focusing parameter ξ. ' +
      'Also returns a scan of P_th vs w₀ for plotting.',
    inputSchema: {
      type: 'object',
      properties: {
        d_eff_pmV:   { type: 'number', description: 'Effective nonlinearity [pm/V]' },
        lambda_p_nm: { type: 'number', description: 'Pump wavelength [nm]' },
        lambda_s_nm: { type: 'number', description: 'Signal wavelength [nm]' },
        lambda_i_nm: { type: 'number', description: 'Idler wavelength [nm]' },
        n_p:         { type: 'number', description: 'n at pump' },
        n_s:         { type: 'number', description: 'n at signal' },
        n_i:         { type: 'number', description: 'n at idler' },
        L_mm:        { type: 'number', description: 'Crystal length [mm]' },
        loss_s:      { type: 'number', description: 'Round-trip signal loss (fractional)' },
        loss_i:      { type: 'number', description: 'Round-trip idler loss (fractional)' },
      },
      required: ['d_eff_pmV','lambda_p_nm','lambda_s_nm','lambda_i_nm','n_p','n_s','n_i','L_mm','loss_s','loss_i'],
    },
  },
  {
    name: 'nl_opo_tuning',
    description:
      'Compute OPO signal/idler tuning curve (wavelength vs temperature or angle). ' +
      'Returns arrays of {T_C, lambda_s_nm, lambda_i_nm} or {theta_deg, lambda_s_nm, lambda_i_nm}.',
    inputSchema: {
      type: 'object',
      properties: {
        crystal:     { type: 'string', description: 'Crystal ID: bbo | ktp | lbo | kdp | ppln' },
        pump_nm:     { type: 'number', description: 'Pump wavelength [nm]' },
        type:        { type: 'string', description: 'Phase-matching type: I or II' },
        T_range_C:   {
          type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
          description: 'Temperature scan range [T_min, T_max] in °C (for temperature tuning)',
        },
        theta_range_deg: {
          type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
          description: 'Angle scan range [θ_min, θ_max] in degrees (for angle tuning)',
        },
        N: { type: 'number', description: 'Number of scan points (default 50)' },
      },
      required: ['crystal', 'pump_nm', 'type'],
    },
  },
  {
    name: 'cavity_solve',
    description:
      'Solve the eigenmode of a linear standing-wave laser cavity. ' +
      'Returns stability status, round-trip ABCD matrix, beam waist w at mirror1 [µm], ' +
      'Rayleigh range zR [m], complex q-parameter, and beam profile w(z) through the cavity. ' +
      'Element types: flatMirror (no params), curvedMirror (R_mm), thinLens (f_mm), ' +
      'freeSpace (L_mm), gainMedium (t_mm, n).',
    inputSchema: {
      type: 'object',
      properties: {
        lambda_nm: { type: 'number', description: 'Wavelength [nm]' },
        mirror1: {
          type: 'object',
          description: 'First mirror element, e.g. {"type":"curvedMirror","R_mm":100}',
          properties: {
            type:  { type: 'string' },
            R_mm:  { type: 'number', description: 'ROC [mm] (null = flat)' },
          },
          required: ['type'],
        },
        intracavity: {
          type: 'array',
          description: 'Elements between mirror1 and mirror2, in order',
          items: {
            type: 'object',
            properties: {
              type:  { type: 'string' },
              L_mm:  { type: 'number' },
              R_mm:  { type: 'number' },
              f_mm:  { type: 'number' },
              t_mm:  { type: 'number' },
              n:     { type: 'number' },
            },
            required: ['type'],
          },
        },
        mirror2: {
          type: 'object',
          description: 'Second (end) mirror element',
          properties: {
            type:  { type: 'string' },
            R_mm:  { type: 'number' },
          },
          required: ['type'],
        },
      },
      required: ['lambda_nm', 'mirror1', 'mirror2'],
    },
  },
  {
    name: 'cavity_scan',
    description:
      'Scan a two-mirror cavity length and compute g-parameters, stability, and beam sizes at each step. ' +
      'Useful for finding stable operating range and mode sizes vs cavity length.',
    inputSchema: {
      type: 'object',
      properties: {
        R1_mm:      { type: 'number', description: 'ROC of mirror 1 [mm] (use 1e9 for flat)' },
        R2_mm:      { type: 'number', description: 'ROC of mirror 2 [mm] (use 1e9 for flat)' },
        L_range_mm: {
          type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
          description: '[L_min, L_max] cavity length range [mm]',
        },
        lambda_nm:  { type: 'number', description: 'Wavelength [nm]' },
        N:          { type: 'number', description: 'Number of scan points (default 200)' },
      },
      required: ['R1_mm', 'R2_mm', 'L_range_mm', 'lambda_nm'],
    },
  },
  {
    name: 'crystal_index',
    description:
      'Get refractive index n(λ) for a nonlinear crystal at a given wavelength. ' +
      'Useful for computing phase-matching conditions or Fresnel losses manually.',
    inputSchema: {
      type: 'object',
      properties: {
        id:        { type: 'string', description: 'Crystal ID: bbo | ktp | lbo | kdp | ppln' },
        lambda_nm: { type: 'number', description: 'Wavelength [nm]' },
        axis:      { type: 'string', description: 'Polarization axis: o (ordinary) or e (extraordinary)' },
      },
      required: ['id', 'lambda_nm', 'axis'],
    },
  },
];

// ── Tool dispatch ─────────────────────────────────────────────────────────────

function callTool(name, args) {
  switch (name) {
    case 'nl_shg_angle':
      return PH.NL.getSHGAngle(args);

    case 'nl_shg_ppln':
      return PH.NL.getSHG_PPLN(args);

    case 'nl_find_combinations':
      return PH.NL.findCombinations(args);

    case 'nl_opo_threshold':
      return PH.NL.getOPOThreshold(args);

    case 'nl_opo_optimal':
      return PH.NL.getOPOOptimalW0(args);

    case 'nl_opo_tuning':
      return PH.NL.getTuningCurve(args);

    case 'cavity_solve': {
      const config = {
        lambda_nm:   args.lambda_nm,
        mirror1:     buildEl(args.mirror1),
        mirror2:     buildEl(args.mirror2),
        intracavity: (args.intracavity || []).map(buildEl),
      };
      return PH.CAVITY.solve(config);
    }

    case 'cavity_scan':
      return PH.CAVITY.scanLength(args);

    case 'crystal_index':
      return { n: PH.getCrystal(args.id).n(args.lambda_nm * 1e-9, args.axis) };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── JSON-RPC 2.0 handler ──────────────────────────────────────────────────────

function handle(msg) {
  const { jsonrpc, id, method, params } = msg;

  // Notifications (no id) — no response
  if (id === undefined || id === null) return null;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities:    { tools: {} },
        serverInfo:      { name: 'photonics-sim', version: '1.0.0' },
      },
    };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const toolName = params && params.name;
    const toolArgs = (params && params.arguments) || {};
    try {
      const result = callTool(toolName, toolArgs);
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        },
      };
    } catch (e) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        },
      };
    }
  }

  // Unknown method
  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: 'Method not found: ' + method },
  };
}

// ── Stdio loop ────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch (_) { return; }
  const response = handle(msg);
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
});
