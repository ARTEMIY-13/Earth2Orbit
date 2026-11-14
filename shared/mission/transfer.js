// Dated, educational transfer planner (patched conics + Lambert).
//  Earth→Mars: heliocentric Lambert between analytic ephemerides, grid search over
//    departure date × time of flight. Departure Δv from circular LEO; arrival either
//    direct atmospheric entry (EDL NOT modelled) or capture into circular orbit.
//  Earth→Moon: geocentric Lambert from a circular parking orbit to the Moon's
//    position at arrival (Moon gravity ignored until arrival, Sun ignored).
//    Low-energy / multi-body transfers are NOT supported.
// All quantities SI; epochs UTC ms; ephemerides evaluated in TDB.
import { BODIES, G0, DAY } from "./bodies.js";
import { bodyState, moonState, eclipticToEquatorial, EPHEMERIS_MODEL } from "./ephemeris.js";
import { lambert, propagate, cross, norm, dot } from "./lambert.js";

export const TRANSFER_MODEL_VERSION = "transfer-1.0 (patched conics, single-rev Lambert, grid search)";
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, k) => a.map((x) => x * k);
const unit = (a) => scale(a, 1 / norm(a));
const R2D = 180 / Math.PI;

function hyperbolicBurn(vinf, mu, r) {
  return Math.sqrt(vinf * vinf + (2 * mu) / r) - Math.sqrt(mu / r);
}

export function ascentEstimate(lat_deg, parkingAlt, losses) {
  const E = BODIES.earth;
  const r = E.radius + parkingAlt;
  const vc = Math.sqrt(E.GM / r);
  const rot = E.rotationRate * E.radius * Math.cos((lat_deg * Math.PI) / 180);
  return { dv: vc + losses - rot, vCircular: vc, rotationBonus: rot, losses, note: "Due-east launch assumed; trajectory not simulated." };
}

/**
 * opts: { target, launchUtc, windowDays, tofMinDays, tofMaxDays, depStepDays,
 *   tofStepDays, launchLat, stack (numbers), landerMass, arrivalMode ("entry"|"capture"),
 *   descentStart: {horizontalSpeed} , onProgress, signal }
 */
export function planTransfer(opts) {
  const { target } = opts;
  const stack = opts.stack;
  const stackMass = stack.transferDryMass + stack.transferPropellant + opts.landerMass;
  const mf = stack.transferDryMass + opts.landerMass;
  const dvAvailable = stack.transferIsp * G0 * Math.log(stackMass / mf);
  const ascent = ascentEstimate(opts.launchLat, stack.parkingAltitude, stack.ascentLosses);
  const common = {
    model: TRANSFER_MODEL_VERSION,
    ephemeris: EPHEMERIS_MODEL,
    launchUtc: opts.launchUtc,
    launchLat: opts.launchLat,
    stackMass,
    dvAvailable,
    ascentDv: ascent.dv,
    ascent,
  };
  if (target === "earth")
    return { ...common, applicable: false, note: "Ціль — Земля: міжтілесний переліт не застосовується. Аналізується лише локальний тестовий спуск." };
  const rPark = BODIES.earth.radius + stack.parkingAltitude;
  const depStep = (opts.depStepDays ?? (target === "moon" ? 0.25 : 2)) * DAY * 1000;
  const tofStep = (opts.tofStepDays ?? (target === "moon" ? 0.125 : 5)) * DAY;
  const nDep = Math.max(1, Math.min(240, Math.floor((opts.windowDays * DAY * 1000) / depStep) + 1));
  const tofs = [];
  for (let t = opts.tofMinDays * DAY; t <= opts.tofMaxDays * DAY + 1; t += tofStep) tofs.push(t);
  if (tofs.length > 240) throw new Error("Забагато кроків тривалості перельоту (макс. 240)");
  const grid = [];
  let best = null;
  const unmodelled =
    target === "moon"
      ? ["Гравітація Місяця на перельоті (patched conic)", "Вплив Сонця, тиск світла", "Корекції траєкторії (TCM)", "Вибір площини парк. орбіти та часу старту в межах доби", "Низькоенергетичні/багатотільні траєкторії — не підтримуються"]
      : ["Корекції траєкторії (TCM) і навігаційні похибки", "Вхід, гальмування й парашут (EDL) — не моделюються", "Тиск сонячного світла, збурення інших планет", "Час старту в межах доби і площина парк. орбіти"];
  for (let i = 0; i < nDep; i++) {
    if (opts.signal?.aborted) throw new Error("Скасовано");
    const dep = opts.launchUtc + i * depStep;
    const row = [];
    for (const tof of tofs) {
      const arr = dep + tof * 1000;
      let cell = null;
      try {
        cell = target === "mars" ? marsCell(dep, arr, tof, rPark, stack, opts) : moonCell(dep, arr, tof, rPark, stack, opts);
      } catch (e) {
        cell = { error: e.message };
      }
      row.push(cell ? { dvStage: cell.dvStage ?? null, error: cell.error } : null);
      if (cell && Number.isFinite(cell.dvStage) && (!best || cell.dvStage < best.dvStage)) best = { ...cell, depUtc: dep, arrUtc: arr, tof };
    }
    grid.push(row);
    opts.onProgress?.((i + 1) / nDep);
  }
  if (!best) return { ...common, applicable: true, grid, tofs, nDep, depStep, best: null, error: "Немає розв'язку Lambert у заданому вікні", unmodelled };
  best.arc = sampleArc(best, target);
  const lastDep = opts.launchUtc + (nDep - 1) * depStep;
  best.onBoundary = {
    tof: best.tof <= tofs[0] + 1 || best.tof >= tofs[tofs.length - 1] - 1,
    departure: nDep > 1 && (best.depUtc === opts.launchUtc || best.depUtc === lastDep),
  };
  return { ...common, applicable: true, grid, tofs, nDep, depStepMs: depStep, best, unmodelled, frame: target === "moon" ? "geocentric ecliptic J2000" : "heliocentric ecliptic J2000" };
}

