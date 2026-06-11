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

The project uses five categories of validation, applied consistently across all modules:

| Category | When used | What it proves |
|----------|-----------|----------------|
| **Analytic formula** | Exact closed-form answer exists | Numerical implementation is correct |
| **Literature comparison** | Published experimental or tabulated values | Physics model matches real crystals |
| **Physical limits / boundary conditions** | Known degenerate or edge cases | Model behaves correctly at extremes |
| **Self-consistency** | Internal identities that must hold regardless of input | No algebraic or unit errors |
| **Regression** | After adding new features | Existing calculations are not broken |
| **Browser visual** | UI phases | Rendering and interactivity work end-to-end |

### Validation pages index

Every automated test suite has a self-contained HTML page — open it in any browser (no server needed) to re-run all tests and see pass/fail.

| Module | Phase | Validation page | Tests |
|--------|-------|-----------------|-------|
| CavitySim | Ph1 — ABCD elements | [`CavitySim/01-elements/elements-results.html`](CavitySim/01-elements/elements-results.html) | 30/30 |
| CavitySim | Ph2 — Round-trip matrix | [`CavitySim/02-physics/roundtrip-results.html`](CavitySim/02-physics/roundtrip-results.html) | 30/30 |
| CavitySim | Ph3 — Eigenmode | [`CavitySim/02-physics/eigenmode-results.html`](CavitySim/02-physics/eigenmode-results.html) | 27/27 |
| CavitySim | Ph4 — Stability scan | [`CavitySim/02-physics/stability-results.html`](CavitySim/02-physics/stability-results.html) | 29/29 |
| CavitySim | Ph5 — Solver API | [`CavitySim/03-solver/solver-results.html`](CavitySim/03-solver/solver-results.html) | 32/32 |
| NonlinearSim | Ph1 — Sellmeier | [`NonlinearSim/01-crystals/index.html`](NonlinearSim/01-crystals/index.html) | 23/23 |
| NonlinearSim | Ph2 — ne(θ), Δk | [`NonlinearSim/02-physics/index.html`](NonlinearSim/02-physics/index.html) | 13/13 |
| NonlinearSim | Ph3 — SHG PM solver | [`NonlinearSim/02-physics/shg-results.html`](NonlinearSim/02-physics/shg-results.html) | 14/14 |
| NonlinearSim | Ph4 — OPO tuning | [`NonlinearSim/02-physics/opo-results.html`](NonlinearSim/02-physics/opo-results.html) | 14/14 |
| NonlinearSim | Ph5 — PPLN QPM | [`NonlinearSim/02-physics/ppln-results.html`](NonlinearSim/02-physics/ppln-results.html) | 9/9 |
| NonlinearSim | Ph6 — SHG efficiency | [`NonlinearSim/02-physics/efficiency-results.html`](NonlinearSim/02-physics/efficiency-results.html) | 16/16 |
| NonlinearSim | Ph7 — NL solver API | [`NonlinearSim/03-solver/solver-results.html`](NonlinearSim/03-solver/solver-results.html) | 64/64 |
| NonlinearSim | Ph9 — Biaxial PM | [`NonlinearSim/02-physics/biaxial-results.html`](NonlinearSim/02-physics/biaxial-results.html) | 19/19 |
| NonlinearSim | Ph12 — Depleted pump | [`NonlinearSim/02-physics/efficiency-depleted-results.html`](NonlinearSim/02-physics/efficiency-depleted-results.html) | 17/17 |
| NonlinearSim | Ph13 — Boyd-Kleinman | [`NonlinearSim/02-physics/bk-focus-results.html`](NonlinearSim/02-physics/bk-focus-results.html) | 16/16 |
| NonlinearSim | Ph14 — d_eff tensor | [`NonlinearSim/02-physics/deff-results.html`](NonlinearSim/02-physics/deff-results.html) | 22/22 |
| NonlinearSim | Ph15 — GVD / GVM | [`NonlinearSim/02-physics/gvd-results.html`](NonlinearSim/02-physics/gvd-results.html) | 26/26 |
| NonlinearSim | Ph16 — Temperature n(λ,T) | [`NonlinearSim/02-physics/thermal-results.html`](NonlinearSim/02-physics/thermal-results.html) | 28/28 |
| NonlinearSim | OPO Threshold | [`NonlinearSim/02-physics/opo-threshold-results.html`](NonlinearSim/02-physics/opo-threshold-results.html) | 25/25 |
| NonlinearSim | Public reference (vendor data) | [`NonlinearSim/validation.html`](NonlinearSim/validation.html) | — |

