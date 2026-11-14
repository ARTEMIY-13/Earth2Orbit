// Georeferencing for the DEM grids used by Earth2Orbit.
// Every grid keeps its *native* projection; we never re-project Moon/Mars data
// into Earth EPSG:4326. Pixel (col, row) = (0,0) is the top-left pixel CENTRE.
// Latitudes are planetocentric (Moon/Mars products) or geodetic-on-sphere for
// Web Mercator (Earth), longitudes are east-positive in [-180, 180).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const WEB_MERCATOR_RADIUS_M = 6378137;
// WGS84 ellipsoid (for Earth geographic grids: Copernicus DEM, NASADEM)
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** Meridional (M) and prime-vertical (N) radii of curvature at latitude (deg). */
export function wgs84Radii(lat) {
  const s = Math.sin(lat * D2R);
  const w = 1 - WGS84_E2 * s * s;
  return { M: (WGS84_A * (1 - WGS84_E2)) / w ** 1.5, N: WGS84_A / Math.sqrt(w) };
}

export function wrapLon(lon) {
  let l = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (l === -180 && lon > 0) l = 180;
  return l;
}

/**
 * Returns { lat, lon } in degrees for a fractional pixel position.
 * georef.type: "polar-stereographic" | "simple-cylindrical" | "web-mercator" | "local-metric"
 */
export function pixelToLatLon(georef, col, row) {
  switch (georef.type) {
    case "polar-stereographic": {
      // PDS LOLA DSMAP_POLAR convention (sample I, line J are 1-based there).
      const { radius_m, scale_m, N, I0, J0, pole } = georef;
      const I = I0 + col,
        J = J0 + row;
      const X = (I - N / 2 - 0.5) * scale_m;
      const Y = (J - N / 2 - 0.5) * scale_m;
      const rho = Math.hypot(X, Y);
      const colat = 2 * Math.atan(rho / (2 * radius_m)) * R2D;
      if (pole < 0) {
        // south: X = Rs·sin(lon), Y = Rs·cos(lon) with Rs < 0
        return { lat: -90 + colat, lon: wrapLon(Math.atan2(-X, -Y) * R2D) };
      }
      return { lat: 90 - colat, lon: wrapLon(Math.atan2(X, Y) * R2D) };
    }
    case "simple-cylindrical": {
      const { lat0, lon0, ppd } = georef;
      return { lat: lat0 - row / ppd, lon: wrapLon(lon0 + col / ppd) };
    }
    case "web-mercator": {
      const { zoom, px0, py0, tileSize = 256 } = georef;
      const world = tileSize * 2 ** zoom;
      const px = px0 + col,
        py = py0 + row;
      const lon = (px / world) * 360 - 180;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / world))) * R2D;
      return { lat, lon: wrapLon(lon) };
    }
    case "geographic": {
      const { lat0, lon0, dLat, dLon } = georef; // lat0/lon0 = centre of pixel (0,0)
      return { lat: lat0 - row * dLat, lon: wrapLon(lon0 + col * dLon) };
    }
    case "local-metric": {
      // Synthetic test grids: centre lat/lon + equirectangular offset.
      const { lat0 = 0, lon0 = 0, radius_m = 1737400, spacing_m } = georef;
      const lat = lat0 - (row * spacing_m) / radius_m * R2D;
      const lon = lon0 + ((col * spacing_m) / (radius_m * Math.cos(lat0 * D2R))) * R2D;
      return { lat, lon: wrapLon(lon) };
    }
    default:
      throw new Error("Unknown georef type " + georef.type);
  }
}

/** Inverse: lat/lon (deg) → fractional pixel { col, row }. */
export function latLonToPixel(georef, lat, lon) {
  switch (georef.type) {
    case "polar-stereographic": {
      const { radius_m, scale_m, N, I0, J0, pole } = georef;
      const Rs = 2 * radius_m * Math.tan(((90 - Math.abs(lat)) * Math.PI) / 360) * Math.sign(lat || pole);
      const X = Rs * Math.sin(lon * D2R);
      const Y = Rs * Math.cos(lon * D2R);
      return { col: X / scale_m + N / 2 + 0.5 - I0, row: Y / scale_m + N / 2 + 0.5 - J0 };
    }
    case "simple-cylindrical": {
      const { lat0, lon0, ppd } = georef;
      let dl = wrapLon(lon - lon0);
      return { col: dl * ppd, row: (lat0 - lat) * ppd };
    }
    case "web-mercator": {
      const { zoom, px0, py0, tileSize = 256 } = georef;
      const world = tileSize * 2 ** zoom;
      const px = ((lon + 180) / 360) * world;
      const s = Math.sin(lat * D2R);
      const py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
      return { col: px - px0, row: py - py0 };
    }
    case "geographic": {
      const { lat0, lon0, dLat, dLon } = georef;
      return { col: wrapLon(lon - lon0) / dLon, row: (lat0 - lat) / dLat };
    }
    case "local-metric": {
      const { lat0 = 0, lon0 = 0, radius_m = 1737400, spacing_m } = georef;
      return {
        col: ((lon - lon0) * D2R * radius_m * Math.cos(lat0 * D2R)) / spacing_m,
        row: ((lat0 - lat) * D2R * radius_m) / spacing_m,
      };
    }
    default:
      throw new Error("Unknown georef type " + georef.type);
  }
}

/**
 * Ground spacing in metres between pixel centres at a given row (and col for
 * polar grids): { dx, dy }. Derivatives must use these, never degrees.
 */
export function groundSpacing(georef, col, row) {
  switch (georef.type) {
    case "polar-stereographic": {
      // Stereographic scale factor k = 2 / (1 + sin|lat|); ground = map / k.
      const { lat } = pixelToLatLon(georef, col, row);
      const k = 2 / (1 + Math.sin(Math.abs(lat) * D2R));
      const d = georef.scale_m / k;
      return { dx: d, dy: d };
    }
    case "simple-cylindrical": {
      const { radius_m, ppd, lat0 } = georef;
      const dy = (radius_m * D2R) / ppd;
      const lat = lat0 - row / ppd;
      return { dx: dy * Math.cos(lat * D2R), dy };
    }
    case "web-mercator": {
      const { zoom, tileSize = 256 } = georef;
      const { lat } = pixelToLatLon(georef, col, row);
      const d = ((2 * Math.PI * WEB_MERCATOR_RADIUS_M) / (tileSize * 2 ** zoom)) * Math.cos(lat * D2R);
      return { dx: d, dy: d };
    }
    case "geographic": {
      const lat = georef.lat0 - row * georef.dLat;
      const { M, N } = wgs84Radii(lat);
      return { dx: N * Math.cos(lat * D2R) * georef.dLon * D2R, dy: M * georef.dLat * D2R };
    }
    case "local-metric":
      return { dx: georef.spacing_m, dy: georef.spacing_m };
    default:
      throw new Error("Unknown georef type " + georef.type);
  }
}

/** Great-circle distance on a sphere of given radius (m). */
export function haversine(lat1, lon1, lat2, lon2, radius_m) {
  const p1 = lat1 * D2R,
    p2 = lat2 * D2R;
  const dp = p2 - p1,
    dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius_m * Math.asin(Math.min(1, Math.sqrt(a)));
}
