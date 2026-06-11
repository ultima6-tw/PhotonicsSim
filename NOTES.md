# PhotonicsSim — User Guide

## What this is

PhotonicsSim is a browser-based laser photonics simulation environment with four integrated modules:

- **OpticSim** — interactive Gaussian beam propagation with 3D visualisation
- **CavitySim** — laser cavity eigenmode solver
- **NonlinearSim** — nonlinear crystal phase-matching and SHG/OPO calculator
- **OPODesign** — integrated OPO threshold optimiser

Open `index.html` in Chrome and click a module. No installation, no build step.

---

## Quick Start: SHG Design

1. Open `OpticSim/04-integration/index.html`
2. In the left panel → **NONLINEAR CRYSTAL** → enter pump wavelength (e.g. 1064 nm) and crystal length
3. Click **Find SHG Combinations** — the tool lists all phase-matchable crystals sorted by efficiency
4. Select one, click **Apply** — a focusing lens + crystal is inserted into the beam path automatically
5. The 3D view updates live; the bottom stats bar shows beam waist at each wavelength

### Manual beam path

1. **SYSTEM ELEMENTS** → add elements with `+ FREE`, `+ LENS`, `+ THCK`
2. Click an element → **ELEMENT PARAMETERS** to edit
3. Click **▶ Compute** to update
4. **BEAM PARAMETERS** sets the input beam (w₀, λ, z₀)

---

## Quick Start: Cavity Design

1. Open `CavitySim/04-ui/index.html`
2. Add mirrors and intracavity elements
3. The solver runs automatically — shows g₁g₂ stability product, trace half, beam profile w(z)
4. In the **Export** section at the bottom: **Copy OpticSim URL** — paste in a new tab to load the eigenmode directly into OpticSim

The cavity solver tells you:
- Is the cavity stable?
- What is the eigenmode beam waist at each mirror?
- What is the Rayleigh range (zR)?
- What does w(z) look like through the cavity?

---

## Quick Start: OPO Threshold

1. Open `OPODesign/index.html`
2. Select a crystal (KTP, BBO, LBO presets)
3. Set pump wavelength, signal/idler wavelengths
4. Either enter beam waist directly, or use the **Cavity** tab to compute w₀ from cavity geometry
5. The calculator returns P_th [W] and shows how threshold varies with crystal length and beam waist

---

## What the numbers mean

### SHG output

| Field | Meaning |
|-------|---------|
| `theta_pm_deg` | Phase-matching angle (tilt the crystal to this angle) |
| `deff_pmV` | Effective nonlinearity [pm/V] — higher is better |
| `eta_pct` | Single-pass conversion efficiency [%] |
| `bw_nm` | Spectral acceptance bandwidth [nm] — how narrow in wavelength the PM is |
| `bw_mrad` | Angular acceptance [mrad] — how precisely you need to align the crystal |
| `walk_off_mrad` | Beam walk-off angle [mrad] — Type-I/II ordinary/extraordinary beams separate |

### Cavity eigenmode output

| Field | Meaning |
|-------|---------|
| `stable` | True if g₁g₂ ∈ (0, 1) |
| `trace_half` | (A+D)/2 of the round-trip matrix; must be in (-1, 1) for stability |
| `eigenmode.q` | Complex beam parameter at mirror 1. Im(q) = Rayleigh range [m], Re(q) = -(waist position from M1) |
| `eigenmode.w_m` | Beam radius at mirror 1 [m] |
| `eigenmode.zR` | Rayleigh range [m] |

### OPO threshold

| Field | Meaning |
|-------|---------|
| `P_th_W` | Threshold pump power [W] |
| `xi` | Boyd-Kleinman focusing parameter ξ = L/(2z_R). Optimum is ξ ≈ 1.39 for OPO |
| `Gamma2_spec` | Normalised gain coefficient [W⁻¹] — crystal + geometry quality factor |

---

## What works and what doesn't

### Works well

- Selecting SHG crystals and comparing efficiencies for a given pump
- Computing beam waist and Rayleigh range after a focusing lens
- Checking whether a given cavity geometry is stable
- Estimating OPO threshold power for a CW laser system
- Rough design of an SHG focusing system (lens choice, crystal position)
- Teaching / visualising Gaussian beam propagation concepts

### Works but with caveats

- **Efficiency numbers** are valid only when η < ~10%. Above that, the undepleted pump approximation breaks down and the numbers are too high. The tool will show this, but will not stop you.
- **KTP and LBO acceptance bandwidths** return null (formula is uniaxial-specific; these are biaxial crystals)
- **Walk-off** is reported in mrad but the spatial beam displacement is not propagated through the system

### Does not work

- High-conversion-efficiency SHG (η > 10–20%) — use a depleted pump model
- Pulsed / ultrashort pulse design — no GVD/GVM (though the underlying Sellmeier equations support it; this is a planned addition)
- High-NA systems — ABCD matrices are paraxial only
- Thermal lensing, crystal heating
- Beam quality M² propagation

---

## Supported Crystals

| Crystal | Type | Best for | PM type |
|---------|------|---------|---------|
| **BBO** | Uniaxial negative | OPO broadband tuning, UV SHG, short-pulse | Type-I, Type-II |
| **KTP** | Biaxial positive | 1064→532 nm SHG — high efficiency, thermally stable | Type-II |
| **LBO** | Biaxial negative | High-power SHG, non-critical PM (no walk-off at 90°) | Type-I, Type-II |
| **KDP** | Uniaxial negative | High peak power, large aperture | Type-I, Type-II |
| **MgO:PPLN** | QPM (z-cut LN) | Highest efficiency SHG, temperature-tunable, telecom | QPM (Type-0) |

### Which crystal to use for 1064→532 nm?

- **KTP Type-II** — the standard choice. High d_eff (~3.2 pm/V), good thermal stability, widely available
- **LBO** — better at high average power (lower absorption), non-critical PM available
- **PPLN** — highest efficiency of all, but requires temperature control and is limited in aperture/power

---

## Comparison with Similar Tools

| | **PhotonicsSim** | **SNLO** | **Zemax** | **VirtualLab** |
|--|:--:|:--:|:--:|:--:|
| Gaussian beam propagation | ABCD paraxial | plane wave | geometric rays | full wavefront |
| Nonlinear crystals | 5 (BBO/KTP/LBO/KDP/PPLN) | large database | none | limited |
| 3D interactive view | ✅ | ✗ | 2D | 2D |
| Crystal → beam path | ✅ one click | manual | requires modelling | requires modelling |
| Depleted pump | ✗ | ✅ | ✗ | ✅ |
| Installation | none (browser) | Windows only | licence required | licence required |
| Scriptable / LLM access | ✅ CLI + MCP | ✗ | ✗ | ✗ |

**SNLO** is the most similar free tool for nonlinear optics calculations, but has no beam propagation visualisation. If you need the full nonlinear optics calculation suite (including complex pulse effects), use SNLO alongside this tool.

---

## Honest Assessment

This tool was built to be useful for quick feasibility checks and teaching. It is not a replacement for SNLO, Zemax, or commercial NLO design software. The physics that is implemented is correct within its stated approximations, but those approximations matter.

The most important limitation: **if your computed efficiency is above ~10%, the number is wrong (too high)**. This is a known issue with a known fix (the depleted pump formula); it just hasn't been implemented yet.

If you find results that disagree with your experimental data or another tool, please open a GitHub issue. That kind of cross-checking is the most valuable thing that can happen to this project.