---

### CavitySim

#### Phase 1 — ABCD element matrices · [`elements-results.html`](CavitySim/01-elements/elements-results.html)

**Method:** Analytic formula + determinant self-consistency.

Each element matrix is checked against its textbook definition. The matrix determinant must equal 1 for every lossless element (energy conservation). Composite matrices (thin lens followed by free space) are verified against the known analytical product.

Key checks: `CurvedMirror(R)` gives `M[1][0] = −2/R`; `CurvedMirror(R=2f)` is exactly equal to `ThinLens(f)`; all determinants = 1 to machine precision.

#### Phase 2 — Round-trip matrix and stability · [`roundtrip-results.html`](CavitySim/02-physics/roundtrip-results.html)

**Method:** Physical limits on five known cavity geometries.

| Cavity | R₁ | R₂ | L | Expected g₁g₂ | Expected stability |
|--------|----|----|---|---------------|-------------------|
| Hemispherical | ∞ | 200mm | 100mm | 0.5 | Stable ✅ |
| Concentric | 100mm | 100mm | 200mm | 1.0 | Boundary |
| Confocal | 100mm | 100mm | 100mm | 0.0 | Boundary |
| Planar | ∞ | ∞ | any | 1.0 | Boundary |
| Unstable | 100mm | 100mm | 250mm | > 1 | Unstable ✅ |

The confocal cavity additionally requires M_rt = −I (Tr = −2), verified analytically. Round-trip matrix determinant = 1 across all cases.

#### Phase 3 — Eigenmode extraction · [`eigenmode-results.html`](CavitySim/02-physics/eigenmode-results.html)

**Method:** Analytic solution for the hemispherical cavity.

For a hemispherical cavity (R₁=∞, R₂=200mm, L=100mm, λ=1064nm), the eigenmode at the flat mirror has an exact closed-form solution:
- `q = i·L` → `z_R = L = 0.1 m`
- `w₀ = √(λ·z_R / π) ≈ 5.82 µm`
- After propagating distance L: `w = 8.23 µm`, `R_wavefront = 200mm = R₂` ✓

The wavefront curvature matching the mirror radius at the mirror surface is a self-consistency check — it must hold exactly for any stable eigenmode.

For the symmetric cavity (R₁=R₂=200mm, L=100mm): `w@M1 = w@M2` by symmetry, and `w₀_center < w@mirrors` (waist is in the interior). Both verified.

#### Phase 4 — Stability scan · [`stability-results.html`](CavitySim/02-physics/stability-results.html)

**Method:** Physical limits during length scan.

- `L=0`: g = 1 (trivially stable, w → ∞ is unphysical but mathematically consistent)
- `L=R` (confocal): g₁g₂ = 0, boundary
- `L=2R` (concentric): g₁g₂ = 1, beam size diverges — verified that `w → ∞` at this limit
- Stable region is exactly `(0, 2R)` — confirmed continuous from scan
- g₁g₂ product is monotonically decreasing with L for fixed R — confirmed

#### Phase 5 — Solver API · [`solver-results.html`](CavitySim/03-solver/solver-results.html)

**Method:** Integration test combining all Phase 1–4 building blocks.

`CAVITY.solve()` is called with complete cavity configurations and the output is cross-checked against the Phase 3 analytic result (hemispherical cavity). `CAVITY.scanLength()` output is verified against Phase 4 scan results. Input validation (invalid cavities, missing elements) is also tested.

#### Phase 6 — Interactive UI

