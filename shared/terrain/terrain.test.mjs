import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeGrid, slopeAspect, profile, regionStats, pixelsInEllipse, footprintPlane, resample, meanSpacing, lineThrough, roughness } from "./analysis.js";
import { pixelToLatLon, latLonToPixel, groundSpacing, wrapLon } from "./georef.js";
import { compareTerrain } from "./analogs.js";
import { terrainCard } from "../mission/assessment.js";
import { values, presetById } from "../mission/vehicles.js";

// --- Synthetic grids (TEST ONLY — clearly separated from real data) ---------
function synthetic(n, spacing, fn, georef) {
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = fn(c * spacing, (n - 1 - r) * spacing, c, r);
  return makeGrid(n, n, data, georef || { type: "local-metric", spacing_m: spacing, lat0: 0, lon0: 0 }, { id: "synthetic", synthetic: true });
}
const lander = values(presetById("edu-robotic").lander);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b}±${tol}, got ${a}`);

test("flat DEM gives zero slope everywhere it is defined", () => {
  const g = synthetic(32, 5, () => 100);
  const { slope } = slopeAspect(g);
  const vals = Array.from(slope).filter((v) => v === v);
  assert.equal(vals.length, 30 * 30);
  assert.ok(vals.every((v) => v === 0));
});

test("analytic inclined plane: slope 10°, aspect west for eastward rise", () => {
  const tan = Math.tan((10 * Math.PI) / 180);
  const g = synthetic(40, 2, (x) => x * tan);
  const { slope, aspect } = slopeAspect(g);
  const i = 20 * 40 + 20;
  near(slope[i], 10, 1e-4, "slope");
  near(aspect[i], 270, 1e-3, "aspect (downslope direction)");
});

test("profile along plane: length, endpoints and grade", () => {
  const tan = Math.tan((5 * Math.PI) / 180);
  const g = synthetic(50, 10, (x) => x * tan);
  const p = profile(g, [{ col: 5, row: 25 }, { col: 45, row: 25 }], 5);
  near(p.length_m, 400, 1e-6, "length");
  near(p.max.z - p.min.z, 400 * tan, 1e-3, "relief");
  near(p.maxGrade_deg, 5, 1e-3, "grade");
  assert.equal(p.gaps, 0);
});

test("derivatives use metres, not degrees, on a cylindrical lunar grid", () => {
  const ppd = 1024;
  const georef = { type: "simple-cylindrical", radius_m: 1737400, ppd, lat0: 60, lon0: 10 };
  const s = groundSpacing(georef, 0, 0);
  near(s.dy, 29.6126, 1e-3, "dy (m)");
  near(s.dx, s.dy * 0.5, 1e-3, "dx shrinks with cos(lat)");
  // z rises 1 m per pixel eastward → slope atan(1/dx), NOT atan(1/dy)
  const n = 9;
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = c;
  const g = makeGrid(n, n, data, georef);
  const { slope } = slopeAspect(g);
  const dxRow = groundSpacing(georef, 4, 4).dx;
  near(slope[4 * n + 4], (Math.atan(1 / dxRow) * 180) / Math.PI, 1e-3);
});

test("nodata is never silently interpolated", () => {
  const g = synthetic(20, 5, () => 0);
  g.data[10 * 20 + 10] = NaN;
  const { slope } = slopeAspect(g);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) assert.ok(Number.isNaN(slope[(10 + dr) * 20 + 10 + dc]));
  const p = profile(g, [{ col: 2, row: 10 }, { col: 18, row: 10 }], 1);
  assert.ok(p.gaps > 0);
  const card = terrainCard(g, { col: 10, row: 10 }, lander, { a_m: 20, b_m: 20, azimuth_deg: 0 });
  assert.notEqual(card.status, "pass");
  assert.equal(card.criteria.find((c) => c.id === "coverage").status, "insufficient");
});

test("polar stereographic pixel ↔ lat/lon round trip and scale", () => {
  const georef = { type: "polar-stereographic", radius_m: 1737400, scale_m: 20, N: 7584, I0: 1, J0: 1, pole: -1 };
  for (const [lat, lon] of [[-89.5, 45], [-88, -120], [-87.6, 179]]) {
    const p = latLonToPixel(georef, lat, lon);
    const q = pixelToLatLon(georef, p.col, p.row);
    near(q.lat, lat, 1e-9);
    near(Math.abs(wrapLon(q.lon - lon)), 0, 1e-7);
  }
  // lon 0 points towards smaller line index (up) at the south pole (PDS convention)
  assert.ok(latLonToPixel(georef, -89, 0).row < latLonToPixel(georef, -90, 0).row);
  near(groundSpacing(georef, 3791, 3791).dx, 20, 0.01);
});

test("longitude wrap across the antimeridian", () => {
  const georef = { type: "simple-cylindrical", radius_m: 3396000, ppd: 128, lat0: 0, lon0: 179.9 };
  const ll = pixelToLatLon(georef, 64, 0);
  assert.ok(ll.lon < 0 && ll.lon > -180);
  near(latLonToPixel(georef, 0, ll.lon).col, 64, 1e-6);
});

test("insufficient resolution never yields a positive terrain verdict", () => {
  const g = synthetic(40, 500, () => 0);
  const card = terrainCard(g, { col: 20, row: 20 }, lander, { a_m: 5000, b_m: 3000, azimuth_deg: 0 });
  assert.equal(card.criteria.find((c) => c.id === "resolution").status, "insufficient");
  assert.equal(card.status, "insufficient");
});

test("known steep site is rejected for the preset", () => {
  const tan = Math.tan((20 * Math.PI) / 180);
  const g = synthetic(60, 1, (x, y) => y * tan);
  const card = terrainCard(g, { col: 30, row: 30 }, lander, { a_m: 15, b_m: 10, azimuth_deg: 0 });
  assert.equal(card.criteria.find((c) => c.id === "footprint-slope").status, "fail");
  assert.equal(card.status, "fail");
});

test("footprint plane fit and ellipse pixel selection", () => {
  const g = synthetic(30, 1, () => 5);
  const fp = footprintPlane(g, 15, 15, 3);
  assert.ok(fp.valid && fp.slope_deg < 1e-9 && fp.maxResidual_m < 1e-9);
  const n1 = pixelsInEllipse(g, 15, 15, 5, 5).length;
  near(n1, Math.PI * 25, 10, "circle area in px");
  const along = pixelsInEllipse(g, 15, 15, 8, 2, 90); // major axis east-west
  const cols = along.map((i) => i % 30);
  assert.ok(Math.max(...cols) - Math.min(...cols) >= 14);
});

test("resampling keeps geometry: 2× block average halves pixel count, doubles spacing", () => {
  const g = synthetic(40, 10, (x) => x * 0.1);
  const r = resample(g, 2);
  assert.equal(r.width, 20);
  near(meanSpacing(r), 20, 1e-9);
  const { slope } = slopeAspect(r);
  near(slope[10 * 20 + 10], (Math.atan(0.1) * 180) / Math.PI, 1e-3);
});

test("roughness of a plane is zero; of a bumpy surface positive", () => {
  const plane = synthetic(20, 1, (x, y) => 0.3 * x + 0.2 * y);
  assert.ok(roughness(plane, 2)[10 * 20 + 10] < 1e-4);
  const bumpy = synthetic(20, 1, (x, y, c, r) => ((c + r) % 2 ? 1 : -1));
  assert.ok(roughness(bumpy, 2)[10 * 20 + 10] > 0.5);
});

test("analog comparison: identical grids score 1; scale is matched first", () => {
  const a = synthetic(64, 10, (x, y) => 20 * Math.sin(x / 80) + 10 * Math.cos(y / 60));
  const same = compareTerrain(a, a);
  near(same.score, 1, 1e-9);
  const coarse = resample(a, 4);
  const cmp = compareTerrain(a, coarse);
  near(cmp.commonPixel_m, 40, 1e-6, "compared at the coarser common scale");
  assert.equal(cmp.factors.target, 4);
});

test("analog comparison: missing data is not counted as zero difference", () => {
  const a = synthetic(64, 10, (x) => x * 0.05);
  const b = synthetic(64, 10, () => NaN);
  const cmp = compareTerrain(a, b);
  assert.equal(cmp.score, null);
  assert.ok(cmp.rows.every((r) => r.difference === null));
  assert.ok(cmp.flags.length > 0);
});

// --- Real DEM cut-outs (public/dem, fetched by scripts/fetch-dem.mjs) -------
function loadReal(id) {
  const index = JSON.parse(readFileSync("public/dem/index.json", "utf8"));
  const meta = index.datasets.find((d) => d.id === id);
  const buf = readFileSync("public/dem/" + meta.file);
  assert.equal(createHash("sha256").update(buf).digest("hex"), meta.sha256, "checksum");
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return makeGrid(meta.width, meta.height, data, meta.georef, meta);
}

test("real DEM index has full provenance for every dataset", () => {
  const index = JSON.parse(readFileSync("public/dem/index.json", "utf8"));
  assert.ok(index.datasets.length >= 3);
  for (const d of index.datasets) {
    for (const k of ["source", "datum", "crs", "georef", "resolution_m", "units", "status", "sha256", "verticalAccuracy"]) assert.ok(d[k] !== undefined, `${d.id} missing ${k}`);
    assert.ok(d.source.url.startsWith("https://"));
    assert.ok(d.source.license);
  }
});

test("REAL negative example: LOLA 20 m south-pole centre (Shackleton rim) is rejected for the robotic preset", () => {
  const g = loadReal("moon-south-pole-lola-20m");
  assert.equal(g.meta.datum.radius_m, 1737400);
  const ll = pixelToLatLon(g.georef, g.width / 2 - 0.5, g.height / 2 - 0.5);
  assert.ok(ll.lat < -89.99);
  const card = terrainCard(g, { col: 128, row: 128 }, lander, { a_m: 300, b_m: 150, azimuth_deg: 0 });
  assert.equal(card.status, "fail");
});

test("REAL end-to-end: Apollo 11 area (LOLA 1024 px/deg) is gentle but footprint-scale hazards stay unproven", () => {
  const g = loadReal("moon-apollo11-lola-30m");
  const st = regionStats(g, pixelsInEllipse(g, 96, 96, 1500, 800, 0));
  assert.ok(st.slopeP95 < 8, "mare surface is gentle at 30 m scale");
  assert.ok(st.mean < -1800 && st.mean > -2100, "elevation vs 1737.4 km sphere");
  const card = terrainCard(g, { col: 96, row: 96 }, lander, { a_m: 1500, b_m: 800, azimuth_deg: 0 });
  assert.equal(card.status, "insufficient");
  const prof = profile(g, lineThrough(g, 96, 96, 90, 3000));
  near(prof.length_m, 3000, 60);
});
