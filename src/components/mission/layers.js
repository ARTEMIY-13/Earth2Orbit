// Colour ramps (sequential, colour-blind-safe-ish) + text legends.
const ELEV = [[0, [24, 38, 74]], [0.25, [44, 98, 140]], [0.5, [92, 160, 140]], [0.75, [200, 190, 120]], [1, [245, 240, 225]]];
function ramp(stops, f) {
  f = Math.max(0, Math.min(1, f));
  for (let i = 1; i < stops.length; i++)
    if (f <= stops[i][0]) {
      const [a, ca] = stops[i - 1],
        [b, cb] = stops[i];
      const k = (f - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k));
    }
  return stops[stops.length - 1][1];
}
const SLOPE = [[0, [240, 249, 232]], [0.33, [123, 204, 196]], [0.66, [43, 140, 190]], [1, [8, 64, 129]]];

export const LAYERS = [
  { id: "elevation", label: "Висоти + відмивка", labelEn: "Elevation + hillshade" },
  { id: "slope", label: "Ухили", labelEn: "Slope" },
  { id: "risk", label: "Ризик ухилу (preset)", labelEn: "Slope risk (preset)" },
  { id: "roughness", label: "Шорсткість", labelEn: "Roughness" },
];

export function layerColors(layer, data, layers, maxSlope, w, h) {
  const rgb = new Uint8Array(w * h * 3);
  let zmin = Infinity,
    zmax = -Infinity,
    rmax = 0;
  for (const v of data)
    if (v === v) {
      if (v < zmin) zmin = v;
      if (v > zmax) zmax = v;
    }
  if (layers?.roughness) for (const v of layers.roughness) if (v === v) rmax = Math.max(rmax, v);
  for (let i = 0; i < w * h; i++) {
    let c;
    const z = data[i];
    const s = layers?.slope?.[i];
    if (z !== z) c = [70, 70, 80];
    else if (layer === "slope") c = s === s ? ramp(SLOPE, s / 40) : [120, 120, 130];
    else if (layer === "risk") c = s !== s ? [120, 120, 130] : s > maxSlope ? [200, 40, 50] : s > 0.7 * maxSlope ? [235, 170, 40] : [60, 170, 110];
    else if (layer === "roughness") {
      const r = layers?.roughness?.[i];
      c = r === r ? ramp(SLOPE, Math.sqrt(r / (rmax || 1))) : [120, 120, 130];
    } else {
      c = ramp(ELEV, (z - zmin) / (zmax - zmin || 1));
      const a = layers?.aspect?.[i];
      if (s === s) {
        const az = a === a ? (a * Math.PI) / 180 : 0;
        const sl = (s * Math.PI) / 180,
          zen = (45 * Math.PI) / 180,
          sunAz = (315 * Math.PI) / 180;
        const shade = Math.max(0, Math.cos(zen) * Math.cos(sl) + Math.sin(zen) * Math.sin(sl) * Math.cos(sunAz - az));
        c = c.map((v) => Math.round(v * (0.45 + 0.75 * shade)));
      }
    }
    rgb[i * 3] = Math.min(255, c[0]);
    rgb[i * 3 + 1] = Math.min(255, c[1]);
    rgb[i * 3 + 2] = Math.min(255, c[2]);
  }
  return { rgb, zmin, zmax, rmax };
}

