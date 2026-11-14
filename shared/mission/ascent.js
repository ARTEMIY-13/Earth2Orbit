// Educational Earth ascent-to-LEO model (replaces the former Δv-budget assumption).
// Planar point mass in an inertial frame centred on Earth; due-east launch,
// so the launch-site rotation velocity ωR·cosφ is the initial horizontal speed and
// the atmosphere co-rotates in-plane. Two stages, pressure-dependent Isp for
// stage 1, exponential atmosphere, drag with Cd·A.
// Guidance: vertical rise → pitch-over by a kick angle → gravity turn (stage 1)
// → linear pitch-down to horizontal (stage 2) until apoapsis reaches the target →
// coast to apoapsis → horizontal circularisation burn.
// The kick angle is searched (grid) to maximise the propellant left.
// NOT modelled: 3-D dogleg/plane change, throttling for max-Q, fairing jettison,
// winds, engine-out, real guidance (PEG), launch-window timing within the day.
import { BODIES, G0 } from "./bodies.js";

export const ASCENT_MODEL_VERSION = "ascent-1.0 (planar 2-stage gravity turn, exponential atmosphere)";

function simulate(launcher, payload, opts, kick_deg, record, pitchFrac = 0.8) {
  const E = BODIES.earth;
  const mu = E.GM,
    R = E.radius;
  const H = 8500,
    rho0 = 1.225;
  const wEff = E.rotationRate * Math.cos((opts.latitude_deg * Math.PI) / 180);
  const target = R + opts.targetAltitude;
  const dt = opts.dt ?? 0.1;
  const [s1, s2] = launcher.stages;
  let x = 0,
    y = R,
    vx = wEff * R,
    vy = 0,
    t = 0;
  let stage = 0;
  let prop = [s1.propellant, s2.propellant];
  const massNow = () => payload + s2.dryMass + prop[1] + (stage === 0 ? s1.dryMass + prop[0] : 0);
  let gravityLoss = 0,
    dragLoss = 0,
    steeringLoss = 0,
    maxQ = 0,
    maxAcc = 0;
  let phase = "vertical";
  let cutoff = false;
  let coastStart = null;
  let s2Start = null;
  let kickStart = 0;
  const samples = [];
  const kick = (kick_deg * Math.PI) / 180;
  for (let it = 0; it < 200000; it++) {
    const r = Math.hypot(x, y);
    const h = r - R;
    if (h < -1) return { ok: false, reason: "crash", t, h, phase, stage, samples };
    const ur = [x / r, y / r],
      ut = [y / r, -x / r]; // radial, eastward tangential (clockwise)
    // air-relative velocity
    const vax = vx - wEff * y,
      vay = vy + wEff * x;
    const va = Math.hypot(vax, vay);
    const rho = h < 150000 ? rho0 * Math.exp(-h / H) : 0;
    const q = 0.5 * rho * va * va;
    maxQ = Math.max(maxQ, q);
    const st = stage === 0 ? s1 : s2;
    const vr = vx * ur[0] + vy * ur[1],
      vt = vx * ut[0] + vy * ut[1];
    const vmag = Math.hypot(vx, vy);
    const gamma = Math.atan2(vr, vt);
    // orbital elements (energy, h)
    const eps = (vmag * vmag) / 2 - mu / r;
    const hAng = r * vt;
    const a = -mu / (2 * eps);
    const ecc = Math.sqrt(Math.max(0, 1 + (2 * eps * hAng * hAng) / (mu * mu)));
    const ra = a * (1 + ecc),
      rp = a * (1 - ecc);
    let thrustOn = !cutoff && prop[stage] > 0;
    let dir = ur;
    if (phase === "vertical" && va > 50) {
      phase = "kick";
      kickStart = t;
    }
    if (phase === "kick" && t - kickStart > 10) phase = "gravity-turn";
    if (phase === "kick") dir = [ur[0] * Math.cos(kick) + ut[0] * Math.sin(kick), ur[1] * Math.cos(kick) + ut[1] * Math.sin(kick)];
    else if (phase === "gravity-turn") dir = va > 1 ? [vax / va, vay / va] : ur;
    else if (phase === "stage2") {
      const tb = (s2.propellant * s2.ispVac * G0) / s2.thrustVac;
      const f = Math.min(1, (t - s2Start.t) / (pitchFrac * tb));
      const pitch = s2Start.gamma * (1 - f);
      dir = [ur[0] * Math.sin(pitch) + ut[0] * Math.cos(pitch), ur[1] * Math.sin(pitch) + ut[1] * Math.cos(pitch)];
      if (ra >= target && !cutoff) {
        cutoff = true;
        thrustOn = false;
        phase = "coast";
        coastStart = t;
      }
    } else if (phase === "coast") {
      thrustOn = false;
      if (vr <= 0 && t - coastStart > 5) phase = "circularise";
    } else if (phase === "circularise") {
      dir = ut;
      thrustOn = prop[1] > 0;
      const vc = Math.sqrt(mu / r);
      if (vt >= vc || rp >= target - 2000) {
        const okOrbit = rp >= target - 20000;
        return finish({ ok: okOrbit, reason: okOrbit ? "orbit" : "low-perigee", r, rp, ra, t });
      }
    }
    if (phase === "circularise") cutoff = false;
    if (phase === "circularise" && prop[1] <= 0) return finish({ ok: false, reason: "propellant-out", r, rp, ra, t });
    const m = massNow();
    let T = 0,
      mdot = 0;
    if (thrustOn && (phase !== "coast")) {
      const pRatio = h < 150000 ? Math.exp(-h / H) : 0;
      const isp = st.ispVac - (st.ispVac - (st.ispSl ?? st.ispVac)) * pRatio;
      mdot = st.thrustVac / (st.ispVac * G0);
      T = mdot * isp * G0;
    }
    const D = q * st.cdA * (stage === 0 ? 1 : 0.5);
    const g = mu / (r * r);
    const ax = (T * dir[0] - (va > 0 ? (D * vax) / va : 0)) / m - (g * x) / r;
    const ay = (T * dir[1] - (va > 0 ? (D * vay) / va : 0)) / m - (g * y) / r;
    maxAcc = Math.max(maxAcc, T / m / G0);
    if (T > 0) {
      gravityLoss += g * Math.sin(gamma) * dt;
      dragLoss += (D / m) * dt;
      const cosA = vmag > 0 ? (dir[0] * vx + dir[1] * vy) / vmag : 1;
      steeringLoss += (T / m) * (1 - cosA) * dt;
    }
    if (record && it % 20 === 0) samples.push({ t, h, v: vmag, gamma_deg: (gamma * 180) / Math.PI, q, stage: stage + 1, phase, m });
    // semi-implicit Euler is enough for a budget model; dt fixed
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;
    if (mdot > 0) prop[stage] = Math.max(0, prop[stage] - mdot * dt);
    t += dt * (phase === "coast" ? 1 : 1);
    if (stage === 0 && prop[0] <= 0) {
      stage = 1;
      phase = "stage2";
      s2Start = { t, gamma };
    }
    if (phase === "coast" && dt < 1) {
      // coast is ballistic: larger step is fine above the atmosphere
    }
  }
  return { ok: false, reason: "timeout", t, samples };

  function finish(res) {
    const idealDv = launcher.stages.reduce((acc, s, i) => {
      const above = payload + (i === 0 ? s2.dryMass + s2.propellant : 0);
      const used = i === 0 ? s1.propellant : s2.propellant - prop[1];
      return acc + s.ispVac * G0 * Math.log((above + s.dryMass + (i === 0 ? s.propellant : s2.propellant)) / (above + s.dryMass + (i === 0 ? s.propellant : s2.propellant) - used));
    }, 0);
    return {
      ...res,
      kick_deg,
      pitchFrac,
      perigeeAlt: res.rp - R,
      apogeeAlt: res.ra - R,
      propellantLeft: prop[1],
      propellantLeftFraction: prop[1] / s2.propellant,
      gravityLoss,
      dragLoss,
      steeringLoss,
      rotationBonus: wEff * R,
      maxQ,
      maxAccel_g: maxAcc,
      idealDvUsed: idealDv,
      samples,
    };
  }
}

