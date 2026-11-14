// Terrain analysis on a DEM grid. Pure functions, SI units (metres, degrees only
// for reported angles). Shared by the browser worker, the Node API and tests.
//
// Grid shape: { width, height, data: Float32Array (row-major, NaN = nodata),
//               georef, meta? }
import { groundSpacing, pixelToLatLon, latLonToPixel } from "./georef.js";

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

export const TERRAIN_MODEL_VERSION = "terrain-1.0";

export function makeGrid(width, height, data, georef, meta = {}) {
  if (data.length !== width * height) throw new Error("DEM size mismatch");
  return { width, height, data, georef, meta };
}

/** Per-pixel ground spacing arrays (m). Cached on the grid object. */
export function spacing(grid) {
  if (grid._spacing) return grid._spacing;
  const { width, height, georef } = grid;
  const dx = new Float32Array(width * height),
    dy = new Float32Array(width * height);
  const perRow = georef.type !== "polar-stereographic";
  for (let r = 0; r < height; r++) {
    let row = perRow ? groundSpacing(georef, width / 2, r) : null;
    for (let c = 0; c < width; c++) {
      const s = row || groundSpacing(georef, c, r);
      dx[r * width + c] = s.dx;
      dy[r * width + c] = s.dy;
    }
  }
  grid._spacing = { dx, dy };
  return grid._spacing;
}

export function meanSpacing(grid) {
  const { dx, dy } = spacing(grid);
  let s = 0;
  for (let i = 0; i < dx.length; i++) s += Math.sqrt(dx[i] * dy[i]);
  return s / dx.length;
}

/**
 * Angle (rad) of geographic north measured clockwise from grid "up" (−row).
 * 0 for north-up grids; varies for polar stereographic grids.
 */
export function gridNorthAngle(georef, col, row) {
  if (georef.type !== "polar-stereographic") return 0;
  const { lat, lon } = pixelToLatLon(georef, col, row);
  const eps = Math.abs(lat) > 89.999 ? -1e-4 * Math.sign(lat) : 1e-4;
  const p = latLonToPixel(georef, lat + eps, lon);
  const dc = p.col - col,
    dr = p.row - row; // direction of increasing latitude
  const sgn = eps > 0 ? 1 : -1;
  return Math.atan2(dc * sgn, -dr * sgn);
}

/**
 * Horn (1981) 3×3 slope & aspect with metric spacing.
 * slope = atan(sqrt((dz/dx)^2 + (dz/dy)^2)); aspect = azimuth of steepest
 * DESCENT, clockwise from geographic north, degrees [0, 360).
 * Any NaN in the 3×3 window → NaN (no silent interpolation). Edge pixels → NaN.
 */
export function slopeAspect(grid) {
  if (grid._slope) return grid._slope;
  const { width: w, height: h, data, georef } = grid;
  const { dx, dy } = spacing(grid);
  const slope = new Float32Array(w * h).fill(NaN);
  const aspect = new Float32Array(w * h).fill(NaN);
  const polar = georef.type === "polar-stereographic";
  for (let r = 1; r < h - 1; r++)
    for (let c = 1; c < w - 1; c++) {
      const i = r * w + c;
      const a = data[i - w - 1], b = data[i - w], cc = data[i - w + 1];
      const d = data[i - 1], f = data[i + 1];
      const g = data[i + w - 1], hh = data[i + w], k = data[i + w + 1];
      if (!(a === a && b === b && cc === cc && d === d && f === f && g === g && hh === hh && k === k && data[i] === data[i]))
        continue;
      // dz/dx positive towards +col (grid east), dz/dy positive towards −row (grid up)
      const dzdx = (cc + 2 * f + k - (a + 2 * d + g)) / (8 * dx[i]);
      const dzdy = (a + 2 * b + cc - (g + 2 * hh + k)) / (8 * dy[i]);
      slope[i] = Math.atan(Math.hypot(dzdx, dzdy)) * R2D;
      if (dzdx === 0 && dzdy === 0) {
        aspect[i] = NaN; // flat: aspect undefined
        continue;
      }
      // descent direction in grid frame, azimuth clockwise from grid up
      let az = Math.atan2(-dzdx, -dzdy);
      if (polar) az -= gridNorthAngle(georef, c, r);
      aspect[i] = ((az * R2D) % 360 + 360) % 360;
    }
  grid._slope = { slope, aspect };
  return grid._slope;
}

/**
 * Roughness = RMS of residuals from a least-squares plane fitted in a
 * (2k+1)×(2k+1) window (metres). Window side in metres is reported by
 * roughnessWindow(). Requires a fully valid window, otherwise NaN.
 */