**Method:** Browser visual confirmation.

Three preset cavities (hemispherical, symmetric, bowtie-like) are loaded and the `w(z)` profile, g₁g₂ stability diagram, and STABLE/UNSTABLE badge are visually confirmed. No automated tests — the rendering pipeline is too browser-specific.

#### Phase 7 — OpticSim integration

**Method:** End-to-end round-trip for a known cavity.

Hemispherical cavity (R₂=200mm, L=100mm, λ=1064nm): CavitySim computes `w₀=184.03 µm`, `waistZ=0 mm` (waist is at the flat mirror). The "Copy OpticSim URL" button encodes these into URL parameters. Opening the URL in OpticSim shows `w₀=0.18mm`, `z₀=0.0cm`, `zR=0.10m` — all consistent with the CavitySim output ✓.

---

### NonlinearSim

#### Phase 1 — Sellmeier databases · [`01-crystals/index.html`](NonlinearSim/01-crystals/index.html)

**Method:** Literature comparison at tabulated wavelengths.

Each crystal's `n(λ)` is compared against values published in the primary Sellmeier source paper. Tolerance: ±0.002 in refractive index.

| Crystal | Reference wavelengths verified |
|---------|-------------------------------|
| BBO | no(1064nm)=1.6551, ne(1064nm)=1.5425, no(532nm)=1.6747 |
| KTP | nx(1064nm)=1.7400, nz(1064nm)=1.8303 |
| LBO | nx(1064nm)=1.5656, nz(1064nm)=1.6054 |
| KDP | no(1064nm)=1.4939, ne(1064nm)=1.4599 |
| PPLN | no(1064nm, 25°C)=2.1540 |

During Phase 1, two bugs were found and fixed: a wrong Sellmeier coefficient in `ppln.js` (a4=12.614 → 189.32) and an incorrect QPM period formula (`2π/Δk` → `1/Δk`).

#### Phase 2 — ne(θ) and Δk calculation · [`02-physics/index.html`](NonlinearSim/02-physics/index.html)

**Method:** Self-consistency at the phase-matching point.

At the SHG phase-matching angle θ_PM, the definition of Type-I phase matching requires:
```
ne(2ω, θ_PM) = no(ω)
```
This identity is checked numerically: Δk must be zero to machine precision at the angle returned by the bisection solver.

#### Phase 3 — SHG phase-matching solver · [`shg-results.html`](NonlinearSim/02-physics/shg-results.html)

**Method:** Literature comparison for well-known crystals.

| Crystal | Type | Pump | Our θ_PM | Literature | Note |
|---------|------|------|----------|-----------|------|
| BBO | I | 1064nm | 22.80° | 22.8° (Kato 1986) | ✅ exact match |
| BBO | I | 800nm | 29.2° | 29.2° | ✅ |
| KDP | I | 1064nm | ~30.3° | 30.3° (Nikogosyan 2005) | ✅ — older 41° value uses 1960s Sellmeier |

The KDP result disambiguates a known historical discrepancy: the 41° figure in older literature comes from 1960s-era Sellmeier coefficients; the Nikogosyan 2005 coefficients give 30.3°.

#### Phase 4 — OPO tuning curves · [`opo-results.html`](NonlinearSim/02-physics/opo-results.html)

**Method:** Physical limits and qualitative literature comparison.

The OPO signal/idler pair must satisfy energy conservation: `1/λ_pump = 1/λ_signal + 1/λ_idler`. This is verified at every point of the tuning curve. The degenerate point (signal = idler = 2λ_pump) is confirmed to appear at the correct pump angle.

Qualitative comparison: BBO pumped at 532nm gives signal in 700–950nm range; BBO pumped at 355nm covers 400–574nm — both consistent with published OPO tuning curves.

A non-trivial algorithmic fix was required: the bisection search must split at `λ_s = 2λ_p` (the degenerate point) because Δk has the same sign on both sides of this maximum and a naive interval search finds no root.

#### Phase 5 — PPLN quasi-phase-matching · [`ppln-results.html`](NonlinearSim/02-physics/ppln-results.html)

