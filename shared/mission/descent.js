// Local powered-descent simulation over a DEM in a local ENU frame centred on
// the target pixel. SI units. Fixed-step RK4, independent of rendering/FPS.
//
//   dr/dt = v
//   dv/dt = g_vec + T/m + a_drag
//   dm/dt = -|T| / (Isp * g0)
//
// Model limits (declared in the UI): uniform gravity GM/R², planet curvature
// applied to terrain height (−d²/2R), body rotation (Coriolis/centrifugal)
// ignored inside the few-km local box, exponential atmosphere only for
// Mars/Earth drag, vehicle attitude = thrust direction (no rotational dynamics).
import { G0, BODIES, surfaceGravity, airDensity } from "./bodies.js";
import { sample, spacing, gridNorthAngle, footprintPlane, meanSpacing } from "../terrain/analysis.js";

export const DESCENT_MODEL_VERSION = "descent-1.0 (E-guidance + vertical terminal phase, RK4)";

/** Linear local map (east,north metres) ⇄ grid pixel, fixed at the target. */
export function localFrame(grid, col, row, bodyId) {
  const { dx, dy } = spacing(grid);
  const i = Math.round(row) * grid.width + Math.round(col);
  const th = gridNorthAngle(grid.georef, col, row);
  const R = BODIES[bodyId].meanRadius;
  const cos = Math.cos(th),
    sin = Math.sin(th);
  const toPixel = (x, y) => {
    const right = x * cos + y * sin;
    const up = -x * sin + y * cos;
    return { col: col + right / dx[i], row: row - up / dy[i] };
  };
  const fromPixel = (c, r) => {
    const right = (c - col) * dx[i],
      up = (row - r) * dy[i];
    return { x: right * cos - up * sin, y: right * sin + up * cos };
  };
  const z0 = sample(grid, col, row).z;
  /** Terrain height (m, relative to target elevation, curvature-corrected) or NaN. */
  const terrain = (x, y) => {
    const p = toPixel(x, y);
    const s = sample(grid, p.col, p.row);
    if (!Number.isFinite(s.z)) return NaN;
    return s.z - z0 - (x * x + y * y) / (2 * R);
  };
  return { toPixel, fromPixel, terrain, z0, col, row, gridNorth_rad: th, pixel_m: Math.max(dx[i], dy[i]) };
}

function deriv(s, thrust, ctx) {
  // s = [x,y,z,vx,vy,vz,m]
  const m = s[6];
  let ax = thrust[0] / m,
    ay = thrust[1] / m,
    az = thrust[2] / m - ctx.g;
  if (ctx.dragArea > 0) {
    const rho = airDensity(ctx.bodyId, ctx.siteAltitude + s[2]);
    const v = Math.hypot(s[3], s[4], s[5]);
    const k = (0.5 * rho * v * ctx.dragArea) / m;
    ax -= k * s[3];
    ay -= k * s[4];
    az -= k * s[5];
  }
  const mdot = -Math.hypot(thrust[0], thrust[1], thrust[2]) / (ctx.isp * G0);
  return [s[3], s[4], s[5], ax, ay, az, mdot];
}

