// Node-only: Earth DEM windows from Copernicus DEM GLO-30 (AWS Open Data) or
// NASADEM (Microsoft Planetary Computer), with a land/water mask from
// ESA WorldCover 2021 v200 (class 80 = permanent water bodies).
// Grids stay in geographic lat/lon on WGS84 (correct for Earth); ground spacing
// is computed with WGS84 radii of curvature (shared/terrain/georef.js).
import { openCOG } from "./geotiff.mjs";
import { bi } from "../../shared/i18n/bilingual.js";

export const EARTH_SOURCES = {
  copernicus: {
    title: "Copernicus DEM GLO-30 (COG, AWS Open Data)",
    host: "copernicus-dem-30m.s3.amazonaws.com",
    version: "GLO-30 public release (2021/2022 tiles as served on AWS)",
    datum: { kind: "geoid", model: "EGM2008", description: "Orthometric heights above the EGM2008 geoid (per the Copernicus DEM specification)." },
    surface: "DSM — surface including buildings and vegetation, not bare earth",
    verticalAccuracy: "Copernicus DEM specification: absolute vertical accuracy < 4 m (LE90) for GLO-30; worse in mountains and forests.",
    license:
      "Copernicus DEM GLO-30, free Copernicus licence. Attribution: \"produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved\".",
    doc: "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
  },
  nasadem: {
    title: "NASADEM HGT v001 (COG, Microsoft Planetary Computer)",
    host: "nasademeuwest.blob.core.windows.net",
    version: "NASADEM_HGT v001 (NASA JPL, 2020)",
    datum: { kind: "geoid", model: "EGM96", description: "Heights above the EGM96 geoid (NASADEM_HGT)." },
    surface: "SRTM radar surface (reprocessed), partly DSM",
    verticalAccuracy: "NASADEM (reprocessed SRTM, Feb 2000): typically a few metres; worse on steep slopes and in radar shadow; void-filled areas are less accurate.",
    license: "NASA data — no restrictions on use. Citation: NASA JPL (2020), NASADEM Merged DEM Global 1 arc second V001, NASA EOSDIS LP DAAC, doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001.",
    doc: "https://planetarycomputer.microsoft.com/dataset/nasadem",
  },
};
export const WORLDCOVER = {
  title: "ESA WorldCover 10 m 2021 v200",
  license: "CC BY 4.0 — © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
  doc: "https://esa-worldcover.org/",
};

const pad = (n, w) => String(Math.abs(n)).padStart(w, "0");
export function copernicusUrl(latF, lonF) {
  const id = `Copernicus_DSM_COG_10_${latF < 0 ? "S" : "N"}${pad(latF, 2)}_00_${lonF < 0 ? "W" : "E"}${pad(lonF, 3)}_00_DEM`;
  return `https://${EARTH_SOURCES.copernicus.host}/${id}/${id}.tif`;
}
export function nasademUrl(latF, lonF) {
  return `https://${EARTH_SOURCES.nasadem.host}/nasadem-cog/v001/NASADEM_HGT_${latF < 0 ? "s" : "n"}${pad(latF, 2)}${lonF < 0 ? "w" : "e"}${pad(lonF, 3)}.tif`;
}
export function worldcoverUrl(lat3, lon3) {
  return `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${lat3 < 0 ? "S" : "N"}${pad(lat3, 2)}${lon3 < 0 ? "W" : "E"}${pad(lon3, 3)}_Map.tif`;
}

let pcToken = null;
async function planetaryToken(fetcher) {
  if (pcToken && pcToken.until > Date.now()) return pcToken.token;
  const r = await fetcher("https://planetarycomputer.microsoft.com/api/sas/v1/token/nasadem");
  if (!r.ok) throw new Error("Planetary Computer SAS token: HTTP " + r.status);
  const j = await r.json();
  pcToken = { token: j.token, until: Date.now() + 30 * 60 * 1000 };
  return j.token;
}

const cogCache = new Map();
async function cog(url, fetcher, signal) {
  const key = url.split("?")[0];
  if (cogCache.has(key)) return cogCache.get(key);
  const p = openCOG(url, { fetcher, signal }).catch((e) => {
    cogCache.delete(key);
    if (e.code === 404) return null; // no tile (open ocean / outside coverage)
    throw e;
  });
  cogCache.set(key, p);
  if (cogCache.size > 24) cogCache.delete(cogCache.keys().next().value);
  return p;
}

