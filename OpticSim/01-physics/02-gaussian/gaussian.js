// Gaussian Beam Propagation
// Depends on: matrices.js (must be loaded before this file)
//
// q-parameter convention:
//   q(z) = (z - z_waist) + i * z_R
//   1/q  = 1/R(z) - i*lambda/(pi*w(z)^2)
//
// After an ABCD element: q_out = (A*q + B) / (C*q + D)

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQ(z, waistZ, zR) {
  return { r: z - waistZ, i: zR };
}

function rayleighRange(w0, lambda) {
  return Math.PI * w0 * w0 / lambda;
}

// Beam radius w from q-parameter
function beamRadius(q, lambda) {
  const denom = q.r * q.r + q.i * q.i;
  const invQi = -q.i / denom;               // Im(1/q)
  return Math.sqrt(-lambda / (Math.PI * invQi));
}

// Wavefront radius of curvature R from q-parameter (Inf at waist)
function wavefrontR(q) {
  const denom = q.r * q.r + q.i * q.i;
  const invQr = q.r / denom;                // Re(1/q)
  return Math.abs(invQr) < 1e-30 ? Infinity : 1 / invQr;
}

// Beam divergence half-angle (far field), radians
function divergence(w0, lambda) {
  return lambda / (Math.PI * w0);
}

// ── Element matrix dispatcher ────────────────────────────────────────────────

function matrixFor(el) {
  switch (el.type) {
    case 'free':        return M.free(el.d);
    case 'lens':        return M.lens(el.f);
    case 'mirror':      return M.mirror(el.R !== undefined ? el.R : Infinity);
    case 'interface':   return M.interface(el.n1, el.n2);
    case 'beamExpander':return M.beamExpander(el.mag);
    case 'thickLens':   return M.thickLens(el.R1, el.R2, el.d, el.n);
    case 'crystal':     return M.crystal(el.n, el.t);
    default:
      throw new Error(`Unknown element type: ${el.type}`);
  }
}

// ── Main propagation function ─────────────────────────────────────────────────
//
// system = {
//   beam: { lambda, w0, waistZ },   // lambda & w0 in metres
//   elements: [ { type, ...params }, ... ]
// }
//
// Returns:
//   samples   : [{ z, w, Rcurv, qr, qi, rc, thetac }]  — dense z-axis samples
//              rc     = centroid transverse position (metres)
//              thetac = centroid angle (radians)
//   optics    : [{ z, type, params }]        — element positions (for renderer)
//   waists    : [{ z, w }]                   — local waist positions
//
// beam.tiltAngle (optional, radians): initial beam angle w.r.t. optical axis.
// Centroid follows the same ABCD matrix as a geometric ray: [r, theta].

function propagate(system, samplesPerSegment = 80) {
  const { beam, elements } = system;
  const { lambda, w0, waistZ = 0, tiltAngle = 0 } = beam;

  const zR = rayleighRange(w0, lambda);

  let z  = 0;
  let q  = makeQ(z, waistZ, zR);
  let rc = 0;           // centroid transverse position
  let tc = tiltAngle;   // centroid angle (tiltAngle for on-axis input)

  const samples = [];
  const optics  = [];

  // boundary:true marks samples at optical element transitions —
  // Re(q) can jump discontinuously here, so waist detection must skip these pairs.
  function pushSample(zPos, qVal, rc_, tc_, boundary = false) {
    samples.push({
      z:        zPos,
      w:        beamRadius(qVal, lambda),
      Rcurv:    wavefrontR(qVal),
      qr:       qVal.r,
      qi:       qVal.i,
      rc:       rc_,
      thetac:   tc_,
      boundary,
    });
  }

  pushSample(z, q, rc, tc);

  for (const el of elements) {
    if (el.type === 'free') {
      const d = el.d;
      for (let i = 1; i <= samplesPerSegment; i++) {
        const dz  = d * i / samplesPerSegment;
        const qHz = M.applyQ(M.free(dz), q);
        pushSample(z + dz, qHz, rc + tc * dz, tc);
      }
      q  = M.applyQ(M.free(d), q);
      rc = rc + tc * d;
      // tc unchanged through free space
      z += d;
    } else {
      optics.push({ z, type: el.type, params: { ...el } });
      q = M.applyQ(matrixFor(el), q);
      const ray = M.applyRay(matrixFor(el), rc, tc);  // returns [r, theta]
      rc = ray[0]; tc = ray[1];
      pushSample(z, q, rc, tc, true);   // boundary: skip in waist detection
    }
  }

  return {
    samples,
    optics,
    waists: findWaists(samples, lambda),
    meta: { lambda, w0, zR, totalLength: z, tiltAngle },
  };
}

// ── Waist finder ─────────────────────────────────────────────────────────────
// Local waist: where Re(q) = 0  (wavefront curvature → ∞)
// Detect sign changes of qr between consecutive samples and interpolate.

function findWaists(samples, lambda) {
  const waists = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    // Skip pairs that cross an element boundary — Re(q) jumps discontinuously there
    if (a.boundary || b.boundary) continue;
    if (a.qr * b.qr < 0) {              // sign change within free-space segment
      const t  = a.qr / (a.qr - b.qr); // linear interp parameter
      const zW = a.z + t * (b.z - a.z);
      // Interpolate Im(q) = z_R at the zero crossing, then derive waist from physics:
      // w₁ = sqrt(z_R · λ / π). Linear interpolation of w would give wrong results
      // when the Rayleigh range is smaller than the sample spacing.
      const qi = a.qi + t * (b.qi - a.qi);
      const wW = Math.sqrt(Math.abs(qi) * lambda / Math.PI);
      waists.push({ z: zW, w: wW });
    }
  }
  return waists;
}

// Export
if (typeof module !== 'undefined') {
  module.exports = { makeQ, rayleighRange, beamRadius, wavefrontR, divergence, matrixFor, propagate, findWaists };
}
