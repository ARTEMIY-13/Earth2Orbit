#!/usr/bin/env node
// Builds the small, reproducible DEM cut-outs in public/dem/ from official
// open archives using HTTP Range requests (only the needed rows are fetched).
//
//   node scripts/fetch-dem.mjs            # all datasets
//   node scripts/fetch-dem.mjs moon-south-pole
//
// Output per dataset: <id>.bin (Float32 little-endian, row-major, NaN = nodata)
// and an entry in public/dem/index.json with full provenance + SHA-256.
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { buildEarthWindow } from "../server/data/earthdem.mjs";
import { latLonToPixel } from "../shared/terrain/georef.js";

const OUT = resolve("public/dem");
const PDS = "https://pds-geosciences.wustl.edu";
const LOLA_POLAR = `${PDS}/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img`;
const LOLA_CYL = `${PDS}/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img`;
const MOLA = `${PDS}/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128`;

const LOLA_LICENSE =
  "NASA PDS archive data: public domain in the U.S. (NASA data policy); cite Smith et al. / LOLA team.";
const MOLA_LICENSE =
  "NASA PDS archive data: public domain in the U.S. (NASA data policy); cite Smith et al. 2003 MOLA MEGDR.";

const datasets = [
  {
    id: "moon-south-pole-lola-20m",
    body: "moon",
    name: "Shackleton rim / lunar south pole",
    kind: "lola-polar",
    file: "ldem_875s_20m",
    lat: -90,
    lon: 0,
    size: 256,
    N: 7584,
    scale_m: 20,
    productId: "LDEM_875S_20M",
    version: "V2.0 (product created 2017-06-15)",
    observation: "2009-07-13 → 2017-02-02 (LOLA altimetry)",
    verticalAccuracy:
      "LOLA ranging precision ~0.1 m, radial orbit error ~1 m (Mazarico et al. 2012). Gridded value between tracks is interpolated (GMT surface); per-pixel interpolation error not provided — treat <2 px features as unresolved.",
  },
  {
    id: "moon-apollo11-lola-30m",
    body: "moon",
    name: "Mare Tranquillitatis — Apollo 11 site",
    kind: "lola-cyl",
    file: "ldem_1024_00n_15n_000_030",
    lat: 0.674,
    lon: 23.473,
    size: 192,
    ppd: 1024,
    tile: { latMax: 15, lonMin: 0, cols: 30720 },
    productId: "LDEM_1024_00N_15N_000_030",
    version: "V1.05 (product created 2011-03-15)",
    observation: "LOLA altimetry through 2011",
    verticalAccuracy:
      "LOLA ~1 m radial; at 1024 px/deg near the equator ground tracks are km apart, so many pixels are interpolated. Small craters/boulders are NOT resolved.",
  },
  {
    id: "mars-jezero-mola-463m",
    body: "mars",
    name: "Jezero crater (MOLA MEGDR 128 px/deg)",
    kind: "mola",
    file: "megt44n000hb",
    lat: 18.44,
    lon: 77.45,
    size: 128,
    ppd: 128,
    tile: { latMax: 44, lonMin: 0, cols: 11520 },
    productId: "MEGT44N000HB",
    version: "2.0 (product created 2003-03-21)",
    observation: "MGS MOLA 1997–2001",
    verticalAccuracy:
      "MOLA ~1 m vertical vs. centre of mass (Smith et al. 2001), but 463 m grid with interpolation between tracks: landing-scale hazards (metres) are completely unresolved.",
  },
  ...[
    ["earth-atacama", "Atacama Desert (Yungay area)", -24.08, -70.01, "earth-0"],
    ["earth-haughton", "Haughton impact structure, Devon Island", 75.38, -89.67, "earth-1"],
    ["earth-timanfaya", "Timanfaya volcanic field, Lanzarote", 29.0, -13.75, "earth-10"],
    ["earth-kilauea", "Kīlauea caldera, Hawaiʻi", 19.41, -155.28, "earth-3"],
    ["earth-meteor-crater", "Barringer (Meteor) Crater, Arizona — candidate", 35.027, -111.022, null],
    ["earth-death-valley", "Badwater Basin, Death Valley — below sea level", 36.23, -116.77, null],
  ].flatMap(([id, name, lat, lon, catalogId]) => [
    { id: `${id}-fine`, body: "earth", name, kind: "earth", source: "copernicus", lat, lon, size: 192, factor: 1, catalogId },
    { id: `${id}-coarse`, body: "earth", name: name + " (coarse, ~450 m)", kind: "earth", source: "copernicus", lat, lon, size: 128, factor: 15, catalogId },
  ]),
  { id: "earth-meteor-crater-nasadem-fine", body: "earth", name: "Barringer (Meteor) Crater — NASADEM (source comparison)", kind: "earth", source: "nasadem", lat: 35.027, lon: -111.022, size: 192, factor: 1, catalogId: null },
];

