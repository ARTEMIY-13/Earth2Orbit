// Low-precision analytic ephemerides (frame: ecliptic & mean equinox J2000, SI).
//  • Planets: JPL "Approximate Positions of the Planets", Table 1 (valid 1800–2050 AD),
//    E. M. Standish — https://ssd.jpl.nasa.gov/planets/approx_pos.html
//    Stated accuracy for Mars ≈ arcminutes (tens of thousands of km).
//  • Moon: low-precision series from Montenbruck & Gill, "Satellite Orbits" (2000) §3.3.2,
//    accuracy ~several arcmin / ~500 km in distance.
// Validated in tests against JPL Horizons vectors (fixture in server/data/fixtures).
// For precise work use JPL Horizons / SPICE (DE440) — the Node server can fetch
// Horizons vectors for comparison.
import { AU, BODIES } from "./bodies.js";
import { utcToJdTDB, J2000_JD } from "./time.js";

const D2R = Math.PI / 180;
export const EPHEMERIS_MODEL = "JPL approx. Keplerian elements (Table 1, 1800–2050) + Montenbruck–Gill low-precision Moon";
export const VALID_RANGE_UTC = [Date.UTC(1800, 0, 1), Date.UTC(2050, 0, 1)];

// [a(au), e, I, L, ϖ, Ω] and rates per Julian century
const ELEMENTS = {
  emb: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
};

function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

function checkRange(utcMs) {
  if (utcMs < VALID_RANGE_UTC[0] || utcMs > VALID_RANGE_UTC[1])
    throw new Error("Дата поза межами чинності наближених ефемерид (1800–2050)");
}

/** Heliocentric state of 'emb' or 'mars' at UTC epoch: { r:[m], v:[m/s] }. */
export function planetState(name, utcMs) {
  checkRange(utcMs);
  const T = (utcToJdTDB(utcMs) - J2000_JD) / 36525;
  const [el0, rate] = ELEMENTS[name];
  const [a_au, e, I, L, wbar, node] = el0.map((v, i) => v + rate[i] * T);
  const a = a_au * AU;
  const w = (wbar - node) * D2R;
  let M = ((L - wbar) % 360) * D2R;
  M = Math.atan2(Math.sin(M), Math.cos(M));
  const E = solveKepler(M, e);
  const mu = BODIES.sun.GM;
  const xp = a * (Math.cos(E) - e),
    yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const n = Math.sqrt(mu / a ** 3);
  const Edot = n / (1 - e * Math.cos(E));
  const vxp = -a * Math.sin(E) * Edot,
    vyp = a * Math.sqrt(1 - e * e) * Math.cos(E) * Edot;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node * D2R), sO = Math.sin(node * D2R), cI = Math.cos(I * D2R), sI = Math.sin(I * D2R);
  const rot = (x, y) => [
    (cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y,
    (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y,
    sw * sI * x + cw * sI * y,
  ];
  return { r: rot(xp, yp), v: rot(vxp, vyp) };
}

function moonPositionRaw(utcMs) {
  const T = (utcToJdTDB(utcMs) - J2000_JD) / 36525;
  const L0 = 218.31617 + 481267.88088 * T - 1.3972 * T; // precess to J2000 ecliptic
  const l = (134.96292 + 477198.86753 * T) * D2R;
  const lp = (357.52543 + 35999.04944 * T) * D2R;
  const F = (93.27283 + 483202.01873 * T) * D2R;
  const D = (297.85027 + 445267.11135 * T) * D2R;
  const S = Math.sin;
  const dl =
    22640 * S(l) + 769 * S(2 * l) - 4586 * S(l - 2 * D) + 2370 * S(2 * D) - 668 * S(lp) - 412 * S(2 * F) -
    212 * S(2 * l - 2 * D) - 206 * S(l + lp - 2 * D) + 192 * S(l + 2 * D) - 165 * S(lp - 2 * D) + 148 * S(l - lp) -
    125 * S(D) - 110 * S(l + lp) - 55 * S(2 * F - 2 * D);
  const lam = (L0 + dl / 3600) * D2R;
  const beta =
    ((18520 * S(F + lam - L0 * D2R + ((412 * S(2 * F) + 541 * S(lp)) / 3600) * D2R) - 526 * S(F - 2 * D) + 44 * S(l + F - 2 * D) -
      31 * S(-l + F - 2 * D) - 25 * S(-2 * l + F) - 23 * S(lp + F - 2 * D) + 21 * S(-l + F) + 11 * S(-lp + F - 2 * D)) /
      3600) *
    D2R;
  const C = Math.cos;
  const r =
    (385000 - 20905 * C(l) - 3699 * C(2 * D - l) - 2956 * C(2 * D) - 570 * C(2 * l) + 246 * C(2 * l - 2 * D) -
      205 * C(lp - 2 * D) - 171 * C(l + 2 * D) - 152 * C(l + lp - 2 * D)) *
    1000;
  return [r * C(beta) * C(lam), r * C(beta) * S(lam), r * S(beta)];
}

/** Geocentric Moon state (ecliptic J2000), velocity by central difference. */
export function moonState(utcMs) {
  checkRange(utcMs);
  const h = 60000;
  const r = moonPositionRaw(utcMs);
  const a = moonPositionRaw(utcMs - h),
    b = moonPositionRaw(utcMs + h);
  return { r, v: b.map((x, i) => (x - a[i]) / (2 * h / 1000)) };
}

const MOON_FRACTION = BODIES.moon.GM / (BODIES.earth.GM + BODIES.moon.GM);

/** Heliocentric Earth (not EMB) and Mars states. */
export function bodyState(id, utcMs) {
  if (id === "mars") return planetState("mars", utcMs);
  if (id === "earth") {
    const emb = planetState("emb", utcMs);
    const m = moonState(utcMs);
    return { r: emb.r.map((x, i) => x - MOON_FRACTION * m.r[i]), v: emb.v.map((x, i) => x - MOON_FRACTION * m.v[i]) };
  }
  throw new Error("No heliocentric ephemeris for " + id);
}

export const OBLIQUITY_J2000 = 23.43928 * D2R;
export function eclipticToEquatorial([x, y, z]) {
  const c = Math.cos(OBLIQUITY_J2000),
    s = Math.sin(OBLIQUITY_J2000);
  return [x, c * y - s * z, s * y + c * z];
}
