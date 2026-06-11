// Crystal Database — unified export
// All crystals expose: crystal.n(lambda_m, axis, opts?)
// CRYSTAL_DB keyed by crystal id

const CRYSTAL_DB = {
  bbo:  BBO,
  ktp:  KTP,
  lbo:  LBO,
  kdp:  KDP,
  ppln: PPLN,
};

// List of all crystals as array (for UI iteration)
const CRYSTAL_LIST = Object.values(CRYSTAL_DB);

// Convenience: get crystal by id, throw if not found
function getCrystal(id) {
  const c = CRYSTAL_DB[id];
  if (!c) throw new Error(`Unknown crystal '${id}'. Available: ${Object.keys(CRYSTAL_DB).join(', ')}`);
  return c;
}

if (typeof module !== 'undefined') module.exports = { CRYSTAL_DB, CRYSTAL_LIST, getCrystal };
