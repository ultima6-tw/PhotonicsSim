#!/usr/bin/env node
// PhotonicsSim CLI — JSON in, JSON out, zero npm dependencies
//
// Usage:
//   node cli.js '{"fn":"NL.getSHGAngle","args":{"crystal":"bbo","pump_nm":1064,"type":"I"}}'
//   echo '{"fn":"cavity_solve","args":{...}}' | node cli.js
//   node cli.js list    ← print available functions

const fs   = require('fs');
const path = require('path');

const BASE = __dirname;

// ── Physics file loading (two scopes to avoid _C name collision) ──────────────
// efficiency.js and eigenmode.js both declare `const _C` with different values.

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
  const NL  = new Function(loadFiles(NL_FILES)  + '\nreturn{NL,getCrystal,CRYSTAL_DB,bk_h,bk_xi,bk_B,bk_Gamma,bk_optimal_w0,opo_threshold,opo_threshold_from_zR,opo_scanL,opo_scanW0,opo_optimalW0};')();
  const CAV = new Function(loadFiles(CAV_FILES) + '\nreturn{CAVITY,makeElement,propagateQ,beamRadius};')();
  PH = Object.assign({}, NL, CAV);
} catch (e) {
  process.stderr.write('Physics load error: ' + e.message + '\n');
  process.exit(1);
}

// ── Element builder (mm units → m, JSON → element object) ────────────────────

function buildEl(spec) {
  const { type, R_mm, L_mm, f_mm, t_mm, n } = spec;
  const p = {};
  if (R_mm !== undefined) p.R_m = R_mm === null ? Infinity : R_mm * 1e-3;
  if (L_mm !== undefined) p.L_m = L_mm * 1e-3;
  if (f_mm !== undefined) p.f_m = f_mm * 1e-3;
  if (t_mm !== undefined) p.t_m = t_mm * 1e-3;
  if (n   !== undefined) p.n   = n;
  return PH.makeElement(type, p);
}

function buildCavity(args) {
  return {
    mirror1:     buildEl(args.mirror1),
    mirror2:     buildEl(args.mirror2),
    intracavity: (args.intracavity || []).map(buildEl),
    lambda_nm:   args.lambda_nm,
  };
}

// ── Function registry ─────────────────────────────────────────────────────────

const REGISTRY = {
  // NonlinearSim — NL namespace
  'NL.getSHGAngle':      a => PH.NL.getSHGAngle(a),
  'NL.getSHG_PPLN':      a => PH.NL.getSHG_PPLN(a),
  'NL.getTuningCurve':   a => PH.NL.getTuningCurve(a),
  'NL.getAcceptance':    a => PH.NL.getAcceptance(a),
  'NL.findCombinations': a => PH.NL.findCombinations(a),

  // OPO threshold
  'NL.getOPOThreshold':   a => PH.NL.getOPOThreshold(a),
  'NL.getOPOThreshold_zR':a => PH.NL.getOPOThreshold_zR(a),
  'NL.getOPOOptimalW0':   a => PH.NL.getOPOOptimalW0(a),
  'NL.getOPOScanL':       a => PH.NL.getOPOScanL(a.base, a.L_min_mm, a.L_max_mm, a.N),
  'NL.getOPOScanW0':      a => PH.NL.getOPOScanW0(a.base, a.w_min_um, a.w_max_um, a.N),

  // CavitySim
  'CAVITY.solve':              a => PH.CAVITY.solve(buildCavity(a)),
  'CAVITY.scanLength':         a => PH.CAVITY.scanLength(a),
  'CAVITY.findMinWaistLength': a => PH.CAVITY.findMinWaistLength(a),

  // Boyd-Kleinman primitives
  'bk_h':           a => PH.bk_h(a.xi, a.B),
  'bk_xi':          a => PH.bk_xi(a.L_mm, a.lambda_nm, a.n, a.w0_um),
  'bk_optimal_w0':  a => PH.bk_optimal_w0(a.L_mm, a.lambda_nm, a.n, a.B),

  // Crystal database
  'crystal_n':      a => PH.getCrystal(a.id).n(a.lambda_nm * 1e-9, a.axis),
  'list_crystals':  ()  => Object.keys(PH.CRYSTAL_DB),
};

// ── Dispatch ──────────────────────────────────────────────────────────────────

function dispatch(fn, args) {
  const handler = REGISTRY[fn];
  if (!handler) throw new Error(`Unknown function: ${fn}\nAvailable: ${Object.keys(REGISTRY).join(', ')}`);
  return handler(args || {});
}

function run(input) {
  try {
    const result = dispatch(input.fn, input.args);
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + '\n');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const arg = process.argv[2];

if (arg === 'list' || arg === '--list') {
  console.log('Available functions:\n' + Object.keys(REGISTRY).map(k => '  ' + k).join('\n'));
} else if (arg) {
  run(JSON.parse(arg));
} else {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => (buf += d));
  process.stdin.on('end', () => run(JSON.parse(buf.trim())));
}
