const cache = new Map();
const pending = new Map();
export function coordinates(lat, lon) {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  )
    throw new Error(
      "Координати мають бути числами: широта від −90 до 90, довгота від −180 до 180.",
    );
  return { lat, lon };
}
export async function climateAt(lat, lon, fetcher = fetch) {
  coordinates(lat, lon);
  const key = lat.toFixed(3) + "," + lon.toFixed(3);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  if (pending.has(key)) return pending.get(key);
  const query = new URLSearchParams({
    parameters: "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
    community: "RE",
    longitude: String(lon),
    latitude: String(lat),
    format: "JSON",
  });
  const source =
    "https://power.larc.nasa.gov/api/temporal/climatology/point?" + query;
  const task = (async () => {
    const response = await fetcher(source, {
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok)
      throw new Error("NASA POWER зараз не повертає дані. Спробуй пізніше.");
    const result = await response.json(),
      parameters = result.properties?.parameter;
    if (!parameters) throw new Error("NASA POWER повернув неповну відповідь.");
    const fill = result.header?.fill_value ?? -999;
    const value = (id) => {
      const n = parameters[id]?.ANN;
      return Number.isFinite(n) && n !== fill ? n : null;
    };
    const data = {
      lat,
      lon,
      temperatureC: value("T2M"),
      precipitationMmDay: value("PRECTOTCORR"),
      solarKwhM2Day: value("ALLSKY_SFC_SW_DWN"),
      period: result.header?.range || "Період не вказано джерелом",
      source,
      sourceName: "NASA POWER",
      datasets: result.header?.sources || [],
      units: result.parameters || {},
      fetchedAt: new Date().toISOString(),
      note: "Середні багаторічні значення для сітки даних. Регіональний клімат не замінює вимірювання на місці.",
    };
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { value: data, expires: Date.now() + 86400000 });
    return data;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
