// Sellmeier dispersion equation
// n²(λ) = 1 + Σ Bᵢ·λ² / (λ² − Cᵢ)   where λ is in micrometres

const SELLMEIER_DB = {
  bk7: {
    label: 'BK7',
    B: [1.03961212,  0.231792344, 1.01046945],
    C: [0.00600069867, 0.0200179144, 103.560653],
  },
  nsf11: {
    label: 'N-SF11',
    B: [1.73759695,  0.313747346, 1.89878101],
    C: [0.013188707,  0.0623068142, 155.23629],
  },
  fusedsilica: {
    label: 'Fused silica',
    B: [0.6961663, 0.4079426, 0.8974794],
    C: [0.0046791,  0.0135121, 97.934002],
  },
  znse: {
    label: 'ZnSe',
    B: [4.45813734, 0.467216334, 2.89566290],
    C: [0.200859853, 0.391371166, 47.1362108],
  },
};

// lambda_m: wavelength in metres → refractive index n
function sellmeierN(material, lambda_m) {
  const db = SELLMEIER_DB[material];
  if (!db) return null;
  const lum2 = (lambda_m * 1e6) ** 2;   // µm²
  let n2 = 1;
  for (let i = 0; i < 3; i++) n2 += db.B[i] * lum2 / (lum2 - db.C[i]);
  return Math.sqrt(n2);
}

if (typeof module !== 'undefined') module.exports = { SELLMEIER_DB, sellmeierN };
