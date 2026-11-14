// Node-only: builds a DEM window from AWS Terrain Tiles (Terrarium PNG).
// Used by scripts/fetch-dem.mjs and the Node API route /api/dem/earth.
import { decodePNG, terrariumHeight } from "./png.mjs";

export const TERRARIUM_HOST = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export const TERRARIUM_LICENSE =
  "AWS Open Data 'Terrain Tiles' (Tilezen/Mapzen Joerd). Attribution required per source list: https://github.com/tilezen/joerd/blob/master/docs/attribution.md (SRTM/NASA, ArcticDEM, GMTED, ETOPO1, 3DEP …).";

/**
 * @returns {Promise<{data: Float32Array, meta: object}>}
 */
export async function buildTerrariumWindow({ lat, lon, size, targetSpacing, fetcher = fetch, signal }) {
  if (!(Math.abs(lat) <= 84) || !(Math.abs(lon) <= 180)) throw new Error("Координати поза покриттям Web Mercator (|lat| ≤ 84°)");
  if (!(size >= 16 && size <= 256)) throw new Error("Розмір вікна 16…256 пікселів");
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const zoom = Math.min(14, Math.max(1, Math.round(Math.log2((156543.034 * cosLat) / targetSpacing))));
  const world = 256 * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  const pxC = ((lon + 180) / 360) * world;
  const pyC = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  const px0 = Math.round(pxC - size / 2),
    py0 = Math.round(pyC - size / 2);
  const keys = new Set();
  for (let r = 0; r < size; r += 1)
    for (let c = 0; c < size; c += 1) keys.add(`${Math.floor((((px0 + c) % world) + world) % world / 256)}/${Math.floor((py0 + r) / 256)}`);
  if (keys.size > 9) throw new Error("Забагато тайлів для одного вікна");
  const tiles = new Map();
  const urls = [];
  await Promise.all(
    [...keys].map(async (key) => {
      const url = `${TERRARIUM_HOST}/${zoom}/${key}.png`;
      urls.push(url);
      const res = await fetcher(url, { signal });
      if (!res.ok) throw new Error(`Terrain Tiles: HTTP ${res.status}`);
      tiles.set(key, decodePNG(new Uint8Array(await res.arrayBuffer())));
    }),
  );
  const data = new Float32Array(size * size);
  let masked = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const gx = (((px0 + c) % world) + world) % world,
        gy = py0 + r;
      const t = tiles.get(`${Math.floor(gx / 256)}/${Math.floor(gy / 256)}`);
      const o = ((gy % 256) * 256 + (gx % 256)) * 4;
      let h = terrariumHeight(t.rgba[o], t.rgba[o + 1], t.rgba[o + 2]);
      if (h < 0) {
        h = NaN; // ASSUMPTION: below 0 m = sea / bathymetry
        masked++;
      }
      data[r * size + c] = h;
    }
  const pixel = ((2 * Math.PI * 6378137) / world) * cosLat;
  const meta = {
    body: "earth",
    status: "measured",
    statusNote: "Gridded elevation product derived from measurements (composite of source DEMs).",
    units: "m",
    nodata: "NaN",
    width: size,
    height: size,
    source: { title: "AWS Terrain Tiles (Terrarium PNG encoding)", url: `${TERRARIUM_HOST}/${zoom}/{x}/{y}.png`, tiles: urls.sort(), productId: `terrarium z${zoom}`, version: "elevation-tiles-prod (static, last modified 2017)", observation: "Composite of source DEMs; dominant source for this area is not encoded per pixel", license: TERRARIUM_LICENSE, archive: "AWS Open Data Registry" },
    datum: { kind: "geoid", description: "Orthometric heights, mostly EGM96 geoid (SRTM); varies by contributing source." },
    crs: { body: "Earth", projection: "Web Mercator (EPSG:3857, spherical 6378137 m)", latitude: "geodetic (WGS84)", longitude: "east-positive" },
    georef: { type: "web-mercator", zoom, tileSize: 256, px0, py0 },
    resolution_m: Math.round(pixel * 10) / 10,
    sourceResolutionNote: "Tile pixel spacing; underlying source (e.g. SRTM 1″ ≈ 30 m, GMTED ≈ 250 m+) may be coarser — resampling does not add detail.",
    verticalAccuracy: "SRTM: ~16 m absolute (90 %) by specification, typically 5–10 m; other sources differ.",
    mask: { status: "assumed", rule: "h < 0 m → nodata (possible sea/bathymetry)", maskedFraction: masked / data.length, note: "Not valid for genuinely below-sea-level land (e.g. Death Valley)." },
  };
  return { data, meta };
}
