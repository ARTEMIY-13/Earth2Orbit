// Browser-side DEM loading. Works on GitHub Pages (prepared cut-outs under
// public/dem) and, in the Node deployment, can request live Earth windows.
import { asset } from "./api.js";
import { bi } from "../i18n/bilingual.js";

// Node-only routes are requested directly from the origin (never through the
// in-browser static API). In the GitHub Pages build they are not requested at all.
const PAGES = import.meta.env.MODE === "pages" || import.meta.env.VITE_STATIC_API === "true";
const STATIC_REASON = bi("Статичний хостинг (GitHub Pages) не має сервера: доступні лише підготовлені DEM-вирізки та вбудовані наближені ефемериди.", "Static hosting (GitHub Pages) has no server: only prepared DEM cut-outs and built-in approximate ephemerides are available.");

let indexPromise = null;

export function loadDemIndex() {
  if (!indexPromise)
    indexPromise = fetch(asset("dem/index.json"))
      .then((r) => {
        if (!r.ok) throw new Error(bi("Не вдалося завантажити каталог DEM (HTTP " + r.status + ")", "Could not load the DEM catalogue (HTTP " + r.status + ")"));
        return r.json();
      })
      .then((j) => j.datasets)
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  return indexPromise;
}

async function sha256Hex(buffer) {
  if (!globalThis.crypto?.subtle) return null;
  const d = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const bufferCache = new Map();

/** Returns { meta, buffer: ArrayBuffer (Float32 LE), checksumOk }. */
export async function loadDemData(meta, signal) {
  if (bufferCache.has(meta.id)) return bufferCache.get(meta.id);
  const res = await fetch(asset("dem/" + meta.file), { signal });
  if (!res.ok) throw new Error(`DEM ${meta.id}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength !== meta.width * meta.height * 4) throw new Error(bi(`DEM ${meta.id}: неочікуваний розмір файлу`, `DEM ${meta.id}: unexpected file size`));
  const hash = await sha256Hex(buffer);
  const out = { meta, buffer, checksumOk: hash === null ? null : hash === meta.sha256 };
  if (out.checksumOk === false) throw new Error(bi(`DEM ${meta.id}: контрольна сума не збігається`, `DEM ${meta.id}: checksum mismatch`));
  bufferCache.set(meta.id, out);
  return out;
}

let capabilities = null;
export async function loadCapabilities() {
  if (capabilities) return capabilities;
  if (PAGES) return (capabilities = { demEarthOnDemand: false, horizons: false, reason: STATIC_REASON });
  try {
    const r = await fetch("/api/capabilities");
    const j = r.ok && (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
    capabilities = j || { demEarthOnDemand: false, horizons: false, reason: bi("Node API недоступний (запущено лише Vite?).", "Node API unavailable (running Vite only?).") };
  } catch {
    capabilities = { demEarthOnDemand: false, horizons: false, reason: bi("Node API недоступний.", "Node API unavailable.") };
  }
  return capabilities;
}

/** Node deployment only: live Earth DEM window (Copernicus GLO-30 or NASADEM + WorldCover mask). */
export async function loadLiveEarthDem(lat, lon, scale, source, signal) {
  if (PAGES) throw new Error(STATIC_REASON);
  const r = await fetch(`/api/dem/earth?lat=${lat}&lon=${lon}&scale=${scale}&source=${source}`, { signal });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || bi("DEM недоступний", "DEM unavailable"));
  const bin = Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0));
  const out = { meta: j.meta, buffer: bin.buffer, checksumOk: (await sha256Hex(bin.buffer)) === j.meta.sha256 };
  bufferCache.set(j.meta.id, out);
  return out;
}

export async function horizonsState(body, utcMs) {
  if (PAGES) throw new Error(STATIC_REASON);
  const r = await fetch(`/api/horizons?body=${body}&utc=${new Date(utcMs).toISOString()}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || bi("Horizons недоступний", "Horizons unavailable"));
  return j;
}
