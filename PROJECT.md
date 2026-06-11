# PhotonicsSim — Developer Guide

This document is for people who want to understand, modify, or extend the codebase.

> **Development context:** This project was built through conversational sessions with [Claude Code](https://claude.ai/code) by someone who is not familiar with optics — someone needed the tool so they tried to build it. The physics formulas, references, and all code came from Claude. If you're reading this because you want to contribute or fix something, welcome. The code is intentionally structured to be readable — each physics layer is in its own file with a clear, minimal API.

**Last updated:** 2026-06-11 — Disclaimer added to `index.html`; personal path removed from `mcp-server.js` comment (replaced with `/path/to/PhotonicsSim/`).

---

## Architecture Overview

The project has two independent physics engines that talk to each other through a clean API layer.

```
NonlinearSim/                  CavitySim/
├── 01-crystals/               ├── 01-elements/
│   Sellmeier databases        │   ABCD element definitions
├── 02-physics/                ├── 02-physics/
│   Phase matching, BK, OPO   │   Round-trip matrix, eigenmode
└── 03-solver/                 └── 03-solver/
    NL namespace API               CAVITY namespace API
         │                              │
         └──────────────┬───────────────┘
                        ▼
                  OPODesign/index.html
                  (integrates both)
                        │
                  OpticSim/
                  (beam propagation + 3D UI)
                  loads NL for crystal elements
```

**Rule of separation:** NonlinearSim answers "what happens inside the crystal". OpticSim answers "how does the beam travel". They connect via `NL.toOpticSimElement()` and `NL.toOpticSimWavelengths()`, and via the CavitySim → OpticSim URL handoff.

---

## File-by-File Reference

### NonlinearSim — Nonlinear Optics Engine

#### `01-crystals/`

Each crystal file defines a single `const` object with one method: `n(lambda_m, axis, opts?)` returning the refractive index from Sellmeier equations.

| File | Crystal | Sellmeier source |
|------|---------|-----------------|
| `bbo.js` | BBO (β-BaB₂O₄) | Kato 1986, *Appl. Opt.* 25, 2450 |
| `ktp.js` | KTP (KTiOPO₄) | Kato 1994, *IEEE J. QE* 30, 2950 |
| `lbo.js` | LBO (LiB₃O₅) | Kato 1994, *IEEE J. QE* 30, 881 |
| `kdp.js` | KDP (KH₂PO₄) | Nikogosyan 2005 |
| `ppln.js` | MgO:PPLN | Gayer 2008, *Appl. Phys. B* 91, 343 |
| `index.js` | `CRYSTAL_DB`, `getCrystal(id)` | — |

**To add a crystal:** copy any existing file, replace the Sellmeier coefficients, add it to `index.js`.

#### `02-physics/`

| File | Exports | Purpose |
|------|---------|---------|
| `sellmeier.js` | `n_o()`, `n_e()`, `n_eff()` | Index calculation helpers |
| `phase-match.js` | `findPMAngle()`, `deltaN()` | PM angle search via bisection |
| `ppln-qpm.js` | `ppln_period()`, `ppln_gain()` | QPM poling period |
| `efficiency.js` | `shg_eta()`, `shg_gamma()` | SHG conversion efficiency (**⚠ see note below**) |
| `deff.js` | `deff_uniaxial()`, `deff_biaxial()` | Effective nonlinearity d_eff(θ) |
| `gvd.js` | `gvd()`, `gvm()` | Group velocity dispersion (numerical differentiation) |
| `thermal.js` | `ppln_period_T()` | Temperature-tuned PPLN QPM |
| `bk-focus.js` | `bk_h()`, `bk_xi()`, `bk_Gamma()`, `bk_optimal_w0()` | Boyd-Kleinman focusing |
| `opo-tuning.js` | `opo_signal_idler()` | OPO signal/idler from energy conservation |
| `opo-threshold.js` | `opo_threshold()`, `opo_optimalW0()`, `opo_scanL()`, `opo_scanW0()` | CW OPO threshold |

**⚠ Known issue in `efficiency.js`:** The current formula `η = Γ·P·L²` is the undepleted pump approximation. It overestimates efficiency when η > ~10%. The correct formula is `η = tanh²(√(Γ·P)·L)` (Armstrong et al. 1962). This is a one-line fix in `shg_eta()` and is the highest-priority improvement.

#### `03-solver/solver.js`

Exposes the `NL` namespace — the main API for all nonlinear optics. HTML pages and the CLI/MCP server talk to this layer; they don't call the physics files directly.

Key functions:

```javascript
NL.getSHGAngle({ crystal, pump_nm, type, L_mm, P_W, w0_um })
// → { theta_pm_deg, deff_pmV, eta_pct, bw_nm, bw_mrad, walk_off_mrad, n_pump, n_sh }

NL.getSHG_PPLN({ pump_nm, T_C, L_mm, P_W, w0_um })
// → { period_um, deff_pmV, eta_pct, ... }

NL.findCombinations({ pump_nm, target_nm, tol_nm, L_mm, P_W, w0_um })
// → { query, combinations: [...] }

NL.getOPOThreshold({ d_eff_pmV, lambda_p_nm, lambda_s_nm, lambda_i_nm,
                     n_p, n_s, n_i, L_mm, w0_um, loss_s, loss_i })
// → { P_th_W, xi, h_xi, Gamma2_spec }

NL.getOPOOptimalW0({ ...same except no w0_um... })
// → { w0_um, P_th_W, xi, scan: [{w0_um, P_th_W}] }
```

---

### CavitySim — Cavity Eigenmode Solver

#### `01-elements/elements.js`

`makeElement(type, params)` — the only constructor you need.

```javascript
makeElement('flatMirror')
makeElement('curvedMirror', { R_m: 0.1 })    // R in metres
makeElement('thinLens',     { f_m: 0.05 })
makeElement('freeSpace',    { L_m: 0.09 })
makeElement('gainMedium',   { t_m: 0.02, n: 1.745 })
```

Each element object has an `.M` property (2×2 ABCD matrix) and a `.label` string.

**To add an element type:** extend the `switch` statement in `makeElement()`.

#### `02-physics/`

| File | Exports | Purpose |
|------|---------|---------|
| `roundtrip.js` | `roundTripMatrix()`, `traceHalf()` | Compute M_rt from element list |
| `eigenmode.js` | `solveEigenmode()`, `propagateQ()`, `beamRadius()`, `modeProfile()` | Complex q-parameter propagation |
| `stability.js` | `scanStability()` | Scan g₁g₂ product vs cavity length |

**Eigenmode convention:** `q` at mirror1 is the primary output. `q.re = -waistZ` (distance from M1 to waist, negative means waist is inside cavity). `q.im = zR` (Rayleigh range in free space).

To propagate q to a point inside the cavity (e.g. crystal center):
```javascript
const q1    = propagateQ(q_at_m1, freeSpaceElement.M);
const M_half = [[1, L_crystal_m / (2 * n_crystal)], [0, 1]];
const q_center = propagateQ(q1, M_half);
const w0_um = beamRadius(q_center, lambda_m) * 1e6;
```

#### `03-solver/cavity-solver.js`

Exposes the `CAVITY` namespace:

```javascript
CAVITY.solve({ mirror1, intracavity, mirror2, lambda_nm })
// → { stable, M_rt, trace_half, eigenmode: { q, w_m, R_m, zR }, profile }

CAVITY.scanLength({ R1_mm, R2_mm, L_range_mm, N, lambda_nm })
// → [{ L_mm, g1, g2, product, stable, w1_um, w2_um }, ...]

CAVITY.findMinWaistLength(config)   // same args as scanLength
// → { L_mm, w1_um } | null
```

---

### OpticSim — Beam Propagation + UI

Located at `OpticSim/`. Loads NonlinearSim physics files via `<script>` tags in `04-integration/index.html`.

| Directory | Contents |
|-----------|---------|
| `01-physics/` | ABCD propagation, geometric rays |
| `02-renderer/` | Three.js 3D beam rendering |
| `03-ui/` | Panel shell, element list, parameter editor |
| `04-integration/` | `index.html` — main entry point |

OpticSim reads URL parameters on load (set by CavitySim export):
```
?lambda_nm=1064&w0_mm=0.184&waistZ_cm=0
```

**To modify the UI:** the panel layout is in `03-ui/`. Each panel section is a `<div class="panel-section">` with its own ID. State is kept in `beamCfg` (beam parameters) and `elements[]` (element list).

---

### OPODesign — Integrated OPO Calculator

`OPODesign/index.html` is self-contained. It loads both NonlinearSim and CavitySim physics files and integrates them:

1. User defines cavity geometry (R₁, R₂, L_cav, intracavity elements)
2. `solveCavityMode()` calls `CAVITY.solve()`, propagates eigenmode to crystal center via `propagateQ()`
3. Resulting w₀ feeds into `NL.getOPOThreshold()` and `NL.getOPOOptimalW0()`

---

### LLM Interface

#### `cli.js`

JSON in → JSON out. Zero npm dependencies (uses Node.js built-ins only).

The physics engine cannot be loaded with `require()` because the files use `const` declarations meant for browser `<script>` tags. Instead, all files are concatenated and run inside a single `new Function()` body — this gives all declarations a shared function scope.

**Technical note:** `NonlinearSim/02-physics/efficiency.js` and `CavitySim/02-physics/eigenmode.js` both declare `const _C` for different values (speed of light vs a utility object). To avoid a name collision, they are loaded in two separate `new Function()` scopes and the results merged with `Object.assign`.

To add a new callable function:
1. Add a handler in the `REGISTRY` object at the bottom of `cli.js`
2. Map `fn` string → physics call

#### `mcp-server.js`

Implements MCP protocol (JSON-RPC 2.0 over stdio) without the official SDK — just Node.js `readline` and `process.stdout`.

To add a new MCP tool:
1. Add a tool definition object to the `TOOLS` array (name, description, inputSchema)
2. Add a case in `callTool()` that maps tool name → physics call

---

## How the Modules Connect

### CavitySim → OpticSim (URL handoff)

CavitySim's "Copy OpticSim URL" button generates:
```
../OpticSim/04-integration/index.html?lambda_nm=1064&w0_mm=0.184&waistZ_cm=0
```

OpticSim reads these on load (an IIFE after `beamCfg` initialization) and pre-fills the beam parameters.

### OPODesign → CavitySim eigenmode

The `solveCavityMode()` function in `OPODesign/index.html` calls `CAVITY.solve()` and then propagates the eigenmode q-parameter to the crystal center using `propagateQ()`. This is the key integration — instead of asking the user for "beam waist at crystal", it computes it directly from the cavity geometry.

### NonlinearSim → OpticSim (element injection)

`NL.toOpticSimElement(result, L_mm)` returns an element spec compatible with OpticSim's element list format. `NL.toOpticSimWavelengths(result)` returns wavelength objects for the multi-wavelength beam config. The "Apply" button in OpticSim's nonlinear crystal panel calls these to insert an SHG crystal into the beam path.

---

## Physics Validation

### ABCD matrix propagation

| Case | Analytical | Computed |
|------|-----------|---------|
| w₀=1mm, f=150mm, λ=1064nm | 50.7 µm @ z=149mm | 50.74 µm @ 149.6mm ✅ |
| w₀=2.5mm, f=100mm, λ=1064nm | 13.55 µm @ z=100mm | 13.55 µm @ 100mm ✅ |

### Sellmeier / PM angles

| Crystal | Source | Our result | Literature | Δ |
|---------|--------|-----------|-----------|---|
| BBO | Kato 1986 | θ=22.8° | 22.8° | 0% ✅ |
| KTP | Kato 1994 | φ=24.78° | ~23.5° (vendor) | 1.3° |
| LBO | Kato 1994 | φ=11.61° | 11.3° | 0.3% ✅ |
| PPLN | Gayer 2008 | Λ=6.73 µm | 6.5–6.7 µm | in range ✅ |

### SHG efficiency (Arizona OPTI511L reference setup)

KTP Type-II, L=5mm, P=150mW, w₀=2.5mm:

| Lens | Focus w₀ | ξ | η |
|------|----------|---|---|
| f=100mm | 13.55 µm | 4.61 | 0.037% |
| f=50mm  | 6.77 µm  | 18.52 | 0.147% |

Ratio ~4× with 2× tighter focusing — consistent with η ∝ 1/w₀² (low-efficiency regime).

---

## Known Limitations and Planned Fixes

### P1: Depleted pump (high priority — trivial to fix)

**File:** `NonlinearSim/02-physics/efficiency.js`, function `shg_eta()`

Current formula: `η = Γ · P · L²`
Correct formula: `η = tanh²(√(Γ·P) · L)`

Both agree when η ≪ 1. The current formula overestimates at high power. One-line change, no other files affected.

### P2: Full Boyd-Kleinman h(ξ,B) for SHG efficiency (medium priority)

**File:** `NonlinearSim/02-physics/efficiency.js`

Currently uses πw₀² beam area. Should use the h(ξ,B) focusing integral (Boyd & Kleinman 1968). The integral is already implemented in `bk-focus.js` (used by the OPO threshold calculation) — it just needs to be wired into the SHG efficiency path.

Error without it: ~7% at optimal focus, up to 20–30% far from optimal.

### P3: GVD / GVM for pulsed lasers (low priority)

**File:** `NonlinearSim/02-physics/gvd.js` exists but is not yet wired into `solver.js` outputs.

Would be useful for femtosecond/picosecond pulse design. Requires numerical second derivative of Sellmeier equations. No structural change needed — just expose `gvd()` through `NL.getSHGAngle()` return value.

### Not planned (by design)

- Aberrations: use Zemax/OSLO
- Thermal effects: out of scope for paraxial model  
- M² propagation: would require a full beam quality framework

---

## Sub-project Documentation

- [`NonlinearSim/PROJECT.md`](NonlinearSim/PROJECT.md) — Full phase-by-phase development log, crystal database details, NL API reference
- [`CavitySim/PROJECT.md`](CavitySim/PROJECT.md) — Cavity solver phases, eigenmode math, stability diagram
- [`OpticSim/Project.md`](OpticSim/Project.md) — Beam propagation, 3D renderer, UI architecture, bugfix log
