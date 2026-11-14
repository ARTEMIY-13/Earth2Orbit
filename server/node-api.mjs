// Node-only API routes (never bundled for the browser / GitHub Pages).
// Only fixed, allow-listed upstreams are contacted; there is no generic proxy.
import { createHash } from "node:crypto";
import { buildEarthWindow } from "./data/earthdem.mjs";
import { utcToJdTDB } from "../shared/mission/time.js";
import { bi, pick } from "../shared/i18n/bilingual.js";

const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api";
const HORIZONS_BODIES = { earth: { cmd: "399", center: "500@10" }, mars: { cmd: "499", center: "500@10" }, moon: { cmd: "301", center: "500@399" } };
const cache = new Map();
const CACHE_MAX = 40;
const json = (v, status = 200, extra = {}) =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return value;
}

async function withTimeout(fn, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleNodeAPI(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (request.method !== "GET") return null;
  if (url.pathname === "/api/dem/earth") {
    const lat = Number(url.searchParams.get("lat")),
      lon = Number(url.searchParams.get("lon"));
    const scale = url.searchParams.get("scale") === "coarse" ? "coarse" : "fine";
    const source = url.searchParams.get("source") === "nasadem" ? "nasadem" : "copernicus";
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180)
      return json({ error: bi("Широта має бути в межах ±85°, довгота ±180°.", "Latitude must be within ±85°, longitude ±180°.") }, 400);
    const key = `dem:${source}:${lat.toFixed(4)}:${lon.toFixed(4)}:${scale}`;
    if (cache.has(key)) return json(cache.get(key));
    try {
      const { data, meta } = await withTimeout(
        (signal) => buildEarthWindow({ lat, lon, size: scale === "coarse" ? 128 : 192, factor: scale === "coarse" ? 15 : 1, source, fetcher, signal }),
        45000,
      );
      const buf = Buffer.from(data.buffer);
      const body = {
        meta: {
          ...meta,
          id: `earth-live-${source}-${lat.toFixed(3)}-${lon.toFixed(3)}-${scale}`,
          name: `Земля ${lat.toFixed(3)}°, ${lon.toFixed(3)}° · ${source === "nasadem" ? "NASADEM" : "Copernicus"} (${scale === "coarse" ? "~450 м" : "~30 м"})`,
          retrieved: new Date().toISOString().slice(0, 10),
          sha256: createHash("sha256").update(buf).digest("hex"),
          encoding: "float32-le-base64",
          live: true,
        },
        data: buf.toString("base64"),
      };
      return json(remember(key, body));
    } catch (error) {
      return json({ error: bi("Не вдалося отримати DEM: " + pick(error.message, "uk"), "Could not fetch the DEM: " + pick(error.message, "en")) }, 502);
    }
  }
  if (url.pathname === "/api/horizons") {
    const body = url.searchParams.get("body");
    const utc = url.searchParams.get("utc");
    const spec = HORIZONS_BODIES[body];
    const t = Date.parse(utc || "");
    if (!spec || !Number.isFinite(t) || t < Date.UTC(1900, 0, 1) || t > Date.UTC(2100, 0, 1))
      return json({ error: bi("Потрібні body=earth|mars|moon і utc (1900–2100).", "body=earth|mars|moon and utc (1900–2100) are required.") }, 400);
    const tMin = Math.round(t / 60000) * 60000;
    const iso = new Date(tMin).toISOString().slice(0, 16).replace("T", " ");
    const jdTDB = utcToJdTDB(tMin); // explicit UTC → TDB conversion
    const key = `hz:${body}:${iso}`;
    if (cache.has(key)) return json(cache.get(key));
    const q = new URLSearchParams({
      format: "json", COMMAND: `'${spec.cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
      CENTER: `'${spec.center}'`, TLIST: `'${jdTDB.toFixed(9)}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'TDB'", VEC_TABLE: "'2'",
      REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'",
    });
    try {
      const res = await withTimeout((signal) => fetcher(`${HORIZONS}?${q}`, { signal }), 20000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const block = String(data.result).split("$$SOE")[1]?.split("$$EOE")[0]?.trim();
      if (!block) throw new Error("відповідь без $$SOE");
      const f = block.split(",").map((s) => s.trim());
      return json(
        remember(key, {
          body,
          utc: iso + " UTC",
          jdTDB: +f[0],
          r_m: [+f[2] * 1000, +f[3] * 1000, +f[4] * 1000],
          v_ms: [+f[5] * 1000, +f[6] * 1000, +f[7] * 1000],
          frame: "Ecliptic of J2000.0 (ICRF), " + (spec.center === "500@10" ? "heliocentric" : "geocentric"),
          source: "JPL Horizons API",
          signature: data.signature,
        }),
      );
    } catch (error) {
      return json({ error: bi("Horizons недоступний: " + error.message, "Horizons unavailable: " + error.message) }, 502);
    }
  }
  return null;
}