async function fetchRange(url, start, length, attempt = 0) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
  if (res.status !== 206) {
    if (attempt < 3) return fetchRange(url, start, length, attempt + 1);
    throw new Error(`${url}: expected 206, got ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Reads a size×size window of int16 rows from a raw PDS IMG via range requests. */
async function readInt16Window(url, rowBytes, row0, col0, size, littleEndian, scale = 1) {
  const data = new Float32Array(size * size);
  await pool([...Array(size).keys()], 8, async (r) => {
    const bytes = await fetchRange(url, (row0 + r) * rowBytes + col0 * 2, size * 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let c = 0; c < size; c++) data[r * size + c] = view.getInt16(c * 2, littleEndian) * scale;
  });
  return data;
}

async function build(ds) {
  const base = {
    id: ds.id,
    body: ds.body,
    name: ds.name,
    status: "measured",
    statusNote: "Gridded elevation product derived from measurements (interpolated between tracks/samples).",
    units: "m",
    nodata: "NaN",
    catalogId: ds.catalogId ?? null,
    retrieved: new Date().toISOString().slice(0, 10),
  };
  if (ds.kind === "lola-polar") {
    const url = `${LOLA_POLAR}/${ds.file}.img`;
    const georef0 = { type: "polar-stereographic", radius_m: 1737400, scale_m: ds.scale_m, N: ds.N, I0: 1, J0: 1, pole: -1 };
    const p = latLonToPixel(georef0, ds.lat, ds.lon);
    const col0 = Math.round(p.col - ds.size / 2),
      row0 = Math.round(p.row - ds.size / 2);
    const data = await readInt16Window(url, ds.N * 2, row0, col0, ds.size, true, 0.5);
    return {
      ...base,
      data,
      width: ds.size,
      height: ds.size,
      source: { title: "LRO LOLA Gridded Data Record (polar)", url, label: url.replace(/\.img$/, ".lbl"), productId: ds.productId, version: ds.version, dataset: "LRO-L-LOLA-4-GDR-V1.0", observation: ds.observation, license: LOLA_LICENSE, archive: "NASA PDS Geosciences Node" },
      datum: { kind: "sphere", radius_m: 1737400, description: "Height above 1737.4 km reference sphere (not a geoid/'sea level')." },
      crs: { body: "Moon", projection: "Polar stereographic (spherical), true at pole", latitude: "planetocentric", longitude: "east-positive", frame: "Moon ME/PA per LOLA GDR" },
      georef: { ...georef0, I0: col0 + 1, J0: row0 + 1 },
      resolution_m: ds.scale_m,
      verticalAccuracy: ds.verticalAccuracy,
    };
  }
  if (ds.kind === "lola-cyl" || ds.kind === "mola") {
    const url = `${ds.kind === "mola" ? MOLA : LOLA_CYL}/${ds.file}.img`;
    const rowF = (ds.tile.latMax - ds.lat) * ds.ppd - 0.5;
    const colF = (ds.lon - ds.tile.lonMin) * ds.ppd - 0.5;
    const row0 = Math.round(rowF - ds.size / 2),
      col0 = Math.round(colF - ds.size / 2);
    const lola = ds.kind === "lola-cyl";
    const data = await readInt16Window(url, ds.tile.cols * 2, row0, col0, ds.size, lola, lola ? 0.5 : 1);
    const radius_m = lola ? 1737400 : 3396000;
    return {
      ...base,
      data,
      width: ds.size,
      height: ds.size,
      source: lola
        ? { title: "LRO LOLA Gridded Data Record (cylindrical 1024 px/deg)", url, label: url.replace(/\.img$/, ".lbl"), productId: ds.productId, version: ds.version, dataset: "LRO-L-LOLA-4-GDR-V1.0", observation: ds.observation, license: LOLA_LICENSE, archive: "NASA PDS Geosciences Node" }
        : { title: "MGS MOLA Mission Experiment Gridded Data Record (topography)", url, label: url.replace(/\.img$/, ".lbl"), productId: ds.productId, version: ds.version, dataset: "MGS-M-MOLA-5-MEGDR-L3-V1.0", observation: ds.observation, license: MOLA_LICENSE, archive: "NASA PDS Geosciences Node" },
      datum: lola
        ? { kind: "sphere", radius_m, description: "Height above 1737.4 km reference sphere." }
        : { kind: "areoid", radius_m, description: "MOLA topography = planetary radius − areoid (equipotential, mean equatorial radius 3396 km)." },
      crs: { body: lola ? "Moon" : "Mars", projection: "Simple cylindrical (equirectangular)", latitude: "planetocentric", longitude: "east-positive" },
      georef: {
        type: "simple-cylindrical",
        radius_m,
        ppd: ds.ppd,
        lat0: ds.tile.latMax - (row0 + 0.5) / ds.ppd,
        lon0: ds.tile.lonMin + (col0 + 0.5) / ds.ppd,
      },
      resolution_m: Math.round(((radius_m * Math.PI) / 180 / ds.ppd) * 10) / 10,
      verticalAccuracy: ds.verticalAccuracy,
    };
  }
  if (ds.kind === "earth") {
    const { data, meta } = await buildEarthWindow({ lat: ds.lat, lon: ds.lon, size: ds.size, factor: ds.factor, source: ds.source });
    return { ...base, ...meta, catalogId: base.catalogId, data };
  }
  throw new Error("unknown kind " + ds.kind);
}

await mkdir(OUT, { recursive: true });
const only = process.argv[2];
let index = [];
try {
  index = JSON.parse(await readFile(resolve(OUT, "index.json"), "utf8")).datasets;
} catch {}
for (const ds of datasets) {
  if (only && ds.id !== only) continue;
  process.stdout.write(`→ ${ds.id} … `);
  const { data, ...meta } = await build(ds);
  let valid = 0,
    min = Infinity,
    max = -Infinity;
  for (const v of data)
    if (Number.isFinite(v)) {
      valid++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  const buf = Buffer.from(data.buffer);
  meta.file = `${ds.id}.bin`;
  meta.encoding = "float32-le";
  meta.sha256 = createHash("sha256").update(buf).digest("hex");
  meta.stats = { min, max, validFraction: valid / data.length };
  await writeFile(resolve(OUT, meta.file), buf);
  index = index.filter((d) => d.id !== ds.id).concat(meta);
  console.log(`ok ${meta.width}×${meta.height} @ ${meta.resolution_m} m, ${min.toFixed(1)}…${max.toFixed(1)} m`);
}
index.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(
  resolve(OUT, "index.json"),
  JSON.stringify({ schemaVersion: 1, generatedBy: "scripts/fetch-dem.mjs", datasets: index }, null, 1),
);
