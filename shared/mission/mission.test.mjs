import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeGrid } from "../terrain/analysis.js";
import { simulateDescent } from "./descent.js";
import { lambert, propagate, norm } from "./lambert.js";
import { bodyState, moonState } from "./ephemeris.js";
import { planTransfer } from "./transfer.js";
import { zonedToUtc, utcToJdTT, utcToJdUtc, taiMinusUtc } from "./time.js";
import { values, presetById, STACK_DEFAULTS } from "./vehicles.js";
import { stateAt } from "./timeline.js";
import { buildScenario, parseScenario, profileCSV } from "./scenario.js";
import { landingCard } from "./assessment.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b}±${tol}, got ${a}`);
const flat = (n = 200, spacing = 20, z = () => 0) => {
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = z(c, r);
  return makeGrid(n, n, data, { type: "local-metric", spacing_m: spacing, lat0: 0, lon0: 0, radius_m: 1e12 }); // radius → ∞: no curvature
};
const robot = values(presetById("edu-robotic").lander);

test("vacuum free fall matches the analytic solution and conserves energy", () => {
  const g = 1.62;
  const res = simulateDescent({ grid: flat(), col: 100, row: 100, bodyId: "moon", g, lander: robot, mode: "ballistic", dt: 0.1, start: { altitude: 1000, downrange: 0, approachAzimuth: 0, horizontalSpeed: 0, verticalSpeed: 0 } });
  assert.equal(res.outcome, "contact");
  near(res.touchdown.t, Math.sqrt((2 * 1000) / g), 1e-6, "time of fall");
  near(res.touchdown.vVertical, Math.sqrt(2 * g * 1000), 1e-4, "impact speed");
  for (const s of res.samples) near(0.5 * (s.vx ** 2 + s.vy ** 2 + s.vz ** 2) + g * s.z, g * 1000, 1e-6, "specific energy");
  assert.equal(res.propellantUsed, 0);
});

test("powered descent converges as the timestep is reduced", () => {
  const run = (dt) => simulateDescent({ grid: flat(), col: 100, row: 100, bodyId: "moon", lander: robot, dt, start: { altitude: 1500, downrange: 1500, approachAzimuth: 45, horizontalSpeed: 30, verticalSpeed: -10 } }).touchdown;
  const a = run(0.1), b = run(0.05), c = run(0.025);
  assert.ok(a && b && c);
  near(b.t, c.t, 0.05, "touchdown time");
  near(b.vVertical, c.vVertical, 0.02, "vertical speed");
  assert.ok(Math.abs(b.t - c.t) <= Math.abs(a.t - c.t) + 1e-9);
});

test("mass never drops below dry mass; fuel exhaustion is detected", () => {
  const tiny = { ...robot, propellant: 5 };
  const res = simulateDescent({ grid: flat(), col: 100, row: 100, bodyId: "moon", lander: tiny, start: { altitude: 1500, downrange: 1000, approachAzimuth: 0, horizontalSpeed: 30, verticalSpeed: -10 } });
  assert.ok(res.fuelOut);
  assert.ok(res.samples.every((s) => s.m >= robot.dryMass - 1e-9 && s.fuel >= -1e-9));
  assert.equal(landingCard(res, tiny).status, "fail");
  // ideal Δv formula
  const full = simulateDescent({ grid: flat(), col: 100, row: 100, bodyId: "moon", lander: robot, start: { altitude: 1500, downrange: 1000, approachAzimuth: 0, horizontalSpeed: 30, verticalSpeed: -10 } });
  near(full.idealDeltaV, robot.isp * 9.80665 * Math.log((robot.dryMass + robot.propellant) / robot.dryMass), 1e-9);
  assert.ok(full.usedDeltaV < full.idealDeltaV);
});

test("integration stops exactly at contact (no tunnelling with large dt)", () => {
  // 1-pixel-wide 200 m wall at col 120; fast horizontal ballistic flight, dt = 1 s
  const g = flat(200, 20, (c) => (c === 120 ? 200 : 0));
  const res = simulateDescent({ grid: g, col: 100, row: 100, bodyId: "moon", g: 1.62, lander: robot, mode: "ballistic", dt: 1, start: { altitude: 150, downrange: 0, approachAzimuth: 90, horizontalSpeed: 400, verticalSpeed: 0 } });
  assert.equal(res.outcome, "contact");
  assert.ok(res.touchdown.x < 21 * 20 && res.touchdown.x > 18 * 20, "contact at the wall, x=" + res.touchdown.x);
  const last = res.samples[res.samples.length - 1];
  near(last.clearance, 0, 0.5);
});