export function roughness(grid, k = 2) {
  const key = "_rough" + k;
  if (grid[key]) return grid[key];
  const { width: w, height: h, data } = grid;
  const { dx, dy } = spacing(grid);
  const out = new Float32Array(w * h).fill(NaN);
  const n = (2 * k + 1) ** 2;
  for (let r = k; r < h - k; r++)
    for (let c = k; c < w - k; c++) {
      const i0 = r * w + c;
      const sx = dx[i0],
        sy = dy[i0];
      let sz = 0,
        sxz = 0,
        syz = 0,
        sxx = 0,
        syy = 0,
        ok = true;
      for (let v = -k; v <= k && ok; v++)
        for (let u = -k; u <= k; u++) {
          const z = data[i0 + v * w + u];
          if (z !== z) {
            ok = false;
            break;
          }
          const x = u * sx,
            y = v * sy;
          sz += z;
          sxz += x * z;
          syz += y * z;
          sxx += x * x;
          syy += y * y;
        }
      if (!ok) continue;
      const mz = sz / n,
        bx = sxz / sxx,
        by = syz / syy;
      let ss = 0;
      for (let v = -k; v <= k; v++)
        for (let u = -k; u <= k; u++) {
          const res = data[i0 + v * w + u] - (mz + bx * u * sx + by * v * sy);
          ss += res * res;
        }
      out[i0] = Math.sqrt(ss / n);
    }
  grid[key] = out;
  return out;
}

export function roughnessWindow(grid, k = 2) {
  return { pixels: 2 * k + 1, metres: (2 * k + 1) * meanSpacing(grid), metric: "RMS residual from least-squares plane" };
}

/** Bilinear elevation; returns { z, interpolated } or { z: NaN } if any corner is nodata. */
export function sample(grid, col, row) {
  const { width: w, height: h, data } = grid;
  if (col < 0 || row < 0 || col > w - 1 || row > h - 1) return { z: NaN, outside: true };
  const c0 = Math.min(w - 2, Math.floor(col)),
    r0 = Math.min(h - 2, Math.floor(row));
  const fc = col - c0,
    fr = row - r0;
  const i = r0 * w + c0;
  const z00 = data[i], z10 = data[i + 1], z01 = data[i + w], z11 = data[i + w + 1];
  if (!(z00 === z00 && z10 === z10 && z01 === z01 && z11 === z11)) return { z: NaN, gap: true };
  const z = z00 * (1 - fc) * (1 - fr) + z10 * fc * (1 - fr) + z01 * (1 - fc) * fr + z11 * fc * fr;
  return { z, interpolated: fc > 1e-9 || fr > 1e-9 };
}

/** Convert a local metric offset (east, north) from a pixel into a pixel position. */
export function offsetToPixel(grid, col, row, east_m, north_m) {
  const { dx, dy } = spacing(grid);
  const i = Math.round(row) * grid.width + Math.round(col);
  const th = gridNorthAngle(grid.georef, col, row);
  // rotate geographic (east,north) into grid (right, up)
  const right = east_m * Math.cos(th) + north_m * Math.sin(th);
  const up = -east_m * Math.sin(th) + north_m * Math.cos(th);
  return { col: col + right / dx[i], row: row - up / dy[i] };
}

/**
 * Elevation profile along a polyline of pixel vertices [{col,row}, …].
 * Samples every `step_m` metres (default ½ pixel). X = distance (m),
 * Y = elevation (m, dataset datum). Gaps (nodata) are null, never filled.
 */
export function profile(grid, vertices, step_m) {
  const { dx, dy } = spacing(grid);
  const px = meanSpacing(grid);
  const step = step_m || px / 2;
  const points = [];
  let dist = 0;
  for (let s = 0; s < vertices.length - 1; s++) {
    const a = vertices[s],
      b = vertices[s + 1];
    const i = Math.round(Math.min(grid.height - 1, Math.max(0, (a.row + b.row) / 2))) * grid.width +
      Math.round(Math.min(grid.width - 1, Math.max(0, (a.col + b.col) / 2)));
    const len = Math.hypot((b.col - a.col) * dx[i], (b.row - a.row) * dy[i]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = s === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const col = a.col + (b.col - a.col) * t,
        row = a.row + (b.row - a.row) * t;
      const sm = sample(grid, col, row);
      const ll = pixelToLatLon(grid.georef, col, row);
      points.push({ d: dist + len * t, z: Number.isFinite(sm.z) ? sm.z : null, col, row, lat: ll.lat, lon: ll.lon, outside: !!sm.outside });
    }
    dist += len;
  }
  let min = null,
    max = null,
    gaps = 0,
    maxGrade = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (p.z === null) {
      gaps++;
      continue;
    }
    if (min === null || p.z < min.z) min = p;
    if (max === null || p.z > max.z) max = p;
    const q = points[k - 1];
    if (q && q.z !== null && p.d > q.d) {
      p.grade = (Math.atan((p.z - q.z) / (p.d - q.d)) * R2D);
      maxGrade = Math.max(maxGrade, Math.abs(p.grade));
    }
  }
  return {
    points,
    length_m: dist,
    step_m: step,
    min,
    max,
    gaps,
    gapFraction: points.length ? gaps / points.length : 1,
    maxGrade_deg: maxGrade,
    interpolation: "bilinear between pixel centres (grade is at sample spacing; not a measurement at finer scale)",
  };
}

