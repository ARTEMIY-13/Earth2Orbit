// Terrain-analog comparison at a MATCHED scale. Both grids are block-averaged
// to a common pixel size and cropped to the same ground extent before any
// metric is computed. Missing metrics are reported as missing (never as 0
// difference) and reduce the coverage of the score.
import { meanSpacing, resample, makeGrid, slopeHistogram, slopeAspect, roughness, SLOPE_BINS } from "./analysis.js";

export const ANALOG_MODEL_VERSION = "analog-1.0";
export const DEFAULT_WEIGHTS = { slopeHist: 0.4, slopeP90: 0.2, roughness: 0.2, relief: 0.2 };

function cropCentre(grid, side_m) {
  const px = meanSpacing(grid);
  const n = Math.max(3, Math.min(grid.width, grid.height, Math.floor(side_m / px)));
  const c0 = Math.floor((grid.width - n) / 2),
    r0 = Math.floor((grid.height - n) / 2);
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = grid.data[(r0 + r) * grid.width + c0 + c];
  const g = grid.georef;
  let georef = g;
  if (g.type === "polar-stereographic") georef = { ...g, I0: g.I0 + c0, J0: g.J0 + r0 };
  else if (g.type === "simple-cylindrical") georef = { ...g, lat0: g.lat0 - r0 / g.ppd, lon0: g.lon0 + c0 / g.ppd };
  else if (g.type === "web-mercator") georef = { ...g, px0: g.px0 + c0, py0: g.py0 + r0 };
  return makeGrid(n, n, data, georef, grid.meta);
}

function pct(arr, p) {
  const s = arr.filter((v) => v === v).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))];
}

export function terrainMetrics(grid) {
  const { slope } = slopeAspect(grid);
  const rough = roughness(grid, 1);
  const hist = slopeHistogram(grid);
  const valid = Array.from(grid.data).filter((v) => v === v);
  return {
    pixel_m: meanSpacing(grid),
    extent_m: meanSpacing(grid) * grid.width,
    validPixels: valid.length,
    validFraction: valid.length / grid.data.length,
    slopeHist: hist,
    slopeP50: pct(Array.from(slope), 50),
    slopeP90: pct(Array.from(slope), 90),
    roughnessP50: pct(Array.from(rough), 50),
    relief: valid.length ? pct(valid, 95) - pct(valid, 5) : NaN,
  };
}

function emd(a, b) {
  // 1-D earth mover's distance between two histograms on SLOPE_BINS (degrees)
  let cum = 0,
    d = 0;
  for (let i = 0; i < a.length; i++) {
    cum += a[i] - b[i];
    d += Math.abs(cum) * (SLOPE_BINS[i + 1] - SLOPE_BINS[i]);
  }
  return d;
}

/**
 * Compare target vs candidate. Returns per-metric values, normalised
 * differences, score (0..1, 1 = identical metrics at this scale), coverage.
 */
export function compareTerrain(target, candidate, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const sT = meanSpacing(target),
    sC = meanSpacing(candidate);
  const common = Math.max(sT, sC);
  const fT = Math.max(1, Math.round(common / sT)),
    fC = Math.max(1, Math.round(common / sC));
  const gT = resample(target, fT),
    gC = resample(candidate, fC);
  const pT = meanSpacing(gT),
    pC = meanSpacing(gC);
  const scaleMismatch = Math.abs(pT - pC) / Math.max(pT, pC);
  const side = Math.min(pT * gT.width, pC * gC.width);
  const cT = cropCentre(gT, side),
    cC = cropCentre(gC, side);
  const mT = terrainMetrics(cT),
    mC = terrainMetrics(cC);
  const minPixels = opts.minPixels ?? 100;
  const enough = mT.validPixels >= minPixels && mC.validPixels >= minPixels && mT.validFraction >= 0.5 && mC.validFraction >= 0.5;
  const rows = [];
  const add = (id, label, vT, vC, unit, norm, d, method) => {
    const ok = enough && Number.isFinite(vT) && Number.isFinite(vC) && Number.isFinite(d);
    rows.push({ id, label, target: Number.isFinite(vT) ? vT : null, candidate: Number.isFinite(vC) ? vC : null, unit, normalisation: norm, difference: ok ? Math.min(1, d) : null, available: ok, method, weight: weights[id] ?? 0 });
  };
  add("slopeHist", "Розподіл ухилів (EMD)", mT.slopeHist.n || NaN, mC.slopeHist.n || NaN, "°", "EMD / 10°", emd(mT.slopeHist.fractions, mC.slopeHist.fractions) / 10, "Earth mover's distance між гістограмами ухилів Horn 3×3");
  rows[0].target = mT.slopeHist.fractions;
  rows[0].candidate = mC.slopeHist.fractions;
  add("slopeP90", "Ухил P90", mT.slopeP90, mC.slopeP90, "°", "|Δ| / 10°", Math.abs(mT.slopeP90 - mC.slopeP90) / 10, "90-й процентиль ухилу");
  add("roughness", "Шорсткість P50", mT.roughnessP50, mC.roughnessP50, "м", "|log10 відношення| / 1 декада", Math.abs(Math.log10(Math.max(1e-3, mT.roughnessP50) / Math.max(1e-3, mC.roughnessP50))), "RMS залишку від площини, вікно 3×3 на спільному масштабі");
  add("relief", "Перепад висот P5–P95", mT.relief, mC.relief, "м", "|log10 відношення| / 1 декада", Math.abs(Math.log10(Math.max(0.1, mT.relief) / Math.max(0.1, mC.relief))), "на однаковій площі " + Math.round(side) + " м");
  const avail = rows.filter((r) => r.available && r.weight > 0);
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
  const wAvail = avail.reduce((a, r) => a + r.weight, 0);
  const coverage = wSum ? wAvail / wSum : 0;
  const score = wAvail ? 1 - avail.reduce((a, r) => a + r.weight * r.difference, 0) / wAvail : null;
  const flags = [];
  if (scaleMismatch > 0.25) flags.push(`Масштаби після узгодження різняться на ${Math.round(scaleMismatch * 100)} %`);
  if (!enough) flags.push("Замало валідних пікселів на спільному масштабі — порівняння не виконується");
  if (coverage < 0.6) flags.push("Покриття метрик < 60 % — рейтинг ненадійний");
  return {
    model: ANALOG_MODEL_VERSION,
    commonPixel_m: Math.max(pT, pC),
    extent_m: side,
    factors: { target: fT, candidate: fC },
    rows,
    coverage,
    score: coverage >= 0.6 ? score : null,
    rawScore: score,
    flags,
    target: mT,
    candidate: mC,
    note: "Подібність морфометрії на заданому масштабі — не ймовірність безпечної посадки і не геологічна тотожність.",
  };
}

export const ANALOG_LIMITS = {
  moon: ["Гравітація 0.166 g", "Вакуум (немає атмосфери, вітру, парашутів)", "Реголіт без води/органіки, електростатичний пил", "Радіація та різкі теплові цикли", "Полярне освітлення під низьким кутом"],
  mars: ["Гравітація 0.38 g", "Атмосфера ~6 мбар CO₂ (інша аеродинаміка й EDL)", "Радіаційне середовище", "Хімія ґрунту (перхлорати)", "Температурний режим"],
};