**Method:** Literature comparison and physical consistency.

The QPM period for 1064→532nm (eee process, T=25°C) is computed as Λ=6.73 µm, which falls within the 6.5–6.7 µm range reported by multiple MgO:PPLN vendors. The original spec figure of "31 µm" was found to be the OPO degeneracy period (1064nm→2128nm), not the SHG period — this distinction was confirmed by physical analysis.

Temperature tuning: fixing Λ=6.73 µm and scanning temperature shifts the pump wavelength at ~0.11–0.16 nm/°C, consistent with published PPLN tuning coefficients.

#### Phase 6 — SHG conversion efficiency · [`efficiency-results.html`](NonlinearSim/02-physics/efficiency-results.html)

**Method:** Order-of-magnitude comparison with a reference laboratory setup.

The University of Arizona OPTI511L experiment (KTP SHG, L=5mm, P=150mW CW) is used as a reference. The computed efficiency reproduces the expected qualitative behavior: tighter focusing (f=50mm vs f=100mm) gives ~4× higher efficiency, consistent with η ∝ 1/w₀² in the weakly-focused regime.

| Lens | w₀ | ξ | η |
|------|----|---|---|
| f=100mm | 13.55 µm | 4.61 | 0.037% |
| f=50mm | 6.77 µm | 18.52 | 0.147% |

Note: CW single-pass efficiency is inherently ~10–100× lower than pulsed or cavity-enhanced values, which explains the apparent discrepancy with vendor-quoted figures.

#### Phase 7 — NL solver API · [`solver-results.html`](NonlinearSim/03-solver/solver-results.html)

**Method:** Automated unit tests covering all seven public API functions.

Each API endpoint is called with known inputs and the output is checked against Phase 1–6 results. Key numerical assertions:

| API | Input | Expected | Actual |
|-----|-------|----------|--------|
| `getSHGAngle` | BBO Type-I, 1064nm | θ=22.80° | 22.80° ✅ |
| `getSHGAngle` | BBO 1064nm | bw_nm=1.056 | 1.056 ✅ |
| `getSHG_PPLN` | 1064nm, 25°C | Λ=6.731 µm | 6.731 ✅ |
| `getSHG_PPLN` | P=1W, L=10mm | η=0.854% | 0.854% ✅ |
| `findCombinations` | — | PPLN > BBO efficiency | 0.854% > 0.030% ✅ |

Three API bugs were discovered and fixed during this phase (wrong argument count, wrong `type` string format for OPO).

#### Phase 8 — UI

**Method:** Browser visual confirmation.

Selecting BBO + 532nm pump produces a continuous OPO tuning curve. The combination list shows results consistent with Phase 4 calculations. KTP and LBO are correctly marked as "(biaxial)" since biaxial solving was not yet implemented.

#### Phase 9 — Biaxial PM solver · [`biaxial-results.html`](NonlinearSim/02-physics/biaxial-results.html)

**Method:** Literature comparison for KTP and LBO.

| Crystal | Process | Our φ | Literature | Note |
|---------|---------|-------|-----------|------|
| KTP | Type-II XY SF→F | 24.78° | 23.5° (Bierlein 1989) | 1.3° from different Sellmeier source |
| LBO | Type-I XY SS→F | 11.61° | 11.3–11.4° | ✅ < 0.3° |
| LBO | Type-I XZ | 32.26° | — | Self-consistent |

The KTP 1.3° discrepancy is traced to a different Sellmeier coefficient source (Kato 1994 vs Bierlein 1989). The Δk=0 condition is satisfied exactly in our Kato 1994 calculation — the offset is a known inter-source disagreement, not a code error.

#### Phase 10 — Biaxial integration into solver.js · [`solver-results.html`](NonlinearSim/03-solver/solver-results.html) (regression, 64→79)

**Method:** Regression test — all 64 previous tests pass, plus 15 new biaxial tests.

`findCombinations` now returns KTP and LBO in its output. The return format is verified to be compatible with the existing uniaxial output (same field names, with added `plane` and `pm_process`).