/** Native-resolution mosaic window from 1°×1° tiles (PixelIsPoint, centres on integer seconds). */
async function nativeMosaic({ urlFor, latC, lonC, width, height, fetcher, signal }) {
  const first = await cog(urlFor(Math.floor(latC), Math.floor(lonC)), fetcher, signal);
  if (!first) throw new Error(bi("У цій точці немає тайла DEM (океан або поза покриттям)", "No DEM tile at this point (ocean or outside coverage)"));
  const { dLat, dLon } = first.geo;
  // global index of the native grid: lon = −180 + gx·dLon, lat = 90 − gy·dLat
  const gx0 = Math.round((lonC + 180) / dLon) - Math.floor(width / 2);
  const gy0 = Math.round((90 - latC) / dLat) - Math.floor(height / 2);
  const out = new Float64Array(width * height).fill(NaN);
  const tiles = new Map();
  for (const [dx, dy] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [Math.floor(width / 2), 0], [0, Math.floor(height / 2)]]) {
    const lon = -180 + (gx0 + dx) * dLon,
      lat = 90 - (gy0 + dy) * dLat;
    tiles.set(`${Math.floor(lat + 1e-9)}:${Math.floor(lon + 1e-9)}`, [Math.floor(lat + 1e-9), Math.floor(lon + 1e-9)]);
  }
  const missing = [];
  for (const [latF, lonF] of tiles.values()) {
    const c = await cog(urlFor(latF, lonF), fetcher, signal);
    if (!c) {
      missing.push(`${latF},${lonF}`);
      continue;
    }
    if (Math.abs(c.geo.dLon - dLon) > 1e-12 || Math.abs(c.geo.dLat - dLat) > 1e-12) throw new Error(bi("Вікно перетинає зону з іншим кроком довготи — зменш область", "The window crosses a zone with a different longitude step — reduce the area"));
    // tile-local index of the window origin
    const tx0 = gx0 - Math.round((c.geo.lonC0 + 180) / dLon);
    const ty0 = gy0 - Math.round((90 - c.geo.latC0) / dLat);
    const win = await c.readWindow(tx0, ty0, width, height);
    for (let i = 0; i < win.length; i++) if (win[i] === win[i] && win[i] > -1000) out[i] = win[i];
  }
  return { data: out, dLat, dLon, latC0: 90 - gy0 * dLat, lonC0: -180 + gx0 * dLon, missingTiles: missing };
}

