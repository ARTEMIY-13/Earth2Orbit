// Imaging geometry of real orbital images covering a site, taken from PDS
// product metadata via the PDS Geosciences Orbital Data Explorer (ODE) REST API.
// No SPICE computation is done here: values are the ones published with each
// product (ODE fields, LROC index table). Anything not published is `null`
// with an explicit reason.
//
// Definitions (per PDS / instrument SIS, relative to the target's reference
// surface — sphere/ellipsoid — at the image centre, NOT the DEM slope):
//   emission angle  = angle between the surface normal and the direction to the spacecraft
//   incidence angle = angle between the surface normal and the direction to the Sun
//   phase angle     = angle Sun–surface point–spacecraft
//   spacecraft altitude = distance from spacecraft to the reference surface

export const ODE_ENDPOINT = "https://oderest.rsl.wustl.edu/live2/";
export const ODE_DOC = "https://oderest.rsl.wustl.edu/ODE_REST_V2.1.pdf";

export const IMAGING_PRODUCTS = {
  moon: { target: "moon", ihid: "LRO", iid: "LROC", pt: "CDRNAC4", label: "LRO LROC NAC (CDR, PDS4)", radius_km: 1737.4 },
  mars: { target: "mars", ihid: "MRO", iid: "HIRISE", pt: "RDRV11", label: "MRO HiRISE (RDR)", radius_km: 3396.19 },
};
export const DTM_PRODUCTS = {
  moon: { target: "moon", ihid: "LRO", iid: "LROC", pt: "ASPDTM", label: "LROC NAC DTM (ASP)" },
  mars: { target: "mars", ihid: "MRO", iid: "HIRISE", pt: "DTM", label: "HiRISE DTM" },
};

const lon360 = (lon) => ((lon % 360) + 360) % 360;

/** Builds an ODE product query URL around a point (degrees, east-positive). */
export function odeQueryUrl(spec, lat, lon, { radiusDeg = 0.02, limit = 6 } = {}) {
  const polar = Math.abs(lat) > 85;
  const q = new URLSearchParams({
    query: "product",
    results: "m",
    output: "JSON",
    target: spec.target,
    ihid: spec.ihid,
    iid: spec.iid,
    pt: spec.pt,
    minlat: String(Math.max(-90, lat - radiusDeg)),
    maxlat: String(Math.min(90, lat + radiusDeg)),
    westlon: polar ? "0" : String(lon360(lon - radiusDeg / Math.max(0.05, Math.cos((lat * Math.PI) / 180)))),
    eastlon: polar ? "360" : String(lon360(lon + radiusDeg / Math.max(0.05, Math.cos((lat * Math.PI) / 180)))),
    limit: String(limit),
  });
  return ODE_ENDPOINT + "?" + q;
}

const num = (v) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Parses a CSV-like PDS index record (quoted strings without embedded commas). */
export function parseIndexRecord(rec) {
  return [...String(rec).matchAll(/"([^"]*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2]).trim());
}

/**
 * LROC: spacecraft altitude etc. from the PDS index record that ODE echoes in
 * ODE_notes. Anchored on the emission/incidence/phase triple (column order in
 * the LROC INDEX.LBL: EMISSION, INCIDENCE, PHASE, NORTH_AZIMUTH, SUB_SOLAR_AZIMUTH,
 * SUB_SOLAR_LAT, SUB_SOLAR_LON, SUB_SPACECRAFT_LAT, SUB_SPACECRAFT_LON, …,
 * SPACECRAFT_ALTITUDE (+21), TARGET_CENTER_DISTANCE (+22)), then sanity-checked.
 */
