// Scenario export/import (JSON) and profile CSV export.
import { TERRAIN_MODEL_VERSION } from "../terrain/analysis.js";
import { DESCENT_MODEL_VERSION } from "./descent.js";
import { TRANSFER_MODEL_VERSION } from "./transfer.js";
import { EPHEMERIS_MODEL } from "./ephemeris.js";
import { LEAP_SECONDS_SOURCE } from "./time.js";

export const SCENARIO_SCHEMA_VERSION = 1;

const REQUIRED_INPUTS = ["datasetId", "site", "ellipse", "vehicleId", "lander", "stack", "descentStart", "launch", "transfer"];

export function buildScenario({ inputs, dataset, results, limitations = [] }) {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    app: "Earth2Orbit mission planner (educational)",
    disclaimer: "Незалежний навчальний проєкт для NASA Space Apps 2026. Не сертифікована система керування польотами.",
    createdUtc: new Date(results?.computedUtc ?? 0).toISOString(),
    inputs,
    data: dataset
      ? {
          id: dataset.id,
          body: dataset.body,
          productId: dataset.source?.productId,
          sourceUrl: dataset.source?.url,
          version: dataset.source?.version,
          sha256: dataset.sha256,
          datum: dataset.datum,
          crs: dataset.crs,
          resolution_m: dataset.resolution_m,
          status: dataset.status,
        }
      : null,
    models: {
      terrain: TERRAIN_MODEL_VERSION,
      descent: DESCENT_MODEL_VERSION,
      transfer: TRANSFER_MODEL_VERSION,
      ephemeris: EPHEMERIS_MODEL,
      timeScales: "UTC → TAI → TT → TDB; " + LEAP_SECONDS_SOURCE,
      frames: "Transfer: ecliptic J2000 (heliocentric for Mars, geocentric for Moon). Descent: local ENU at target (x east, y north, z up, metres).",
      seed: null,
    },
    tolerances: { lambertRelTime: 1e-10, descentDt_s: inputs?.descentStart?.dt ?? 0.05, contactBisectionIterations: 40 },
    results: results ?? null,
    limitations,
  };
}

export function parseScenario(text) {
  let obj;
  try {
    obj = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    throw new Error("Файл не є коректним JSON");
  }
  if (obj?.schemaVersion !== SCENARIO_SCHEMA_VERSION) throw new Error(`Непідтримувана schemaVersion: ${obj?.schemaVersion}`);
  const missing = REQUIRED_INPUTS.filter((k) => obj.inputs?.[k] === undefined);
  if (missing.length) throw new Error("У сценарії бракує полів: " + missing.join(", "));
  return obj;
}

export function profileCSV(profile, meta = {}) {
  const head = [
    `# Earth2Orbit profile; dataset=${meta.datasetId ?? ""}; datum=${meta.datum ?? ""}; interpolation=${profile.interpolation}`,
    "distance_m,elevation_m,lat_deg,lon_deg,grade_deg,gap",
  ];
  const rows = profile.points.map((p) =>
    [p.d.toFixed(2), p.z === null ? "" : p.z.toFixed(2), p.lat.toFixed(6), p.lon.toFixed(6), p.grade === undefined ? "" : p.grade.toFixed(3), p.z === null ? 1 : 0].join(","),
  );
  return head.concat(rows).join("\n") + "\n";
}