/**
 * Searches the pitch-kick angle and returns the best successful ascent (or the
 * reason why none reached orbit). payload = mass above the launcher (kg).
 */
export function simulateAscent({ launcher, payload, latitude_deg, targetAltitude, dt = 0.1 }) {
  const opts = { latitude_deg, targetAltitude, dt };
  let best = null;
  const reasons = {};
  for (let k = 0.5; k <= 12; k += 0.25)
    for (const pf of [0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.4]) {
      const r = simulate(launcher, payload, opts, k, false, pf);
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      if (r.ok && (!best || r.propellantLeft > best.propellantLeft)) best = r;
    }
  if (!best) return { ok: false, model: ASCENT_MODEL_VERSION, reasons, payload };
  const rec = simulate(launcher, payload, opts, best.kick_deg, true, best.pitchFrac);
  return { ...rec, model: ASCENT_MODEL_VERSION, payload, reasons };
}

/** Largest payload that still reaches orbit (bisection), for information. */
export function ascentCapacity({ launcher, latitude_deg, targetAltitude }) {
  let lo = 0,
    hi = 300000;
  if (!simulateAscent({ launcher, payload: lo, latitude_deg, targetAltitude, dt: 0.2 }).ok) return 0;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (simulateAscent({ launcher, payload: mid, latitude_deg, targetAltitude, dt: 0.2 }).ok) lo = mid;
    else hi = mid;
  }
  return lo;
}
export { simulate as _simulateOnce };
