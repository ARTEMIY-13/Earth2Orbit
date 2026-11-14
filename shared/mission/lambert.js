// Two-body tools: Stumpff functions, universal-variable Lambert solver
// (Vallado, "Fundamentals of Astrodynamics", Alg. 58, bisection on ψ — single
// revolution) and universal-variable Kepler propagation (Vallado Alg. 8).
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export { dot, norm };

export function stumpff(psi) {
  if (psi > 1e-6) {
    const s = Math.sqrt(psi);
    return [(1 - Math.cos(s)) / psi, (s - Math.sin(s)) / (s * psi)];
  }
  if (psi < -1e-6) {
    const s = Math.sqrt(-psi);
    return [(1 - Math.cosh(s)) / psi, (Math.sinh(s) - s) / (s * -psi)];
  }
  return [1 / 2 - psi / 24, 1 / 6 - psi / 120];
}

/**
 * Lambert: r1, r2 (m), tof (s), mu. prograde: motion with +z angular momentum.
 * Returns { v1, v2, iterations } or null if no single-rev solution converged.
 */
export function lambert(r1, r2, tof, mu, prograde = true) {
  const R1 = norm(r1),
    R2 = norm(r2);
  const cosdn = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)));
  const cz = cross(r1, r2)[2];
  let tm = prograde ? (cz >= 0 ? 1 : -1) : cz >= 0 ? -1 : 1;
  const A = tm * Math.sqrt(R1 * R2 * (1 + cosdn));
  if (Math.abs(A) < 1e-9) return null; // 180° transfer: plane undefined
  let psi = 0,
    lo = -4 * Math.PI ** 2,
    hi = 4 * Math.PI ** 2;
  let [c2, c3] = stumpff(psi);
  let y = 0;
  let it = 0;
  const sqmu = Math.sqrt(mu);
  for (; it < 400; it++) {
    y = R1 + R2 + (A * (psi * c3 - 1)) / Math.sqrt(c2);
    if (A > 0 && y < 0) {
      // raise lower bound until y > 0
      lo = psi;
      psi = (psi + hi) / 2;
      [c2, c3] = stumpff(psi);
      continue;
    }
    const chi = Math.sqrt(y / c2);
    const dt = (chi ** 3 * c3 + A * Math.sqrt(y)) / sqmu;
    if (Math.abs(dt - tof) < 1e-10 * Math.max(1, tof)) break;
    if (dt <= tof) lo = psi;
    else hi = psi;
    psi = (lo + hi) / 2;
    [c2, c3] = stumpff(psi);
    if (hi - lo < 1e-12) break;
  }
  if (it >= 400 || !(y > 0)) return null;
  const f = 1 - y / R1,
    gdot = 1 - y / R2,
    g = A * Math.sqrt(y / mu);
  const v1 = r2.map((x, i) => (x - f * r1[i]) / g);
  const v2 = r2.map((x, i) => (gdot * x - r1[i]) / g);
  if (!v1.every(Number.isFinite)) return null;
  return { v1, v2, iterations: it };
}

/** Universal-variable Kepler propagation of (r0, v0) by dt seconds. */
export function propagate(r0, v0, dt, mu) {
  const R0 = norm(r0),
    V0 = norm(v0);
  const sqmu = Math.sqrt(mu);
  const rv = dot(r0, v0);
  const alpha = 2 / R0 - (V0 * V0) / mu;
  let chi;
  if (alpha > 1e-12) chi = sqmu * dt * alpha;
  else if (alpha < -1e-12) {
    const a = 1 / alpha;
    chi =
      Math.sign(dt) * Math.sqrt(-a) *
      Math.log((-2 * mu * alpha * dt) / (rv + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - R0 * alpha)));
  } else chi = (sqmu * dt) / R0;
  let r = R0,
    c2 = 0.5,
    c3 = 1 / 6,
    psi = 0;
  for (let i = 0; i < 100; i++) {
    psi = chi * chi * alpha;
    [c2, c3] = stumpff(psi);
    r = chi * chi * c2 + (rv / sqmu) * chi * (1 - psi * c3) + R0 * (1 - psi * c2);
    const dchi = (sqmu * dt - chi ** 3 * c3 - (rv / sqmu) * chi * chi * c2 - R0 * chi * (1 - psi * c3)) / r;
    chi += dchi;
    if (Math.abs(dchi) < 1e-9) break;
  }
  const f = 1 - (chi * chi * c2) / R0;
  const g = dt - (chi ** 3 * c3) / sqmu;
  const gdot = 1 - (chi * chi * c2) / r;
  const fdot = (sqmu / (r * R0)) * chi * (psi * c3 - 1);
  return {
    r: r0.map((x, i) => f * x + g * v0[i]),
    v: r0.map((x, i) => fdot * x + gdot * v0[i]),
  };
}