/** Straight profile through a pixel along an azimuth (deg from north), length total_m. */
export function lineThrough(grid, col, row, azimuth_deg, total_m) {
  const half = total_m / 2;
  const e = Math.sin(azimuth_deg * D2R),
    n = Math.cos(azimuth_deg * D2R);
  return [offsetToPixel(grid, col, row, -e * half, -n * half), offsetToPixel(grid, col, row, e * half, n * half)];
}

/** Pixels within radius_m of a centre (for footprints / landing ellipses). */
export function pixelsInEllipse(grid, col, row, a_m, b_m = a_m, azimuth_deg = 0) {
  const { dx, dy } = spacing(grid);
  const i0 = Math.round(row) * grid.width + Math.round(col);
  const th = gridNorthAngle(grid.georef, col, row);
  const reach = Math.ceil(Math.max(a_m, b_m) / Math.min(dx[i0], dy[i0])) + 1;
  const az = azimuth_deg * D2R;
  const out = [];
  for (let r = Math.max(0, Math.floor(row - reach)); r <= Math.min(grid.height - 1, Math.ceil(row + reach)); r++)
    for (let c = Math.max(0, Math.floor(col - reach)); c <= Math.min(grid.width - 1, Math.ceil(col + reach)); c++) {
      const right = (c - col) * dx[i0],
        up = (row - r) * dy[i0];
      // grid → geographic
      const east = right * Math.cos(th) - up * Math.sin(th);
      const north = right * Math.sin(th) + up * Math.cos(th);
      // geographic → ellipse axes (major axis along azimuth)
      const along = east * Math.sin(az) + north * Math.cos(az);
      const across = east * Math.cos(az) - north * Math.sin(az);
      if ((along / a_m) ** 2 + (across / b_m) ** 2 <= 1) out.push(r * grid.width + c);
    }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/** Statistics over a set of pixel indices. */
export function regionStats(grid, indices, k = 2) {
  const { slope, aspect } = slopeAspect(grid);
  const rough = roughness(grid, k);
  const z = [],
    s = [],
    ro = [];
  let nodata = 0,
    sinA = 0,
    cosA = 0;
  for (const i of indices) {
    const v = grid.data[i];
    if (v !== v) {
      nodata++;
      continue;
    }
    z.push(v);
    if (slope[i] === slope[i]) s.push(slope[i]);
    if (rough[i] === rough[i]) ro.push(rough[i]);
    if (aspect[i] === aspect[i]) {
      sinA += Math.sin(aspect[i] * D2R);
      cosA += Math.cos(aspect[i] * D2R);
    }
  }
  z.sort((a, b) => a - b);
  s.sort((a, b) => a - b);
  ro.sort((a, b) => a - b);
  const mean = z.reduce((a, b) => a + b, 0) / (z.length || 1);
  return {
    count: indices.length,
    valid: z.length,
    nodataFraction: indices.length ? nodata / indices.length : 1,
    min: z[0] ?? NaN,
    max: z[z.length - 1] ?? NaN,
    mean: z.length ? mean : NaN,
    relief: z.length ? z[z.length - 1] - z[0] : NaN,
    slopeMean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN,
    slopeP50: percentile(s, 50),
    slopeP95: percentile(s, 95),
    slopeMax: s[s.length - 1] ?? NaN,
    slopeCount: s.length,
    aspectMean: sinA || cosA ? ((Math.atan2(sinA, cosA) * R2D) % 360 + 360) % 360 : NaN,
    roughnessP50: percentile(ro, 50),
    roughnessP95: percentile(ro, 95),
  };
}

/**
 * Plane fit over a footprint (metres): returns slope across the footprint and
 * max |residual| (proxy for height difference under legs at DEM scale).
 */
export function footprintPlane(grid, col, row, radius_m) {
  const { dx, dy } = spacing(grid);
  const i0 = Math.round(row) * grid.width + Math.round(col);
  let idx = pixelsInEllipse(grid, col, row, radius_m);
  let baseline_m = 2 * radius_m;
  let enlarged = false;
  if (idx.length < 9) {
    // footprint smaller than 3×3 pixels → use minimum resolvable 3×3 window
    const r3 = 1.5 * Math.max(dx[i0], dy[i0]);
    idx = pixelsInEllipse(grid, col, row, r3);
    baseline_m = 2 * r3;
    enlarged = true;
  }
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  const pts = [];
  for (const i of idx) {
    const z = grid.data[i];
    if (z !== z) return { valid: false, reason: "nodata in footprint", count: idx.length };
    const c = i % grid.width,
      r = (i - c) / grid.width;
    const x = (c - col) * dx[i0],
      y = (row - r) * dy[i0];
    pts.push([x, y, z]);
    n++; sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
  }
  // Solve normal equations for z = a + b x + c y
  const mx = sx / n, my = sy / n, mz = sz / n;
  const Cxx = sxx / n - mx * mx, Cyy = syy / n - my * my, Cxy = sxy / n - mx * my;
  const Cxz = sxz / n - mx * mz, Cyz = syz / n - my * mz;
  const det = Cxx * Cyy - Cxy * Cxy;
  const b = det ? (Cxz * Cyy - Cyz * Cxy) / det : 0;
  const c = det ? (Cyz * Cxx - Cxz * Cxy) / det : 0;
  let maxRes = 0;
  for (const [x, y, z] of pts) maxRes = Math.max(maxRes, Math.abs(z - (mz + b * (x - mx) + c * (y - my))));
  return {
    valid: true,
    slope_deg: Math.atan(Math.hypot(b, c)) * R2D,
    maxResidual_m: maxRes,
    count: n,
    baseline_m,
    enlarged,
    pixel_m: Math.max(dx[i0], dy[i0]),
  };
}

/** Block-average resampling by an integer factor; block → NaN if < minValid valid. */
export function resample(grid, factor, minValid = 0.75) {
  if (factor <= 1) return grid;
  const w = Math.floor(grid.width / factor),
    h = Math.floor(grid.height / factor);
  const data = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0,
        n = 0;
      for (let v = 0; v < factor; v++)
        for (let u = 0; u < factor; u++) {
          const z = grid.data[(r * factor + v) * grid.width + c * factor + u];
          if (z === z) {
            s += z;
            n++;
          }
        }
      data[r * w + c] = n >= minValid * factor * factor ? s / n : NaN;
    }
  const g = grid.georef;
  let georef;
  const off = (factor - 1) / 2;
  if (g.type === "polar-stereographic")
    georef = { ...g, scale_m: g.scale_m * factor, N: g.N / factor, I0: (g.I0 - 0.5 + off) / factor + 0.5, J0: (g.J0 - 0.5 + off) / factor + 0.5 };
  else if (g.type === "simple-cylindrical")
    georef = { ...g, ppd: g.ppd / factor, lat0: g.lat0 - off / g.ppd, lon0: g.lon0 + off / g.ppd };
  else if (g.type === "web-mercator")
    georef = { ...g, zoom: g.zoom, tileSize: g.tileSize / factor, px0: (g.px0 + off) / factor, py0: (g.py0 + off) / factor };
  else georef = { ...g, spacing_m: g.spacing_m * factor };
  return makeGrid(w, h, data, georef, { ...grid.meta, resampledFrom: grid.meta?.id, factor });
}

