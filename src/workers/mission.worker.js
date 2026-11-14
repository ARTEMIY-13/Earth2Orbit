// Heavy computations off the main thread: terrain statistics, profiles, descent
// simulation, transfer window search, analog comparison.
// Protocol: { id, type, payload } → { id, ok, result } | { id, ok:false, error } | { id, progress }
import { makeGrid, slopeAspect, roughness, profile, regionStats, pixelsInEllipse, lineThrough, slopeHistogram, contourSegments } from "../../shared/terrain/analysis.js";
import { pixelToLatLon } from "../../shared/terrain/georef.js";
import { compareTerrain } from "../../shared/terrain/analogs.js";
import { simulateDescent } from "../../shared/mission/descent.js";
import { planTransfer } from "../../shared/mission/transfer.js";
import { terrainCard, landingCard, transferCard } from "../../shared/mission/assessment.js";
import { simulateAscent } from "../../shared/mission/ascent.js";
import { simulateEDL } from "../../shared/mission/edl.js";

import { bi } from "../i18n/bilingual.js";

const grids = new Map();
const LIMITS = { maxPixels: 512 * 512, maxDescentSteps: 40000, maxTransferCells: 240 * 240 };

function grid(id) {
  const g = grids.get(id);
  if (!g) throw new Error(bi("DEM не завантажено у worker: ", "DEM not loaded in the worker: ") + id);
  return g;
}

const handlers = {
  load({ meta, buffer }) {
    if (meta.width * meta.height > LIMITS.maxPixels) throw new Error(bi("Область завелика для обробки в браузері", "Area too large to process in the browser"));
    const g = makeGrid(meta.width, meta.height, new Float32Array(buffer), meta.georef, meta);
    grids.set(meta.id, g);
    const { slope, aspect } = slopeAspect(g);
    const rough = roughness(g, 2);
    return { id: meta.id, slope: slope.slice(), aspect: aspect.slice(), roughness: rough.slice(), hist: slopeHistogram(g) };
  },
  analyze({ datasetId, site, ellipse, lander, approachAzimuth, profileLength, polyline }) {
    const g = grid(datasetId);
    const card = terrainCard(g, site, lander, ellipse);
    const along = profile(g, lineThrough(g, site.col, site.row, approachAzimuth, profileLength));
    const across = profile(g, lineThrough(g, site.col, site.row, approachAzimuth + 90, profileLength));
    const poly = polyline?.length >= 2 ? profile(g, polyline) : null;
    const ell = pixelsInEllipse(g, site.col, site.row, ellipse.a_m, ellipse.b_m, ellipse.azimuth_deg);
    const ll = pixelToLatLon(g.georef, site.col, site.row);
    return { card, profiles: { along, across, poly }, ellipsePixels: ell, siteLatLon: ll, regionStats: regionStats(g, ell) };
  },
  contours({ datasetId, interval }) {
    const g = grid(datasetId);
    let min = Infinity,
      max = -Infinity;
    for (const v of g.data)
      if (v === v) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    const levels = [];
    for (let z = Math.ceil(min / interval) * interval; z <= max && levels.length < 80; z += interval) levels.push(z);
    return { interval, levels: levels.map((z) => ({ z, segs: contourSegments(g, z) })) };
  },
  descent({ datasetId, site, bodyId, lander, start, dt }) {
    const g = grid(datasetId);
    const maxTime = Math.min(900, LIMITS.maxDescentSteps * dt);
    const res = simulateDescent({ grid: g, col: site.col, row: site.row, bodyId, lander, start, dt, maxTime });
    return { descent: res, card: landingCard(res, lander) };
  },
  transfer(payload, progress) {
    const nDep = payload.windowDays / (payload.depStepDays || 1) + 1;
    const nTof = (payload.tofMaxDays - payload.tofMinDays) / (payload.tofStepDays || 1) + 1;
    if (nDep * nTof > LIMITS.maxTransferCells) throw new Error(bi("Сітка пошуку завелика — збільш крок або зменш вікно", "Search grid too large — increase the step or shrink the window"));
    let last = 0;
    const res = planTransfer({
      ...payload,
      onProgress: (f) => {
        if (f - last > 0.05 || f === 1) {
          last = f;
          progress(f);
        }
      },
    });
    let ascent = null,
      edl = null;
    if (res.applicable !== false && payload.launcher) {
      progress(0.9);
      ascent = simulateAscent({ launcher: payload.launcher, payload: res.stackMass, latitude_deg: payload.launchLat, targetAltitude: payload.stack.parkingAltitude });
    }
    if (res.best?.entrySpeed !== undefined && payload.edlVehicle) {
      edl = simulateEDL({
        entrySpeedInertial: res.best.entrySpeed,
        entryAltitude: 125000,
        flightPathAngle_deg: payload.edlVehicle.flightPathAngle_deg,
        entryAzimuth_deg: payload.entryAzimuth_deg ?? 90,
        latitude_deg: payload.siteLat,
        siteElevation_m: payload.siteElevation,
        vehicle: payload.edlVehicle,
      });
    }
    return { transfer: res, ascent, edl, card: transferCard(res, payload.stack, { ascent, edl, edlVehicle: payload.edlVehicle }) };
  },
  analogs({ targetId, candidateIds }) {
    const t = grid(targetId);
    return candidateIds.map((id) => {
      const c = grids.get(id);
      if (!c) return { id, error: "not-loaded" };
      return { id, ...compareTerrain(t, c) };
    });
  },
};

self.onmessage = (event) => {
  const { id, type, payload } = event.data;
  try {
    const result = handlers[type](payload, (p) => self.postMessage({ id, progress: p }));
    const transfer = [];
    if (type === "load") transfer.push(result.slope.buffer, result.aspect.buffer, result.roughness.buffer);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message || String(error) });
  }
};