test("same scenario → identical result (deterministic)", () => {
  const opts = { grid: flat(), col: 100, row: 100, bodyId: "moon", lander: robot, start: { altitude: 1200, downrange: 900, approachAzimuth: 200, horizontalSpeed: 25, verticalSpeed: -8 } };
  const a = simulateDescent(opts), b = simulateDescent(opts);
  assert.equal(JSON.stringify(a.samples), JSON.stringify(b.samples));
});

test("timeline interpolation is independent of playback (pure function of t)", () => {
  const samples = [{ t: 0, z: 0 }, { t: 10, z: 100 }];
  near(stateAt(samples, 2.5).z, 25, 1e-12);
  near(stateAt(samples, 2.5).z, stateAt(samples, 2.5).z, 0);
});

test("Lambert solver reproduces Curtis Example 5.2", () => {
  const mu = 398600e9;
  const sol = lambert([5000e3, 10000e3, 2100e3], [-14600e3, 2500e3, 7000e3], 3600, mu);
  const v1 = sol.v1.map((x) => x / 1000), v2 = sol.v2.map((x) => x / 1000);
  [-5.9925, 1.9254, 3.2456].forEach((v, i) => near(v1[i], v, 2e-4));
  [-3.3125, -4.1966, -0.38529].forEach((v, i) => near(v2[i], v, 2e-4));
});

test("two-body propagation: circular orbit returns after one period; Lambert arc closes", () => {
  const mu = 3.986004418e14, r = 7000e3, v = Math.sqrt(mu / r);
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
  const s = propagate([r, 0, 0], [0, v, 0], T, mu);
  near(s.r[0], r, 1e-3);
  near(s.r[1], 0, 1e-3);
  const sol = lambert([r, 0, 0], [0, 2 * r, 100e3], 9000, mu);
  const end = propagate([r, 0, 0], sol.v1, 9000, mu);
  near(norm(end.r.map((x, i) => x - [0, 2 * r, 100e3][i])), 0, 1);
});

test("analytic ephemerides agree with JPL Horizons (DE441) within stated bounds", () => {
  const fx = JSON.parse(readFileSync("server/data/fixtures/horizons-vectors.json", "utf8"));
  const toUtc = (jd) => (jd - 2440587.5) * 86400000 - 69184;
  const err = (s, e) => norm(s.r.map((x, i) => x / 1000 - e.r_km[i]));
  for (const e of fx.data["earth-helio"]) assert.ok(err(bodyState("earth", toUtc(e.jdTDB)), e) < 20000);
  for (const e of fx.data["mars-helio"]) assert.ok(err(bodyState("mars", toUtc(e.jdTDB)), e) < 80000);
  for (const e of fx.data["moon-geo"]) assert.ok(err(moonState(toUtc(e.jdTDB)), e) < 500);
});

test("changing the date changes the epoch geometry, not just a label", () => {
  const stack = values(STACK_DEFAULTS);
  const base = { target: "moon", windowDays: 0, tofMinDays: 4, tofMaxDays: 4, launchLat: 28.5, stack, landerMass: 2100, descentStart: { horizontalSpeed: 30 } };
  const a = planTransfer({ ...base, launchUtc: Date.UTC(2027, 0, 1) });
  const b = planTransfer({ ...base, launchUtc: Date.UTC(2027, 0, 8) });
  assert.ok(norm(a.best.r2.map((x, i) => x - b.best.r2[i])) > 1e8, "Moon moved > 100 000 km in a week");
  assert.notEqual(Math.round(a.best.dvStage), Math.round(b.best.dvStage));
});

test("Mars 2026 window: TMI from LEO is in the expected 3.5–4.5 km/s range", () => {
  const stack = values(STACK_DEFAULTS);
  const m = planTransfer({ target: "mars", launchUtc: Date.UTC(2026, 9, 1), windowDays: 120, tofMinDays: 150, tofMaxDays: 300, launchLat: 28.5, stack, landerMass: 1300, arrivalMode: "entry" });
  assert.ok(m.best.dvDep > 3500 && m.best.dvDep < 4500, "TMI " + m.best.dvDep);
  assert.ok(m.best.arc.closureError_m < 1000);
  // far from a window the best Δv is much worse
  const off = planTransfer({ target: "mars", launchUtc: Date.UTC(2028, 0, 1), windowDays: 20, tofMinDays: 150, tofMaxDays: 300, launchLat: 28.5, stack, landerMass: 1300, arrivalMode: "entry" });
  assert.ok(off.best.dvDep > m.best.dvDep + 1000);
});