function rk4(s, thrust, dt, ctx) {
  const add = (a, b, h) => a.map((v, i) => v + b[i] * h);
  const k1 = deriv(s, thrust, ctx);
  const k2 = deriv(add(s, k1, dt / 2), thrust, ctx);
  const k3 = deriv(add(s, k2, dt / 2), thrust, ctx);
  const k4 = deriv(add(s, k3, dt), thrust, ctx);
  return s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/**
 * Guidance: returns desired thrust vector (N) subject to throttle and tilt limits.
 * Phase "approach": optimal linear-acceleration (E-guidance) to aim point above
 * target. Phase "terminal": vertical-velocity hold with horizontal nulling.
 */
function guidance(s, t, ctx) {
  const { lander, aim, tgo0, g } = ctx;
  const m = s[6];
  let a;
  let phase;
  const tgo = tgo0 - t;
  if (ctx.mode === "ballistic") return { thrust: [0, 0, 0], phase: "coast" };
  if (tgo > 1.5 && !ctx.terminal) {
    phase = "approach";
    a = [0, 1, 2].map(
      (k) => (6 * (aim.r[k] - s[k])) / tgo ** 2 - (4 * s[3 + k]) / tgo - (2 * aim.v[k]) / tgo,
    );
    a[2] += g;
  } else {
    ctx.terminal = true;
    phase = "terminal";
    const target = [0, 0, -ctx.vTerminal];
    const K = 1 / 1.2;
    a = [K * (target[0] - s[3]), K * (target[1] - s[4]), K * (target[2] - s[5]) + g];
  }
  // tilt limit (thrust must point within maxThrustTilt of local vertical)
  const horiz = Math.hypot(a[0], a[1]);
  const maxTilt = (lander.maxThrustTilt * Math.PI) / 180;
  if (a[2] <= 0 || Math.atan2(horiz, a[2]) > maxTilt) {
    const vert = Math.max(a[2], 0.1 * g);
    const h = Math.min(horiz, vert * Math.tan(maxTilt));
    const f = horiz > 0 ? h / horiz : 0;
    a = [a[0] * f, a[1] * f, vert];
  }
  let T = m * Math.hypot(a[0], a[1], a[2]);
  const Tmax = lander.thrustMax,
    Tmin = lander.thrustMax * lander.throttleMin;
  const Tc = Math.min(Tmax, Math.max(Tmin, T));
  const scale = T > 0 ? Tc / T : 0;
  return { thrust: a.map((v) => v * m * scale), phase, saturated: T > Tmax + 1e-6 };
}

/**
 * Run the descent.
 * opts: { grid, col, row, bodyId, lander (plain numbers), start: {altitude, downrange,
 *   approachAzimuth, horizontalSpeed, verticalSpeed}, dt, maxTime, aimAltitude,
 *   minCorridorClearance, mode }
 */
export function simulateDescent(opts) {
  const {
    grid,
    col,
    row,
    bodyId,
    lander,
    start,
    dt = 0.05,
    maxTime = 900,
    aimAltitude = 30,
    minCorridorClearance = 20,
    mode = "guided",
    g: gOverride,
  } = opts;
  const frame = localFrame(grid, col, row, bodyId);
  if (!Number.isFinite(frame.z0)) return { ok: false, errorCode: "nodata", error: "nodata at target pixel", outcome: "nodata" };
  const g = gOverride ?? surfaceGravity(bodyId);
  const az = (start.approachAzimuth * Math.PI) / 180; // direction of travel (towards target)
  const ux = Math.sin(az),
    uy = Math.cos(az);
  const m0 = lander.dryMass + lander.propellant;
  let s = [
    -ux * start.downrange,
    -uy * start.downrange,
    start.altitude,
    ux * start.horizontalSpeed,
    uy * start.horizontalSpeed,
    start.verticalSpeed,
    m0,
  ];
  const vTerminal = Math.min(1.5, 0.6 * lander.maxVerticalTouchdown);
  const dist0 = Math.hypot(s[0], s[1], s[2] - aimAltitude);
  const speed0 = Math.max(5, Math.hypot(s[3], s[4], s[5]));
  const ctx = {
    lander,
    g,
    isp: lander.isp,
    bodyId,
    dragArea: lander.dragArea || 0,
    siteAltitude: 0,
    aim: { r: [0, 0, aimAltitude], v: [0, 0, -vTerminal] },
    tgo0: opts.tgo ?? Math.max(20, (2 * dist0) / speed0),
    vTerminal,
    terminal: false,
    mode,
  };
  const samples = [];
  const record = (t, st, thrust, phase, saturated) => {
    const ter = frame.terrain(st[0], st[1]);
    samples.push({
      t,
      x: st[0], y: st[1], z: st[2],
      vx: st[3], vy: st[4], vz: st[5],
      m: st[6],
      fuel: st[6] - lander.dryMass,
      thrust: Math.hypot(thrust[0], thrust[1], thrust[2]),
      tx: thrust[0], ty: thrust[1], tz: thrust[2],
      phase,
      terrain: ter,
      clearance: Number.isFinite(ter) ? st[2] - ter : null,
      saturated: !!saturated,
    });
  };
  let t = 0;
  let outcome = "timeout";
  let contact = null;
  let leftCoverage = false;
  let saturatedSteps = 0;
  let fuelOut = false;
  const pix = meanSpacing(grid);
  let cmd = guidance(s, 0, ctx);
  record(0, s, cmd.thrust, cmd.phase, cmd.saturated);
  while (t < maxTime) {
    cmd = guidance(s, t, ctx);
    let thrust = s[6] > lander.dryMass + 1e-9 ? cmd.thrust : [0, 0, 0];
    if (cmd.saturated) saturatedSteps++;
    let h = dt;
    const Tm = Math.hypot(...thrust);
    const need = (Tm / (lander.isp * G0)) * h;
    const fuel = s[6] - lander.dryMass;
    if (Tm > 0 && need > fuel) {
      h = fuel > 1e-12 ? (fuel / need) * dt : 0; // burn exactly the remaining fuel
      fuelOut = true;
      if (h === 0) {
        thrust = [0, 0, 0];
        h = dt;
      }
    }
    const next = rk4(s, thrust, h, ctx);
    if (next[6] < lander.dryMass) next[6] = lander.dryMass; // guard round-off
    // Surface crossing check along the step (sub-sampled at ≤ ½ pixel).
    // Cubic Hermite position between step ends (exact for constant acceleration).
    const at = (f) => {
      const f2 = f * f, f3 = f2 * f;
      const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
      return [0, 1, 2].map((k) => h00 * s[k] + h10 * h * s[3 + k] + h01 * next[k] + h11 * h * next[3 + k]);
    };
    const horiz = Math.hypot(next[0] - s[0], next[1] - s[1]);
    const n = Math.max(1, Math.ceil(horiz / (pix / 2)));
    let hit = -1;
    let prevF = 0;
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      const [x, y, z] = at(f);
      const ter = frame.terrain(x, y);
      if (!Number.isFinite(ter)) {
        leftCoverage = true;
        continue;
      }
      if (z - ter <= 0) {
        hit = f;
        break;
      }
      prevF = f;
    }
    if (hit >= 0) {
      // bisection between prevF and hit
      let lo = prevF,
        hi = hit;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2;
        const [x, y, z] = at(mid);
        const ter = frame.terrain(x, y);
        if (Number.isFinite(ter) && z - ter <= 0) hi = mid;
        else lo = mid;
      }
      const st = s.map((v, i) => v + (next[i] - v) * hi);
      const pos = at(hi);
      st[0] = pos[0]; st[1] = pos[1]; st[2] = pos[2];
      t += h * hi;
      record(t, st, thrust, cmd.phase, cmd.saturated);
      contact = { t, state: st };
      outcome = "contact";
      s = st;
      break;
    }
    s = next;
    t += h;
    record(t, s, thrust, cmd.phase, cmd.saturated);
    if (leftCoverage && !Number.isFinite(frame.terrain(s[0], s[1]))) {
      outcome = "left-coverage";
      break;
    }
    if (s[2] > start.altitude * 5 + 5000 && s[5] > 0 && t > 10) {
      outcome = "escaped";
      break;
    }
  }
  return evaluateDescent({ samples, contact, outcome, frame, lander, grid, ctx, saturatedSteps, fuelOut, leftCoverage, minCorridorClearance, bodyId, dt, m0 });
}