function marsCell(dep, arr, tof, rPark, stack, opts) {
  const E = bodyState("earth", dep);
  const M = bodyState("mars", arr);
  const sol = lambert(E.r, M.r, tof, BODIES.sun.GM, true);
  if (!sol) return null;
  const vinfDepVec = sub(sol.v1, E.v);
  const vinfArrVec = sub(sol.v2, M.v);
  const vinfDep = norm(vinfDepVec),
    vinfArr = norm(vinfArrVec);
  const dvDep = hyperbolicBurn(vinfDep, BODIES.earth.GM, rPark);
  const eq = eclipticToEquatorial(vinfDepVec);
  const dla = Math.asin(eq[2] / vinfDep) * R2D;
  const rEntry = BODIES.mars.radius + 125000;
  const entrySpeed = Math.sqrt(vinfArr ** 2 + (2 * BODIES.mars.GM) / rEntry);
  const rOrb = BODIES.mars.radius + stack.arrivalOrbitAltitude;
  const dvCap = hyperbolicBurn(vinfArr, BODIES.mars.GM, rOrb);
  const capture = opts.arrivalMode === "capture";
  const dvStage = dvDep + (capture ? dvCap : 0);
  return {
    r1: E.r, v1: sol.v1, r2: M.r, v2: sol.v2,
    vinfDep, vinfArr, c3: vinfDep ** 2, dla_deg: dla,
    dvDep, dvCap, entrySpeed: capture ? undefined : entrySpeed,
    dvStage,
    dvBreakdown: capture
      ? `TMI ${Math.round(dvDep)} + MOI ${Math.round(dvCap)} м/с (ідеальні імпульси)`
      : `TMI ${Math.round(dvDep)} м/с; прибуття — прямий вхід (EDL не моделюється)`,
  };
}

function moonCell(dep, arr, tof, rPark, stack, opts) {
  const muE = BODIES.earth.GM;
  const Mo = moonState(arr);
  const h = unit(cross(Mo.r, Mo.v)); // Moon orbit plane normal
  // Departure point: opposite the Moon's arrival position, rotated 5° back in
  // the Moon's orbital plane (avoids the 180° Lambert singularity).
  const u = scale(unit(Mo.r), -1);
  const w = cross(h, u);
  const a = (-5 * Math.PI) / 180;
  const r1 = scale(u.map((x, i) => x * Math.cos(a) + w[i] * Math.sin(a)), rPark);
  const sol = lambert(r1, Mo.r, tof, muE, h[2] >= 0);
  if (!sol) return null;
  const vPark = scale(unit(cross(h, r1)), Math.sqrt(muE / rPark));
  const dvTLI = norm(sub(sol.v1, vPark));
  const vinfArr = norm(sub(sol.v2, Mo.v));
  const muM = BODIES.moon.GM;
  const rLLO = BODIES.moon.radius + stack.arrivalOrbitAltitude;
  const dvLOI = hyperbolicBurn(vinfArr, muM, rLLO);
  const vLLO = Math.sqrt(muM / rLLO);
  // Braking from LLO to the descent-start state (estimate, +10 % gravity-loss allowance, assumed)
  const dvBrake = 1.1 * Math.max(0, vLLO - (opts.descentStart?.horizontalSpeed ?? 0));
  const dvStage = dvTLI + dvLOI + dvBrake;
  return {
    r1, v1: sol.v1, r2: Mo.r, v2: sol.v2,
    vinfArr, dvTLI, dvLOI, dvBrake, dvStage,
    c3: norm(sol.v1) ** 2 - (2 * muE) / rPark,
    dvBreakdown: `TLI ${Math.round(dvTLI)} + LOI ${Math.round(dvLOI)} + гальмування до старту спуску ≈${Math.round(dvBrake)} м/с (оцінка)`,
  };
}

/** States along the solved arc + body positions, for charts & 3D (same data). */
export function sampleArc(best, target, n = 240) {
  const mu = target === "moon" ? BODIES.earth.GM : BODIES.sun.GM;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const dt = (best.tof * k) / n;
    const s = propagate(best.r1, best.v1, dt, mu);
    const t = best.depUtc + dt * 1000;
    const rec = { t, dt, r: s.r, v: s.v };
    if (target === "mars") {
      rec.earth = bodyState("earth", t).r;
      rec.target = bodyState("mars", t).r;
    } else {
      rec.earth = [0, 0, 0];
      rec.target = moonState(t).r;
    }
    out.push(rec);
  }
  const end = out[out.length - 1].r;
  return { states: out, closureError_m: norm(sub(end, best.r2)), mu, center: target === "moon" ? "earth" : "sun" };
}

export { dot };