test("time scales: Kyiv DST, TT−UTC = 69.184 s", () => {
  assert.equal(new Date(zonedToUtc("2026-07-01T12:00", "Europe/Kyiv")).toISOString(), "2026-07-01T09:00:00.000Z");
  assert.equal(new Date(zonedToUtc("2026-01-15T12:00", "Europe/Kyiv")).toISOString(), "2026-01-15T10:00:00.000Z");
  const t = Date.UTC(2026, 10, 14);
  assert.equal(taiMinusUtc(t), 37);
  near((utcToJdTT(t) - utcToJdUtc(t)) * 86400, 69.184, 1e-4); // float64 JD resolution ~10 µs
});

test("scenario JSON round-trip and CSV units", () => {
  const inputs = { datasetId: "x", site: { col: 1, row: 2 }, ellipse: { a_m: 1, b_m: 1, azimuth_deg: 0 }, vehicleId: "edu-robotic", lander: robot, stack: values(STACK_DEFAULTS), descentStart: { altitude: 1 }, launch: { local: "2026-11-14T10:00", timeZone: "Europe/Kyiv" }, transfer: { windowDays: 10 } };
  const sc = buildScenario({ inputs, dataset: null, results: { computedUtc: 0 } });
  const back = parseScenario(JSON.stringify(sc));
  assert.deepEqual(back.inputs, inputs);
  assert.throws(() => parseScenario('{"schemaVersion":99}'));
  const csv = profileCSV({ interpolation: "bilinear", points: [{ d: 0, z: 1, lat: 0, lon: 0 }, { d: 1, z: null, lat: 0, lon: 0 }] });
  assert.match(csv, /distance_m,elevation_m/);
  assert.match(csv, /1\.00,,0\.000000,0\.000000,,1/);
});

// ---- Mars EDL and Earth ascent ------------------------------------------------
import { simulateEDL, marsAtmosphere, SUTTON_GRAVES_K_MARS } from "./edl.js";
import { simulateAscent, _simulateOnce } from "./ascent.js";
import { LAUNCHER_PRESETS, launcherValues, edlValues } from "./vehicles.js";
import { transferCard as tCard } from "./assessment.js";

test("Mars atmosphere follows the NASA GRC model; Sutton–Graves constant from TR R-376", () => {
  const a = marsAtmosphere(0);
  near(a.p, 699, 1e-9);
  near(a.rho, 0.699 / (0.1921 * (273.1 - 31)), 1e-9);
  near(marsAtmosphere(10000).T, 273.1 - 23.4 - 22.2, 1e-9);
  near(SUTTON_GRAVES_K_MARS, 0.121 / (2 * Math.sqrt(101325)), 1e-12);
  near(SUTTON_GRAVES_K_MARS, 1.9e-4, 2e-6);
});

const marsEdlVehicle = () => edlValues(values(presetById("edu-mars").edl), 1300);
test("Mars EDL: reaches powered-descent start, converges in dt, steeper entry → more heating & g", () => {
  const base = { entrySpeedInertial: 5700, entryAltitude: 125000, entryAzimuth_deg: 90, latitude_deg: 18.4, siteElevation_m: -2640, vehicle: marsEdlVehicle() };
  const a = simulateEDL({ ...base, flightPathAngle_deg: -12.5, dt: 0.05 });
  const b = simulateEDL({ ...base, flightPathAngle_deg: -12.5, dt: 0.01 });
  assert.equal(a.outcome, "powered-descent-start");
  near(a.peakHeatFlux_Wcm2, b.peakHeatFlux_Wcm2, 0.05);
  near(a.end.v, b.end.v, 0.1);
  assert.ok(a.chute && a.chute.mach <= 2.0001);
  const steep = simulateEDL({ ...base, flightPathAngle_deg: -18 });
  assert.ok(steep.peakDecel_g > a.peakDecel_g && steep.peakHeatFlux_Wcm2 > a.peakHeatFlux_Wcm2);
  // rotation correction: eastward entry is slower relative to the atmosphere
  assert.ok(a.entry.speedRelative < a.entry.speedInertial);
});