function evaluateDescent(r) {
  const { samples, contact, outcome, frame, lander, grid, minCorridorClearance, m0 } = r;
  const last = samples[samples.length - 1];
  const res = {
    ok: true,
    model: DESCENT_MODEL_VERSION,
    dt: r.dt,
    outcome,
    samples,
    frame: { z0: frame.z0, col: frame.col, row: frame.row, gridNorth_rad: frame.gridNorth_rad, pixel_m: frame.pixel_m },
    fuelOut: r.fuelOut,
    saturatedFraction: r.saturatedSteps / Math.max(1, samples.length),
    leftCoverage: r.leftCoverage,
    idealDeltaV: lander.isp * G0 * Math.log(m0 / lander.dryMass),
    usedDeltaV: lander.isp * G0 * Math.log(m0 / last.m),
    propellantUsed: m0 - last.m,
    propellantRemaining: last.m - lander.dryMass,
    thrustToWeight: lander.thrustMax / (m0 * r.ctx.g),
    duration: last.t,
  };
  // corridor clearance: samples farther than 200 m horizontally from target, before contact
  let minClr = Infinity,
    minAt = null;
  for (const s of samples) {
    if (Math.hypot(s.x, s.y) < 200 || s.clearance === null) continue;
    if (s.clearance < minClr) {
      minClr = s.clearance;
      minAt = s;
    }
  }
  res.corridorMinClearance = Number.isFinite(minClr) ? minClr : null;
  res.corridorMinAt = minAt ? { t: minAt.t, x: minAt.x, y: minAt.y } : null;
  res.corridorThreshold = minCorridorClearance;
  if (contact) {
    const [x, y, , vx, vy, vz] = contact.state;
    const p = frame.toPixel(x, y);
    const fp = footprintPlane(grid, p.col, p.row, lander.footprintDiameter / 2);
    const tilt = (Math.atan2(Math.hypot(last.tx, last.ty), Math.max(1e-9, last.tz)) * 180) / Math.PI;
    res.touchdown = {
      t: contact.t,
      x,
      y,
      col: p.col,
      row: p.row,
      miss_m: Math.hypot(x, y),
      vVertical: -vz,
      vHorizontal: Math.hypot(vx, vy),
      thrustTilt_deg: last.thrust > 0 ? tilt : null,
      footprint: fp,
    };
  }
  return res;
}