#### Phase 11 — OpticSim integration

**Method:** Browser visual confirmation.

After clicking "Apply" for a PPLN result: wavelength list shows [1064nm, 532nm], element list contains a `THCK(ppln, n=2.154)` element, and the 3D viewport renders a yellow PPLN block with dual-color beam. The stats bar confirms focusing: λ=1064nm w=51µm, λ=532nm w=26µm (correct 2× ratio from diffraction).

#### Phase 12 — Depleted pump tanh² · [`efficiency-depleted-results.html`](NonlinearSim/02-physics/efficiency-depleted-results.html)

**Method:** Physical limits.

The key checks are:
1. **Low-signal limit**: `tanh²(γ) ≈ γ²` for small γ → recovers the undepleted formula exactly.
2. **Physical ceiling**: `tanh²(γ) < 1` for all finite γ → conversion efficiency never exceeds 100%.
3. **Continuity**: at the same input power, the new formula agrees with the old one to within 0.1% when η < 5%.

The `shg_gamma()` function (which reports the gain coefficient Γ as a pure physical coefficient) was refactored to call an internal `_shg_Gamma()` so it is not affected by the tanh² change.

#### Phase 13 — Boyd-Kleinman focusing integral · [`bk-focus-results.html`](NonlinearSim/02-physics/bk-focus-results.html)

**Method:** Known limiting values from Boyd & Kleinman (1968).

At Δk=0 (crystal tuned to phase matching), the BK integral `h(ξ, B=0)` has known properties:
- Optimal focus: `ξ_opt ≈ 1.391`, `h_max ≈ 0.645`
- In the loose-focusing limit (ξ → 0): `h(ξ) → ξ` → efficiency scales as ξ, i.e., ∝ L/w₀²

The often-cited `ξ_opt=2.84, h=1.068` from the literature applies to the case where Δk is also optimized simultaneously — this is explicitly different and documented.

Optimal beam waist at each crystal cross-checked:

| Crystal | L | w₀_opt |
|---------|---|--------|
| BBO 1064nm | 10mm | 27.1 µm |
| KTP 1064nm | 5mm | 18.4 µm |
| PPLN 1064nm | 30mm | 41.2 µm |

#### Phase 14 — d_eff(θ) from tensor projection · [`deff-results.html`](NonlinearSim/02-physics/deff-results.html)

**Method:** Literature comparison against Dmitriev (1999) tabulated values.

| Crystal / Type | PM angle | Our d_eff | Literature | Δ |
|----------------|----------|-----------|-----------|---|
| BBO Type-I 1064nm | θ=22.8° | 1.966 pm/V | 2.0 pm/V | 1.7% |
| BBO Type-I 800nm | θ=29.2° | 1.843 pm/V | 1.85 pm/V | 0.4% |
| BBO Type-II 1064nm | θ=33.6° | 0.853 pm/V | 0.88 pm/V | 3.1% |
| KTP Type-II 1064nm | φ=23.5° | 3.621 pm/V | 3.5 pm/V | 3.5% |
| LBO Type-I 1064nm | φ=11.3° | 0.965 pm/V | 0.85 pm/V | 13.5% |
| PPLN QPM | — | 17.19 pm/V | 17.2 pm/V | 0.06% |

LBO's 13.5% error is within the ±20% uncertainty of published d-tensor coefficients (different papers quote significantly different d₃₁/d₃₂ for LBO).

Boundary condition checks: `KTP φ=0°` gives exactly d₂₄; `KTP φ=90°` gives exactly d₁₅ — these are the principal tensor components and must be exact.

#### Phase 15 — GVD and GVM · [`gvd-results.html`](NonlinearSim/02-physics/gvd-results.html)

**Method:** Analytic polynomial, numerical differentiation self-consistency, and physical monotonicity.

