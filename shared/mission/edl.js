// Educational Mars entry, descent and landing (EDL) model up to the start of
// powered descent. Planar 3-DOF point mass over a spherical, rotating Mars
// (atmosphere co-rotates; entry azimuth sets the rotation correction).
//
//   dr/dt = v sinγ
//   dv/dt = −D/m − g sinγ
//   dγ/dt = (L/m)cosσ / v + (v/r − g/v) cosγ
//   ds/dt = (R/r) v cosγ
//
// Atmosphere: NASA Glenn Research Center Mars model
//   https://www.grc.nasa.gov/www/k-12/airplane/atmosmrm.html
//   T[°C] = −31 − 0.000998 h (h ≤ 7000 m), −23.4 − 0.00222 h (h > 7000 m)
//   p[kPa] = 0.699 exp(−0.00009 h);  ρ = p / (0.1921 (T + 273.1))
// Convective stagnation heating: Sutton & Graves (1971), NASA TR R-376,
//   q = K √(p_s/R_N) (H_s − h_w) with K(CO2) = 0.1210 kg/(s·m^1.5·atm^0.5) (Table II).
//   With p_s ≈ ρv², H_s ≈ v²/2, cold wall: q = k √(ρ/R_N) v³, k = K/(2√101325) ≈ 1.90e−4 (SI).
// NOT modelled: radiative heating, TPS material response, winds/dust storms,
// parachute inflation dynamics, guidance & navigation errors, 3-D motion.
import { BODIES } from "./bodies.js";

export const EDL_MODEL_VERSION = "edl-1.0 (planar 3-DOF, NASA GRC Mars atmosphere, Sutton–Graves)";
const G_EARTH = 9.80665;
const K_SG_CO2 = 0.121; // NASA TR R-376 Table II, pure CO2
export const SUTTON_GRAVES_K_MARS = K_SG_CO2 / (2 * Math.sqrt(101325));
const GAMMA_CO2 = 1.29;
const R_CO2 = 191.8; // J/(kg·K)

export function marsAtmosphere(h) {
  const T = h > 7000 ? -23.4 - 0.00222 * h : -31 - 0.000998 * h; // °C
  const p = 0.699 * Math.exp(-0.00009 * h); // kPa
  const Tk = Math.max(100, T + 273.1);
  return { T: Tk, p: p * 1000, rho: p / (0.1921 * Tk), a: Math.sqrt(GAMMA_CO2 * R_CO2 * Tk) };
}

/**
 * opts: {
 *   entrySpeedInertial (m/s, at entry interface), entryAltitude (m, default 125 km),
 *   flightPathAngle_deg (negative), entryAzimuth_deg (heading, 90 = east), latitude_deg,
 *   siteElevation_m (MOLA height), vehicle: { entryMass, aeroshellDiameter, cdHypersonic,
 *   noseRadius, liftToDrag, bankAngle_deg, chuteDiameter, chuteCd, chuteMachMin, chuteMachMax,
 *   chuteQMin, chuteQMax, heatShieldMass, poweredDescentAltitude, maxHeatFlux_Wcm2, maxDecel_g,
 *   minChuteAltitude },
 *   dt }
 */