test("Earth ascent: reaches the parking orbit; losses are positive; dt-converged; too heavy fails", () => {
  const L = launcherValues(LAUNCHER_PRESETS[0]);
  const a = simulateAscent({ launcher: L, payload: 30000, latitude_deg: 28.57, targetAltitude: 200000 });
  assert.ok(a.ok, JSON.stringify(a.reasons));
  assert.ok(a.perigeeAlt >= 180000 && a.apogeeAlt < 260000);
  assert.ok(a.gravityLoss > 0 && a.dragLoss > 0 && a.steeringLoss >= 0);
  near(a.rotationBonus, 7.2921159e-5 * 6378137 * Math.cos((28.57 * Math.PI) / 180), 1e-6);
  const c1 = _simulateOnce(L, 30000, { latitude_deg: 28.57, targetAltitude: 200000, dt: 0.1 }, a.kick_deg, false, a.pitchFrac);
  const c2 = _simulateOnce(L, 30000, { latitude_deg: 28.57, targetAltitude: 200000, dt: 0.05 }, a.kick_deg, false, a.pitchFrac);
  near(c1.propellantLeft, c2.propellantLeft, 0.01 * L.stages[1].propellant);
  assert.equal(simulateAscent({ launcher: L, payload: 200000, latitude_deg: 28.57, targetAltitude: 200000 }).ok, false);
});

test("transfer card uses simulated ascent and EDL instead of assumptions", () => {
  const stack = values(STACK_DEFAULTS);
  const m = planTransfer({ target: "mars", launchUtc: Date.UTC(2026, 9, 1), windowDays: 90, tofMinDays: 150, tofMaxDays: 300, launchLat: 28.57, stack, landerMass: 1900, arrivalMode: "entry" });
  const ascent = simulateAscent({ launcher: launcherValues(LAUNCHER_PRESETS[0]), payload: m.stackMass, latitude_deg: 28.57, targetAltitude: stack.parkingAltitude });
  const ev = marsEdlVehicle();
  const edl = simulateEDL({ entrySpeedInertial: m.best.entrySpeed, entryAltitude: 125000, flightPathAngle_deg: ev.flightPathAngle_deg, entryAzimuth_deg: 90, latitude_deg: 18.4, siteElevation_m: -2640, vehicle: ev });
  const card = tCard(m, stack, { ascent, edl, edlVehicle: ev });
  const ids = card.criteria.map((c) => c.id);
  assert.ok(ids.includes("launcher") && ids.includes("edl-heat") && ids.includes("edl-g"));
  assert.ok(!card.criteria.some((c) => c.status === "insufficient" && c.id === "edl"), "EDL is computed, not 'insufficient'");
});

test("verdict cards are fully localised: English output contains no Cyrillic", async () => {
  const { terrainCard: tc, landingCard: lc, transferCard: xc } = await import("./assessment.js");
  const cyr = /[А-Яа-яІіЇїЄєҐґ]/;
  const g = flat(60, 5, (c) => c * 0.3);
  const lander = values(presetById("edu-robotic").lander);
  const d = simulateDescent({ grid: g, col: 30, row: 30, bodyId: "moon", lander, start: { altitude: 800, downrange: 100, approachAzimuth: 0, horizontalSpeed: 10, verticalSpeed: -10 } });
  const stack = values(STACK_DEFAULTS);
  const m = planTransfer({ target: "mars", launchUtc: Date.UTC(2026, 9, 1), windowDays: 30, tofMinDays: 180, tofMaxDays: 260, launchLat: 28.57, stack, landerMass: 1900, arrivalMode: "entry" });
  const ev = edlValues(values(presetById("edu-mars").edl), 1300);
  const edl = simulateEDL({ entrySpeedInertial: m.best.entrySpeed, entryAltitude: 125000, flightPathAngle_deg: -12.5, entryAzimuth_deg: 90, latitude_deg: 18, siteElevation_m: -2600, vehicle: ev });
  const cards = [tc(g, { col: 30, row: 30 }, lander, { a_m: 40, b_m: 20, azimuth_deg: 0 }, "en"), lc(d, lander, "en"), xc(m, stack, { edl, edlVehicle: ev }, "en"), lc(null, lander, "en"), xc({ applicable: false }, stack, {}, "en")];
  for (const card of cards) {
    for (const t of [card.title, card.error, card.note, ...(card.unassessed || [])]) if (t) assert.ok(!cyr.test(t), "EN text: " + t);
    for (const c of card.criteria) for (const k of ["label", "threshold", "method", "reason", "unit"]) if (typeof c[k] === "string") assert.ok(!cyr.test(c[k]), `${card.id}.${c.id}.${k}: ${c[k]}`);
  }
  // Ukrainian is still the default
  assert.equal(cards[0].title, "Terrain");
  assert.equal(tc(g, { col: 30, row: 30 }, lander, { a_m: 40, b_m: 20, azimuth_deg: 0 }).title, "Рельєф");
});
