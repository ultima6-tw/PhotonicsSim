// ABCD Ray Transfer Matrices
// Each matrix is [a, b, c, d] representing [[a,b],[c,d]]
// Convention: [r_out, theta_out] = M * [r_in, theta_in]
// Angles in radians (paraxial approximation)

const M = {
  // Free space propagation, distance d
  free(d) {
    return [1, d, 0, 1];
  },

  // Thin lens, focal length f (f>0 converging, f<0 diverging)
  lens(f) {
    return [1, 0, -1 / f, 1];
  },

  // Spherical mirror, radius of curvature R (R>0 concave/focusing)
  // Using unfolded representation (equivalent to thin lens f=R/2)
  mirror(R) {
    if (!isFinite(R)) return [1, 0, 0, 1]; // flat mirror = identity (unfolded)
    return [1, 0, -2 / R, 1];
  },

  // Flat interface between two media (refraction, normal incidence)
  interface(n1, n2) {
    return [1, 0, 0, n1 / n2];
  },

  // Thick lens: two spherical surfaces + glass medium
  // R1: front surface radius, R2: back surface radius, d: thickness, n: refractive index
  // R>0 if center of curvature is to the right
  thickLens(R1, R2, d, n) {
    const m1 = M.refractingSurface(R1, 1, n);
    const prop = M.free(d);
    const m2 = M.refractingSurface(R2, n, 1);
    return M.mul(m2, M.mul(prop, m1));
  },

  // Single refracting spherical surface
  // R>0 if center of curvature is to the right
  refractingSurface(R, n1, n2) {
    return [1, 0, (n1 - n2) / (R * n2), n1 / n2];
  },

  // Crystal slab (flat entrance and exit, refractive index n, physical length t)
  // Equivalent ray-transfer matrix: [[1, t/n], [0, 1]]
  // Represents a nonlinear crystal or other optical medium at normal incidence.
  crystal(n, t) {
    return [1, t / n, 0, 1];
  },

  // Beam expander (telescope), magnification M (M>1 expands, M<1 collimates)
  // Equivalent to two thin lenses separated by f1+f2
  beamExpander(mag) {
    const f1 = 1.0;          // normalised; actual scale doesn't matter for matrix
    const f2 = -mag * f1;    // negative = diverging front element for Galilean
    const sep = f1 + f2;
    return M.mul(M.lens(f2), M.mul(M.free(sep), M.lens(f1)));
  },

  // --- Matrix utilities ---

  // Multiply two 2×2 matrices: C = A * B
  mul(a, b) {
    const [a0, a1, a2, a3] = a;
    const [b0, b1, b2, b3] = b;
    return [
      a0 * b0 + a1 * b2,
      a0 * b1 + a1 * b3,
      a2 * b0 + a3 * b2,
      a2 * b1 + a3 * b3,
    ];
  },

  // Apply matrix to a ray vector [r, theta]
  applyRay(mat, r, theta) {
    const [a, b, c, d] = mat;
    return [a * r + b * theta, c * r + d * theta];
  },

  // Apply matrix to a Gaussian beam q-parameter
  // q_out = (A*q + B) / (C*q + D)
  applyQ(mat, q) {
    const [a, b, c, d] = mat;
    // Complex arithmetic: q = qr + i*qi
    const qr = q.r, qi = q.i;
    const numR = a * qr + b,  numI = a * qi;
    const denR = c * qr + d,  denI = c * qi;
    const den2 = denR * denR + denI * denI;
    return {
      r: (numR * denR + numI * denI) / den2,
      i: (numI * denR - numR * denI) / den2,
    };
  },

  // Compose a sequence of matrices (left = last applied)
  // elements: array of matrices, applied left-to-right to the beam
  compose(matrices) {
    return matrices.reduce((acc, m) => M.mul(m, acc), [1, 0, 0, 1]);
  },

  // Pretty-print a matrix
  fmt(mat) {
    const [a, b, c, d] = mat.map(v => v.toFixed(5));
    return `[[${a}, ${b}], [${c}, ${d}]]`;
  },
};

// Named element factories (return {type, matrix, params, label})
const Element = {
  free(d) {
    return { type: 'free', matrix: M.free(d), params: { d }, label: `Free ${d.toFixed(3)} m` };
  },
  lens(f) {
    return { type: 'lens', matrix: M.lens(f), params: { f }, label: `Lens f=${f.toFixed(3)} m` };
  },
  thickLens(R1, R2, d, n) {
    return { type: 'thickLens', matrix: M.thickLens(R1, R2, d, n), params: { R1, R2, d, n },
             label: `Thick Lens n=${n.toFixed(3)}` };
  },
  mirror(R = Infinity) {
    return { type: 'mirror', matrix: M.mirror(R), params: { R }, label: isFinite(R) ? `Mirror R=${R.toFixed(3)} m` : 'Flat Mirror' };
  },
  interface(n1, n2) {
    return { type: 'interface', matrix: M.interface(n1, n2), params: { n1, n2 }, label: `Interface n=${n1}→${n2}` };
  },
  crystal(n, t) {
    return { type: 'crystal', matrix: M.crystal(n, t), params: { n, t },
             label: `Crystal n=${n.toFixed(3)} t=${(t * 1000).toFixed(1)} mm` };
  },
  beamExpander(mag) {
    return { type: 'beamExpander', matrix: M.beamExpander(mag), params: { mag }, label: `Beam Expander ×${mag}` };
  },
};

// Export for use in other modules
if (typeof module !== 'undefined') module.exports = { M, Element };