1. **Analytic test**: A quadratic Sellmeier polynomial `n(λ) = a + bλ²` has an exact second derivative. The numerical 5-point central difference matches the analytic value to < 0.01%.
2. **3-point vs 5-point consistency**: Both stencils agree to < 0.1%.
3. **BBO monotonicity**: GVD must decrease monotonically from 400nm → 1064nm (normal dispersion region), and must cross zero near 1200nm (ZDW). Confirmed.
4. **Constant n test**: A flat `n(λ)=const` must give GVM = 0 exactly. Confirmed to machine precision.

KTP Type-II reports three GVM parameters (GVM₁₂, GVM₁, GVM₂) because the two pump photons have different polarizations — this is cross-checked against the literature range of 250–400 fs/mm for GVM₁₂:

| KTP parameter | Computed | Literature range |
|---------------|----------|----------------|
| GVM₁₂ (pump–pump) | 307.8 fs/mm | 250–400 fs/mm ✅ |

#### Phase 16 — Temperature-tuned n(λ, T) · [`thermal-results.html`](NonlinearSim/02-physics/thermal-results.html)

**Method:** Calibration to a published experimental observable.

The LBO noncritical phase-matching temperature (where the PM angle reaches 90°, giving zero walk-off) is an experimentally well-established value: T_noncrit ≈ 149°C for 1064→532nm.

The `thermoCorrectedCrystal` model is calibrated so that the computed birefringence `nz(1064,T) − nx(532,T)` crosses zero at 148.1°C ≈ 149°C. This single observable constrains the dn/dT coefficients for both axes simultaneously.

Additional checks:
- PM angle vs temperature scan shows monotonic increase from 11.6° (25°C) → 90° (148°C) ✓
- At exactly T_noncrit, `sin²φ ≥ 1` → model correctly flags this as noncritical PM ✓
- `thermoCorrectedCrystal` with `dT=0` returns the base crystal object unchanged ✓

#### OPO Threshold module · [`opo-threshold-results.html`](NonlinearSim/02-physics/opo-threshold-results.html)

**Method:** Physical sanity against known laser systems.

Three reference configurations with known approximate thresholds:

| System | Our P_th | Physical expectation |
|--------|---------|---------------------|
| KTP DRO, L=20mm, w₀=50µm, δ=1% | 248 mW | Reasonable for CW KTP DRO ✅ |
| KTP optimal focus (w₀_opt=37.3µm) | 216 mW | Lower than w₀=50µm ✅ |
| BBO DRO, L=15mm, w₀_opt=23µm, δ=2% | 334 mW | Higher δ → higher threshold ✅ |

The optimal focus condition is cross-checked: minimum P_th occurs at `ξ_opt ≈ 1.391`, consistent with the Boyd-Kleinman result from Phase 13.

#### Public reference validation · [`validation.html`](NonlinearSim/validation.html)

**Method:** Cross-check against optical component vendor datasheets.

A separate page compares the solver output against published specifications from EKSMA Optics (BBO), Castech Inc. (KTP), and United Crystals (LBO). This is independent of the Sellmeier source papers — it tests whether the computed PM angles and efficiencies match what vendors advertise for standard crystal cuts. Retrieved 2026-06-11.

---

### OpticSim

#### ABCD beam propagation

**Method:** Analytic comparison for two thin-lens focusing cases.

| Input | Analytic | Computed | Δ |
|-------|---------|---------|---|
| w₀=1mm, f=150mm, λ=1064nm | 50.7 µm @ z=149mm | 50.74 µm @ 149.6mm | < 0.1% ✅ |
| w₀=2.5mm, f=100mm, λ=1064nm | 13.55 µm @ z=100mm | 13.55 µm @ 100mm | < 0.01% ✅ |

Both cases use the thin-lens Gaussian beam formula `w_f = f·λ/(π·w₀)` as the reference.

#### NonlinearSim panel integration

**Method:** Browser visual confirmation after "Apply".

PPLN applied to OpticSim: wavelength list = [1064nm, 532nm], thick-lens crystal element inserted, 3D viewport shows dual-color beam with λ=532nm beam 2× narrower than λ=1064nm beam (consistent with diffraction: same zR, shorter wavelength → smaller waist).

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