export function lrocIndexGeometry(product, radius_km) {
  const notes = [].concat(product?.ODE_notes?.ODE_note || []);
  const i = notes.findIndex((n) => String(n).startsWith("NOTE: Index Record"));
  if (i < 0 || !notes[i + 1]) return null;
  const f = parseIndexRecord(notes[i + 1]);
  const em = num(product.Emission_angle),
    inc = num(product.Incidence_angle),
    ph = num(product.Phase_angle);
  let k = -1;
  for (let j = 0; j + 2 < f.length; j++)
    if (Math.abs(num(f[j]) - em) < 1e-6 && Math.abs(num(f[j + 1]) - inc) < 1e-6 && Math.abs(num(f[j + 2]) - ph) < 1e-6) {
      k = j;
      break;
    }
  if (k < 0) return null;
  const alt = num(f[k + 21]),
    tcd = num(f[k + 22]);
  const consistent = alt !== null && tcd !== null && Math.abs(alt + radius_km - tcd) < 20;
  return consistent
    ? {
        spacecraftAltitude_km: alt,
        targetCenterDistance_km: tcd,
        northAzimuth_deg: num(f[k + 3]),
        subSolarAzimuth_deg: num(f[k + 4]),
        subSpacecraftLat: num(f[k + 7]),
        subSpacecraftLon: num(f[k + 8]),
        source: "LROC PDS index table (SPACECRAFT_ALTITUDE, TARGET_CENTER_DISTANCE), echoed by ODE",
      }
    : null;
}

function polygonFromWkt(wkt) {
  const m = /POLYGON\s*\(\((.*?)\)\)/i.exec(wkt || "");
  if (!m) return null;
  return m[1].split(",").map((p) => {
    const [lon, lat] = p.trim().split(/\s+/).map(Number);
    return { lat, lon: lon > 180 ? lon - 360 : lon };
  });
}

/** Normalises an ODE JSON response for the given body. */
export function parseOdeProducts(json, body) {
  const spec = IMAGING_PRODUCTS[body];
  const r = json?.ODEResults;
  if (!r) throw new Error("ODE: unexpected response");
  if (r.Status === "ERROR") throw new Error("ODE: " + (r.Error || "error"));
  const list = r.Products?.Product ? [].concat(r.Products.Product) : [];
  return list.map((p) => {
    const lroc = body === "moon" ? lrocIndexGeometry(p, spec.radius_km) : null;
    return {
      productId: p.pdsid || p.Product_name || p.Observation_id,
      instrument: spec?.label,
      observationUtc: p.Observation_time || p.UTC_start_time || null,
      emission_deg: num(p.Emission_angle),
      incidence_deg: num(p.Incidence_angle),
      phase_deg: num(p.Phase_angle),
      resolution_m: num(p.Map_scale) ?? num(p.Map_resolution),
      solarLongitude_deg: num(p.Solar_longitude),
      centerLat: num(p.Center_latitude),
      centerLon: num(p.Center_longitude) !== null ? ((num(p.Center_longitude) + 540) % 360) - 180 : null,
      spacecraftAltitude_km: lroc?.spacecraftAltitude_km ?? null,
      spacecraftAltitudeSource: lroc ? "lroc-index" : body === "mars" ? "not-published-needs-spice" : "not-in-index",
      subSpacecraft: lroc ? { lat: lroc.subSpacecraftLat, lon: lroc.subSpacecraftLon } : null,
      northAzimuth_deg: lroc?.northAzimuth_deg ?? null,
      footprint: polygonFromWkt(p.Footprint_C0_geometry || p.Footprint_geometry),
      labelUrl: p.LabelURL || null,
      productUrl: p.ProductURL || p.External_url || null,
    };
  });
}

export function parseOdeDtms(json) {
  const r = json?.ODEResults;
  if (!r || r.Status === "ERROR") return [];
  const list = r.Products?.Product ? [].concat(r.Products.Product) : [];
  const idFromUrl = (u) => {
    try {
      return new URL(u).searchParams.get("product_id");
    } catch {
      return null;
    }
  };
  return list.map((p) => ({ productId: p.pdsid || p.Product_name || p.Observation_id || idFromUrl(p.FilesURL || p.ProductURL), filesUrl: p.FilesURL || p.ProductURL || null, footprint: polygonFromWkt(p.Footprint_C0_geometry || p.Footprint_geometry) }));
}
