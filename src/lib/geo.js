const rad = d => (d * Math.PI) / 180;

/** Great-circle distance in degrees between two lon/lat points. */
export function angularDistance(lon1, lat1, lon2, lat2) {
  const a =
    Math.sin(rad(lat1)) * Math.sin(rad(lat2)) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (Math.acos(Math.min(1, Math.max(-1, a))) * 180) / Math.PI;
}

export function formatCoords(lat, lon) {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function graticule() {
  const features = [];
  const line = coords =>
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  for (let lon = -180; lon <= 180; lon += 30) {
    const c = [];
    for (let lat = -90; lat <= 90; lat += 5) c.push([lon, lat]);
    line(c);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const c = [];
    for (let lon = -180; lon <= 180; lon += 5) c.push([lon, lat]);
    line(c);
  }
  return { type: 'FeatureCollection', features };
}
