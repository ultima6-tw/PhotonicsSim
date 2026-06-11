// Beam Sampler — unified output for the renderer
// Depends on: matrices.js, gaussian.js, raytrace.js (all loaded before this)
//
// Takes a system description, runs both Gaussian and ray-tracing engines,
// and returns a single beamData object consumed by 02-renderer.
//
// System schema:
// {
//   beam: {
//     lambda     : number,   // wavelength (m), default 1064e-9
//     w0         : number,   // waist radius (m), default 1e-3
//     waistZ     : number,   // z-position of input waist (m), default 0
//     tiltAngle  : number,   // beam tilt angle (rad), default 0
//   },
//   elements: [
//     { type: 'free',        d: number },
//     { type: 'lens',        f: number },
//     { type: 'mirror',      R: number },   // R=Infinity → flat
//     { type: 'interface',   n1, n2 },
//     { type: 'beamExpander',mag: number },
//   ],
//   rays?: {
//     kind    : 'parallel' | 'pointSource',  // default 'parallel'
//     count   : number,                       // default 7
//     // parallel: halfWidth (default w0)
//     // pointSource: r0 (default 0), maxAngle (default lambda/(pi*w0))
//   },
//   sampling?: {
//     perSegment: number,   // samples per free-space segment, default 80
//   }
// }

const DEFAULTS = {
  lambda:     1064e-9,
  w0:         1e-3,
  waistZ:     0,
  tiltAngle:  0,
  rayCount:   7,
  perSegment: 80,
};

// Resolve thickLens n via Sellmeier if element has a material set.
// Falls back to el.n when sellmeierN is not loaded or material is 'custom'.
function resolveElements(elements, lambda) {
  return elements.map(el => {
    if (el.type === 'thickLens' && el.material && el.material !== 'custom') {
      const n = (typeof sellmeierN === 'function') ? sellmeierN(el.material, lambda) : null;
      if (n !== null && isFinite(n)) return { ...el, n };
    }
    return el;
  });
}

function buildBeamData(system) {
  const beam = { ...DEFAULTS, ...system.beam };
  const { lambda, w0, waistZ, tiltAngle } = beam;
  const perSegment = (system.sampling && system.sampling.perSegment) || DEFAULTS.perSegment;

  const elements = resolveElements(system.elements, lambda);

  // ── Gaussian propagation ────────────────────────────────────────────────────
  const gaussResult = propagate(
    { beam: { lambda, w0, waistZ, tiltAngle }, elements },
    perSegment
  );

  // ── Ray tracing ─────────────────────────────────────────────────────────────
  const raysCfg   = system.rays || {};
  const rayCount  = raysCfg.count || DEFAULTS.rayCount;
  let initialRays;

  if (raysCfg.kind === 'pointSource') {
    const r0       = raysCfg.r0 !== undefined ? raysCfg.r0 : 0;
    const maxAngle = raysCfg.maxAngle || lambda / (Math.PI * w0);
    initialRays = makePointSourceRays(r0, maxAngle, rayCount);
  } else {
    const hw = raysCfg.halfWidth !== undefined ? raysCfg.halfWidth : w0;
    initialRays = makeParallelRays(hw, rayCount, tiltAngle);  // pass tilt to ray engine
  }

  const rayResult = traceRays(
    { elements },
    initialRays,
    perSegment
  );

  // ── Unified optics list (from gaussian; both are identical) ─────────────────
  const optics = gaussResult.optics;

  // ── Total system length ─────────────────────────────────────────────────────
  const totalLength = gaussResult.samples[gaussResult.samples.length - 1].z;

  return {
    gaussian: gaussResult,
    rays:     rayResult,
    optics,
    meta: { lambda, w0, waistZ, tiltAngle, totalLength },
  };
}

// ── Convenience: quick stats string ──────────────────────────────────────────
function beamSummary(beamData) {
  const { meta, gaussian } = beamData;
  const zR = rayleighRange(meta.w0, meta.lambda);
  const lines = [
    `λ = ${(meta.lambda * 1e9).toFixed(0)} nm`,
    `w₀ = ${(meta.w0 * 1e3).toFixed(2)} mm  (input waist)`,
    `zR = ${zR.toFixed(2)} m  (Rayleigh range)`,
    `L  = ${meta.totalLength.toFixed(3)} m  (system length)`,
  ];
  gaussian.waists.forEach((w, i) => {
    lines.push(`waist ${i + 1}: z=${(w.z * 100).toFixed(1)} cm, w=${(w.w * 1e6).toFixed(1)} μm`);
  });
  return lines.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { buildBeamData, beamSummary };
}
