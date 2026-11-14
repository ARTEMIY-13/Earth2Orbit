#!/usr/bin/env node
// Fetches reference state vectors from JPL Horizons (DE441) used by tests to
// bound the error of the in-app analytic ephemeris. Run: node scripts/fetch-horizons-fixture.mjs
import { writeFile, mkdir } from "node:fs/promises";

const API = "https://ssd.jpl.nasa.gov/api/horizons.api";
const EPOCHS = ["2026-11-14", "2028-12-01", "2031-03-15", "2035-07-04"];
const TARGETS = [
  { id: "399", center: "500@10", name: "earth-helio" },
  { id: "499", center: "500@10", name: "mars-helio" },
  { id: "301", center: "500@399", name: "moon-geo" },
];

async function vectors(t, epoch) {
  const q = new URLSearchParams({
    format: "json",
    COMMAND: `'${t.id}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${t.center}'`,
    TLIST: `'${epoch}'`,
    TLIST_TYPE: "'CAL'",
    TIME_TYPE: "'TDB'",
    VEC_TABLE: "'2'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
  });
  const res = await fetch(`${API}?${q}`);
  const json = await res.json();
  const block = json.result.split("$$SOE")[1].split("$$EOE")[0].trim();
  const f = block.split(",").map((s) => s.trim());
  return { jdTDB: +f[0], r_km: [+f[2], +f[3], +f[4]], v_kms: [+f[5], +f[6], +f[7]] };
}

const out = { source: API, retrieved: new Date().toISOString(), frame: "Ecliptic of J2000.0 (ICRF), geometric states, TDB", ephemeris: "DE441 (per Horizons header)", data: {} };
for (const t of TARGETS) {
  out.data[t.name] = [];
  for (const e of EPOCHS) out.data[t.name].push(await vectors(t, e));
}
await mkdir("server/data/fixtures", { recursive: true });
await writeFile("server/data/fixtures/horizons-vectors.json", JSON.stringify(out, null, 1));
console.log("ok");