/** Slope histogram (fractions) on fixed bins. */
export const SLOPE_BINS = [0, 2, 5, 8, 10, 15, 20, 30, 45, 90];
export function slopeHistogram(grid) {
  const { slope } = slopeAspect(grid);
  const counts = new Array(SLOPE_BINS.length - 1).fill(0);
  let n = 0;
  for (const s of slope) {
    if (s !== s) continue;
    n++;
    for (let b = 0; b < counts.length; b++)
      if (s < SLOPE_BINS[b + 1] || b === counts.length - 1) {
        counts[b]++;
        break;
      }
  }
  return { bins: SLOPE_BINS, fractions: counts.map((c) => (n ? c / n : 0)), n };
}

/** Marching-squares contour segments (pixel coords) at a given level. */
export function contourSegments(grid, level) {
  const { width: w, height: h, data } = grid;
  const segs = [];
  const interp = (z1, z2) => (level - z1) / (z2 - z1);
  for (let r = 0; r < h - 1; r++)
    for (let c = 0; c < w - 1; c++) {
      const i = r * w + c;
      const a = data[i], b = data[i + 1], d = data[i + w], e = data[i + w + 1];
      if (!(a === a && b === b && d === d && e === e)) continue;
      const pts = [];
      if ((a < level) !== (b < level)) pts.push([c + interp(a, b), r]);
      if ((b < level) !== (e < level)) pts.push([c + 1, r + interp(b, e)]);
      if ((d < level) !== (e < level)) pts.push([c + interp(d, e), r + 1]);
      if ((a < level) !== (d < level)) pts.push([c, r + interp(a, d)]);
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
    }
  return segs;
}