/** Water fraction per output pixel from WorldCover (class 80), or null where unknown. */
async function waterFractions({ lat0, lon0, dLat, dLon, width, height, fetcher, signal }) {
  const frac = new Float32Array(width * height).fill(NaN);
  const outPixelDeg = Math.min(dLat, dLon);
  const urls = new Set();
  const samplesPer = 3; // 3×3 sub-samples per output pixel
  const pts = [];
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++)
      for (let v = 0; v < samplesPer; v++)
        for (let u = 0; u < samplesPer; u++)
          pts.push([r * width + c, lat0 - r * dLat + (dLat * (v + 0.5)) / samplesPer - dLat / 2, lon0 + c * dLon + (dLon * (u + 0.5)) / samplesPer - dLon / 2]);
  // group by 3° WorldCover tile
  const groups = new Map();
  for (const p of pts) {
    const k = `${Math.floor(p[1] / 3) * 3}:${Math.floor(p[2] / 3) * 3}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const water = new Float32Array(width * height),
    known = new Float32Array(width * height);
  let level = 0;
  for (const [k, list] of groups) {
    const [la, lo] = k.split(":").map(Number);
    const url = worldcoverUrl(la, lo);
    const c = await cog(url, fetcher, signal);
    if (!c) continue;
    urls.add(url);
    // coarsest overview whose pixel ≤ output pixel / 3
    level = 0;
    for (let L = 1; L < c.ifds.length; L++) if ((c.geo.dLon * c.ifds[0].width) / c.ifds[L].width <= outPixelDeg / 3) level = L;
    const step = (c.geo.dLon * c.ifds[0].width) / c.ifds[level].width;
    const left = c.geo.lonC0 - c.geo.dLon / 2,
      top = c.geo.latC0 + c.geo.dLat / 2;
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    const idx = list.map(([i, lat, lon]) => {
      const col = Math.floor((lon - left) / step),
        row = Math.floor((top - lat) / step);
      minC = Math.min(minC, col); maxC = Math.max(maxC, col); minR = Math.min(minR, row); maxR = Math.max(maxR, row);
      return [i, col, row];
    });
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const win = await c.readWindow(minC, minR, w, h, level);
    for (const [i, col, row] of idx) {
      const cls = win[(row - minR) * w + (col - minC)];
      if (!(cls > 0)) continue; // 0 / NaN = no data
      known[i]++;
      if (cls === 80) water[i]++;
    }
  }
  for (let i = 0; i < frac.length; i++) if (known[i] > 0) frac[i] = water[i] / known[i];
  return { frac, urls: [...urls], level };
}

/**
 * Build an Earth DEM window.
 * @param {{lat:number, lon:number, size:number, factor?:number, source?:"copernicus"|"nasadem", fetcher?, signal?}} o
 */
export async function buildEarthWindow({ lat, lon, size, factor = 1, source = "copernicus", fetcher = fetch, signal }) {
  if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) throw new Error(bi("Широта має бути в межах ±85°, довгота ±180°", "Latitude must be within ±85°, longitude ±180°"));
  if (!(size >= 16 && size <= 256) || !(factor >= 1 && factor <= 20)) throw new Error(bi("Розмір вікна 16…256 пікс., множник 1…20", "Window size 16…256 px, factor 1…20"));
  const src = EARTH_SOURCES[source];
  if (!src) throw new Error(bi("Невідоме джерело DEM", "Unknown DEM source"));
  if (source === "nasadem" && Math.abs(lat) > 60) throw new Error(bi("NASADEM покриває лише 56°S…60°N", "NASADEM covers only 56°S…60°N"));
  let token = "";
  if (source === "nasadem") token = "?" + (await planetaryToken(fetcher));
  const urlFor = (la, lo) => (source === "nasadem" ? nasademUrl(la, lo) + token : copernicusUrl(la, lo));
  const W = size * factor;
  const nat = await nativeMosaic({ urlFor, latC: lat, lonC: lon, width: W, height: W, fetcher, signal });
  // block average (≥ 75 % valid native samples, else nodata)
  const data = new Float32Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      let s = 0, n = 0;
      for (let v = 0; v < factor; v++)
        for (let u = 0; u < factor; u++) {
          const z = nat.data[(r * factor + v) * W + c * factor + u];
          if (z === z) { s += z; n++; }
        }
      data[r * size + c] = n >= 0.75 * factor * factor ? s / n : NaN;
    }
  const off = (factor - 1) / 2;
  const georef = { type: "geographic", ellipsoid: "WGS84", lat0: nat.latC0 - off * nat.dLat, lon0: nat.lonC0 + off * nat.dLon, dLat: nat.dLat * factor, dLon: nat.dLon * factor };
  const wf = await waterFractions({ ...georef, width: size, height: size, fetcher, signal });
  let masked = 0, unknown = 0;
  for (let i = 0; i < data.length; i++) {
    if (wf.frac[i] !== wf.frac[i]) unknown++;
    else if (wf.frac[i] >= 0.5 && data[i] === data[i]) { data[i] = NaN; masked++; }
  }
  const midLat = lat * Math.PI / 180;
  const resolution_m = Math.round(((6371000 * Math.PI) / 180) * Math.sqrt(georef.dLat * georef.dLon * Math.cos(midLat)) * 10) / 10;
  const meta = {
    body: "earth",
    status: "measured",
    statusNote: (factor > 1 ? `Block average of ${factor}×${factor} native pixels. ` : "") + "Elevation model from radar interferometry; " + src.surface + ".",
    units: "m",
    nodata: "NaN",
    width: size,
    height: size,
    source: {
      title: src.title,
      url: urlFor(Math.floor(lat), Math.floor(lon)).split("?")[0],
      productId: urlFor(Math.floor(lat), Math.floor(lon)).split("?")[0].split("/").pop().replace(/\.tif$/, ""),
      version: src.version,
      observation: source === "nasadem" ? "SRTM, February 2000 (reprocessed 2020)" : "TanDEM-X, 2011–2015",
      license: src.license,
      archive: source === "nasadem" ? "Microsoft Planetary Computer (LP DAAC mirror)" : "AWS Open Data Registry",
      doc: src.doc,
      missingTiles: nat.missingTiles,
    },
    datum: src.datum,
    crs: { body: "Earth", projection: "Geographic lat/lon grid (EPSG:4326, WGS84 ellipsoid), PixelIsPoint", latitude: "geodetic (WGS84)", longitude: "east-positive" },
    georef,
    resolution_m,
    verticalAccuracy: src.verticalAccuracy,
    mask: {
      status: "derived",
      rule: "ESA WorldCover 2021 class 80 (permanent water) in ≥ 50 % of a pixel's sub-samples → nodata",
      source: WORLDCOVER.title,
      license: WORLDCOVER.license,
      urls: wf.urls,
      overviewLevel: wf.level,
      maskedFraction: masked / data.length,
      unknownFraction: unknown / data.length,
      note: "Heights below 0 m are NOT masked (depressions such as Death Valley are kept). Where WorldCover is missing, the mask is unknown.",
    },
  };
  return { data, meta };
}
