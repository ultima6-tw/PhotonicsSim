# PhotonicsSim

**A browser-based laser photonics simulation suite for Gaussian beam propagation, nonlinear crystal phase-matching, cavity eigenmode analysis, and OPO design.**

No installation. No build step. Open the HTML files directly in a browser.

---

## How This Was Built

PhotonicsSim was developed entirely through conversational sessions with **[Claude Code](https://claude.ai/code)** (Anthropic's AI coding assistant), by a researcher who works with lasers and photonics but is not a professional software developer.

The development process looked like this: I described what I needed ("implement Boyd-Kleinman focusing theory", "add a cavity eigenmode solver", "connect the OPO threshold calculation to the cavity mode output"), and Claude handled all implementation — JavaScript physics engines, UI panels, ABCD matrix propagation, Sellmeier equations, the MCP server protocol. I provided direction; Claude provided the code and the physics.

**I am not a photonics expert.** I work adjacent to laser systems but I do not have a deep background in nonlinear optics or cavity design. The physics formulas, the choice of Sellmeier references, the Boyd-Kleinman focusing theory, the OPO threshold derivation — all of this came from Claude. I prompted, reviewed, asked follow-up questions, and tested the outputs against reference cases I could find online. But I cannot independently derive or verify the underlying equations.

This matters for how you should use this tool:

- The physics is referenced to published literature (Kato 1986/1994, Boyd & Kleinman 1968, Armstrong et al. 1962, Gayer 2008) — Claude cited sources and I included them in the code
- Results have been spot-checked against a small number of reference cases (see [Physics Validation](#physics-validation))
- **I cannot guarantee there are no physics errors.** If you are a photonics researcher and something looks wrong, it may well be wrong — please open an issue
- The limitations I describe are the ones Claude identified and explained to me; there may be others I'm not aware of

Development was done in June 2026, across multiple Claude Code sessions. The entire codebase — ~3000 lines of physics JS, ~2000 lines of UI — was written by Claude from scratch.

---

## What's Inside

```
PhotonicsSim/
├── index.html              ← Hub page (start here)
├── OpticSim/               ← Gaussian beam propagation + 3D visualiser
├── CavitySim/              ← Laser cavity eigenmode solver
├── NonlinearSim/           ← Nonlinear crystal phase-matching engine
├── OPODesign/              ← Integrated OPO threshold calculator
├── cli.js                  ← Node.js CLI for LLM/script access
└── mcp-server.js           ← MCP server for Claude Code integration
```

### Modules

| Module | What it does |
|--------|-------------|
| **OpticSim** | Interactive Gaussian beam tracer. ABCD matrix propagation through lenses, mirrors, crystals. 3D visualisation with Three.js. Multi-wavelength with Sellmeier chromatic dispersion. |
| **NonlinearSim** | Phase-matching solver for SHG and OPO. Crystals: BBO, KTP, LBO, KDP, MgO:PPLN. Returns PM angle, d_eff, walk-off, acceptance bandwidth, conversion efficiency. |
| **CavitySim** | Standing-wave cavity eigenmode solver. Returns complex q-parameter, beam radii, Rayleigh range, w(z) profile. Exports eigenmode to OpticSim via URL handoff. |
| **OPODesign** | Combined OPO threshold calculator. Embeds a mini cavity designer to compute the beam waist at the crystal from the cavity geometry, then feeds it into Boyd-Kleinman threshold theory. |

---

## Quick Start

1. Clone or download this repository
2. Open `index.html` in a browser (Chrome recommended)
3. Click a module card to open it

Or open any module directly:
- `OpticSim/04-integration/index.html`
- `CavitySim/04-ui/index.html`
- `NonlinearSim/04-ui/index.html`
- `OPODesign/index.html`

No server needed. All computation runs in the browser.

---

## Screenshots

![Hub page](screenshots/hub.png)
*Hub page — module overview and access modes*

![OpticSim](screenshots/opticsim.png)
*OpticSim — Gaussian beam propagation through a two-lens system, 3D visualisation*

![CavitySim](screenshots/cavitysim.png)
*CavitySim — hemispherical cavity eigenmode: beam profile w(z) and g₁g₂ stability diagram*

![NonlinearSim](screenshots/nonlinearsim.png)
*NonlinearSim — 1064→532nm SHG crystal comparison (all PM types) and PPLN temperature tuning curve*

![OPODesign](screenshots/opo-design.png)
*OPODesign — KTP OPO threshold P_th vs crystal length L (left) and beam waist w₀ (right), with optimal focusing marked*

---

## LLM / Programmatic Access

The physics engine is also available as a CLI and an MCP server — designed for use with AI assistants that can call tools.

### CLI

```bash
node cli.js '{"fn":"NL.getSHGAngle","args":{"crystal":"bbo","pump_nm":1064,"type":"I"}}'
echo '{"fn":"CAVITY.solve","args":{...}}' | node cli.js
node cli.js list    # print all available functions
```

**18 functions available** across NL (nonlinear optics), CAVITY (cavity solver), and BK (Boyd-Kleinman) namespaces. Zero npm dependencies.

### MCP Server (Claude Code integration)

Add to your `~/.claude/settings.json`:

```json
"mcpServers": {
  "photonics": {
    "command": "node",
    "args": ["/path/to/PhotonicsSim/mcp-server.js"]
  }
}
```

Then in a Claude Code session, the tools `nl_shg_angle`, `nl_opo_threshold`, `cavity_solve`, etc. become directly callable. This is the intended long-term use case: an AI assistant that can run photonics calculations on demand.

**9 MCP tools:** `nl_shg_angle` · `nl_shg_ppln` · `nl_find_combinations` · `nl_opo_threshold` · `nl_opo_optimal` · `nl_opo_tuning` · `cavity_solve` · `cavity_scan` · `crystal_index`

---

## Physics Validation

The formulas are referenced to published literature. Selected spot-checks:

### ABCD beam propagation

| Case | Analytical expectation | Computed |
|------|----------------------|---------|
| w₀=1mm, f=150mm, λ=1064nm | 50.7 µm @ z=149mm | 50.74 µm @ 149.6mm ✅ |
| w₀=2.5mm, f=100mm, λ=1064nm | 13.55 µm @ z=100mm | 13.55 µm @ 100mm ✅ |

### Sellmeier coefficients and PM angles (1064→532nm SHG)

| Crystal | Sellmeier source | Computed PM angle | Literature | Δ |
|---------|-----------------|-------------------|-----------|---|
| BBO | Kato 1986, *Appl. Opt.* 25, 2450 | θ = 22.8° | 22.8° | 0% ✅ |
| KTP | Kato 1994, *IEEE J. QE* 30, 2950 | φ = 24.78° | ~23.5° (vendor) | 1.3° (Sellmeier version difference) |
| LBO | Kato 1994, *IEEE J. QE* 30, 881 | φ = 11.61° | 11.3° | 0.3% ✅ |
| PPLN | Gayer 2008, *Appl. Phys. B* 91, 343 | Λ = 6.73 µm | 6.5–6.7 µm | within range ✅ |

### SHG efficiency cross-check (against Arizona OPTI511L lab setup)

KTP Type-II, L=5mm, P=150mW, incident w₀=2.5mm:

| Lens | Focus w₀ | ξ = L/(2z_R) | η | P_SHG |
|------|----------|--------------|---|-------|
| f=100mm | 13.55 µm | 4.61 | 0.037% | 0.055 mW |
| f=50mm  | 6.77 µm  | 18.52 | 0.147% | 0.220 mW |

Boyd-Kleinman optimum ξ=2.84 → w_opt≈12.9 µm (f≈108mm). The f=50mm case gives 4× higher efficiency than f=100mm, consistent with theory.

---

## Known Limitations

These are real physics limitations in the current model, not bugs:

| Limitation | Impact | Status |
|-----------|--------|--------|
| **Undepleted pump approximation** | Efficiency formula η = Γ·P·L² is linear — no saturation. Valid for η < ~10%; significantly overestimates at high power. Correct formula: η = tanh²(√(Γ·P)·L) | Planned (trivial to fix) |
| **Paraxial approximation** | ABCD matrices assume small angles. No aberration calculation. | By design (use Zemax for high-NA) |
| **No walk-off spatial tracking** | Walk-off angle is computed and displayed, but beam displacement along propagation is not modelled. | Planned |
| **Biaxial crystal bandwidth** | bw_nm / bw_mrad returns null for KTP/LBO (formula is uniaxial-specific). | Planned |
| **No thermal effects** | Crystal temperature tuning is available for PPLN; general thermo-optic effects are not modelled. | Not planned short-term |
| **No M² beam quality** | Propagation assumes ideal M²=1 Gaussian beams. | Not planned short-term |
| **Full Boyd-Kleinman integral** | Currently uses πw₀² beam area approximation. Full h(ξ,B) integral is implemented for OPO threshold but not for SHG efficiency. Error: ~7% at optimal focus, up to 20-30% off-axis. | Planned |

---

## Crystal Database

| Crystal | Type | Primary use | Sellmeier ref |
|---------|------|------------|--------------|
| BBO (β-BaB₂O₄) | Negative uniaxial | OPO broadband tuning, UV SHG | Kato 1986 |
| KTP (KTiOPO₄) | Positive biaxial | 1064→532nm SHG (high efficiency, stable) | Kato 1994 |
| LBO (LiB₃O₅) | Negative biaxial | High-power SHG, non-critical PM | Kato 1994 |
| KDP (KH₂PO₄) | Negative uniaxial | High-peak-power pulsed SHG | Nikogosyan 2005 |
| MgO:PPLN | QPM (z-cut) | Temperature-tuned, highest efficiency | Gayer 2008 |

---

## Comparison with Other Tools

| | **PhotonicsSim** | **SNLO** (free) | **Zemax OpticStudio** | **VirtualLab** |
|--|:---:|:---:|:---:|:---:|
| Gaussian beam propagation | ABCD paraxial | plane wave / Gaussian | geometric ray + wavefront | full wavefront |
| Nonlinear crystal database | 5 crystals | large database | ✗ | limited |
| Aberration calculation | ✗ | ✗ | ✅ full | ✅ |
| Depleted pump model | ✗ | ✅ | ✗ | ✅ |
| 3D interactive visualisation | ✅ | ✗ | 2D only | 2D only |
| Crystal → beam path workflow | ✅ one click | manual | requires modelling | requires modelling |
| LLM / programmatic access | ✅ CLI + MCP | ✗ | ✗ | ✗ |
| Installation required | none (browser) | Windows installer | licence + install | licence + install |
| Cost | free / open source | free | $thousands/year | $thousands/year |

**Positioning:** SNLO is the closest functional overlap — but has no beam propagation visualisation. Zemax is powerful but has no nonlinear crystal support. PhotonicsSim's core advantage is the "select crystal → insert into beam path → immediately see focusing effect" workflow, and the ability to call it programmatically from an AI assistant.

---

## Contributing

Issues and pull requests are welcome, especially:
- Physics corrections or additional crystal Sellmeier data
- Verification of computed results against experimental data or other simulation tools
- The depleted pump fix (literally changing one line in `efficiency.js`)

If you find a case where the numbers look wrong compared to your lab measurements or another tool, please open an issue with the parameters. That is the most valuable kind of feedback.

---

## License

MIT