export function simulateEDL(opts) {
  const M = BODIES.mars;
  const v = opts.vehicle;
  const dt = opts.dt ?? 0.05;
  const Rg = M.radius + (opts.siteElevation_m ?? 0); // local ground radius
  const lat = ((opts.latitude_deg ?? 0) * Math.PI) / 180;
  const az = ((opts.entryAzimuth_deg ?? 90) * Math.PI) / 180;
  // atmosphere-relative speed: subtract co-rotation component along heading
  const vRot = M.rotationRate * (M.radius + opts.entryAltitude) * Math.cos(lat) * Math.sin(az);
  let r = M.radius + (opts.entryAltitude ?? 125000);
  let vel = opts.entrySpeedInertial - vRot;
  let gam = ((opts.flightPathAngle_deg ?? -15.5) * Math.PI) / 180;
  let s = 0,
    t = 0,
    m = v.entryMass;
  const areaShell = (Math.PI * v.aeroshellDiameter ** 2) / 4;
  const areaChute = (Math.PI * v.chuteDiameter ** 2) / 4;
  let phase = "hypersonic";
  let chute = null,
    heatShieldOff = false;
  let qMax = 0,
    qMaxAt = null,
    heatLoad = 0,
    nMax = 0,
    nMaxAt = null,
    dynMax = 0;
  const samples = [];
  const rec = (atm, D, q) =>
    samples.push({ t, h: r - Rg, v: vel, gamma_deg: (gam * 180) / Math.PI, s, mach: vel / atm.a, q_Wcm2: q / 1e4, decel_g: D / m / G_EARTH, dyn: 0.5 * atm.rho * vel * vel, phase });
  const deriv = (rr, vv, gg, cdA, LD) => {
    const h = rr - M.radius;
    const atm = marsAtmosphere(h);
    const g = M.GM / rr ** 2;
    const D = 0.5 * atm.rho * vv * vv * cdA;
    const L = D * LD * Math.cos(((v.bankAngle_deg ?? 0) * Math.PI) / 180);
    return { dr: vv * Math.sin(gg), dv: -D / m - g * Math.sin(gg), dg: L / m / vv + (vv / rr - g / vv) * Math.cos(gg), ds: (Rg / rr) * vv * Math.cos(gg), D, atm };
  };
  let outcome = "timeout";
  for (let it = 0; it < 400000; it++) {
    const cdA = phase === "parachute" ? v.chuteCd * areaChute + v.cdHypersonic * areaShell * (heatShieldOff ? 0.6 : 1) : v.cdHypersonic * areaShell;
    const LD = phase === "hypersonic" ? v.liftToDrag ?? 0 : 0;
    const k1 = deriv(r, vel, gam, cdA, LD);
    const q = SUTTON_GRAVES_K_MARS * Math.sqrt(k1.atm.rho / v.noseRadius) * vel ** 3;
    const n = k1.D / m / G_EARTH;
    if (phase === "hypersonic" && q > qMax) {
      qMax = q;
      qMaxAt = { t, h: r - Rg, v: vel };
    }
    if (phase === "hypersonic") heatLoad += q * dt;
    if (n > nMax) {
      nMax = n;
      nMaxAt = { t, h: r - Rg, phase };
    }
    dynMax = Math.max(dynMax, 0.5 * k1.atm.rho * vel * vel);
    if (it % 10 === 0) rec(k1.atm, k1.D, phase === "hypersonic" ? q : 0);
    // events
    const mach = vel / k1.atm.a,
      dyn = 0.5 * k1.atm.rho * vel * vel;
    if (phase === "hypersonic" && mach <= v.chuteMachMax && t > 10) {
      phase = "parachute";
      chute = { t, h: r - Rg, mach, dyn, v: vel, inWindow: mach >= v.chuteMachMin && dyn >= v.chuteQMin && dyn <= v.chuteQMax };
    }
    if (phase === "parachute" && !heatShieldOff && t - chute.t > 20) {
      heatShieldOff = true;
      m -= v.heatShieldMass;
    }
    if (r - Rg <= v.poweredDescentAltitude) {
      outcome = phase === "parachute" ? "powered-descent-start" : "too-low-before-chute";
      break;
    }
    if (r - Rg <= 0) {
      outcome = "impact";
      break;
    }
    // RK4
    const add = (a, b, f) => a + b * f;
    const k2 = deriv(add(r, k1.dr, dt / 2), add(vel, k1.dv, dt / 2), add(gam, k1.dg, dt / 2), cdA, LD);
    const k3 = deriv(add(r, k2.dr, dt / 2), add(vel, k2.dv, dt / 2), add(gam, k2.dg, dt / 2), cdA, LD);
    const k4 = deriv(add(r, k3.dr, dt), add(vel, k3.dv, dt), add(gam, k3.dg, dt), cdA, LD);
    r += (dt / 6) * (k1.dr + 2 * k2.dr + 2 * k3.dr + k4.dr);
    vel += (dt / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
    gam += (dt / 6) * (k1.dg + 2 * k2.dg + 2 * k3.dg + k4.dg);
    s += (dt / 6) * (k1.ds + 2 * k2.ds + 2 * k3.ds + k4.ds);
    t += dt;
    if (vel < 1) {
      outcome = "stalled";
      break;
    }
  }
  const end = { t, h: r - Rg, v: vel, gamma_deg: (gam * 180) / Math.PI, vVertical: -vel * Math.sin(gam), vHorizontal: vel * Math.cos(gam), mass: m, downrange_m: s };
  return {
    model: EDL_MODEL_VERSION,
    outcome,
    samples,
    entry: { speedInertial: opts.entrySpeedInertial, speedRelative: opts.entrySpeedInertial - vRot, rotationCorrection: vRot, flightPathAngle_deg: opts.flightPathAngle_deg ?? -15.5 },
    peakHeatFlux_Wcm2: qMax / 1e4,
    peakHeatAt: qMaxAt,
    heatLoad_Jcm2: heatLoad / 1e4,
    peakDecel_g: nMax,
    peakDecelAt: nMaxAt,
    peakDynamicPressure_Pa: dynMax,
    chute,
    end,
    suttonGravesK: SUTTON_GRAVES_K_MARS,
  };
}

const crit = (o) => ({ critical: true, ...o });
const r1 = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** Criteria rows appended to the transfer card when Mars direct entry is chosen. */
export function edlCriteria(edl, v) {
  const rows = [];
  rows.push(crit({ id: "edl-outcome", label: "EDL до старту моторного спуску", value: edl.outcome, unit: "", threshold: "парашут розкрито, досягнуто висоти старту спуску", source: "симуляція EDL", method: edl.model, status: edl.outcome === "powered-descent-start" ? "pass" : "fail", reason: edl.outcome === "powered-descent-start" ? `висота ${r1(edl.end.h, 0)} м, v = ${r1(edl.end.v)} м/с` : "Апарат не загальмував до розкриття парашута / зіткнення" }));
  rows.push(crit({ id: "edl-heat", label: "Пікова густина теплового потоку (конвективна)", value: r1(edl.peakHeatFlux_Wcm2), unit: "Вт/см²", threshold: `≤ ${v.maxHeatFlux_Wcm2} (preset)`, source: "Sutton–Graves, NASA TR R-376", method: `q = k√(ρ/R_N)v³, k = ${edl.suttonGravesK.toExponential(3)}; радіаційний нагрів не враховано`, status: edl.peakHeatFlux_Wcm2 <= v.maxHeatFlux_Wcm2 ? "pass" : "fail", reason: "Обмеження теплозахисту — припущення навчального preset" }));
  rows.push({ id: "edl-heatload", critical: false, label: "Інтегральне теплове навантаження", value: r1(edl.heatLoad_Jcm2, 0), unit: "Дж/см²", threshold: "інформаційно", source: "симуляція", method: "∫q dt (гіперзвук)", status: "pass", reason: "Для вибору товщини теплозахисту потрібен аналіз матеріалу — не виконується" });
  rows.push(crit({ id: "edl-g", label: "Пікове перевантаження", value: r1(edl.peakDecel_g), unit: "g₀", threshold: `≤ ${v.maxDecel_g} (preset)`, source: "симуляція", method: "D/(m·g₀)", status: edl.peakDecel_g <= v.maxDecel_g ? "pass" : "fail", reason: edl.peakDecelAt?.phase === "parachute" ? "Пік на розкритті парашута" : "Пік у гіперзвуковій фазі" }));
  if (edl.chute)
    rows.push(crit({ id: "edl-chute", label: "Розкриття парашута (Mach / q / висота)", value: `M ${r1(edl.chute.mach, 2)} · ${r1(edl.chute.dyn, 0)} Па · ${r1(edl.chute.h / 1000, 1)} км`, unit: "", threshold: `M ${v.chuteMachMin}–${v.chuteMachMax}, q ${v.chuteQMin}–${v.chuteQMax} Па, h ≥ ${v.minChuteAltitude / 1000} км`, source: "preset (припущення)", method: "подія при M ≤ M_max", status: edl.chute.inWindow && edl.chute.h >= v.minChuteAltitude ? "pass" : "fail", reason: edl.chute.h < v.minChuteAltitude ? "Замало часу на гальмування під парашутом" : edl.chute.inWindow ? "У вікні розкриття" : "Поза вікном Mach/тиску" }));
  return rows;
}
