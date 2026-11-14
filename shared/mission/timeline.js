// Mission timeline. Visualisation and charts read the SAME precomputed states;
// playback speed only changes which time is displayed, never the physics.

/** Linear interpolation of a sample array sorted by key `t`. */
export function stateAt(samples, t, key = "t") {
  if (!samples?.length) return null;
  if (t <= samples[0][key]) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last[key]) return last;
  let lo = 0,
    hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][key] <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo],
    b = samples[hi];
  const f = (t - a[key]) / (b[key] - a[key] || 1);
  const out = {};
  for (const k of Object.keys(a)) {
    const va = a[k],
      vb = b[k];
    if (typeof va === "number" && typeof vb === "number") out[k] = va + (vb - va) * f;
    else if (Array.isArray(va) && Array.isArray(vb)) out[k] = va.map((x, i) => x + (vb[i] - x) * f);
    else out[k] = f < 0.5 ? va : vb;
  }
  return out;
}

export const ASSUMED_DURATIONS = {
  ascent_s: { value: 600, source: "assumed" },
  parkingCoast_s: { value: 5400, source: "assumed (≈1 orbit)" },
  moonOrbitBeforeDescent_s: { value: 86400, source: "assumed" },
  marsEntryToPoweredDescent_s: { value: 360, source: "assumed (EDL not modelled)" },
};

/**
 * Phases with UTC epochs. Each phase declares its model and whether it is
 * computed, estimated or assumed.
 */
export function buildPhases(transfer, descent, target) {
  const phases = [];
  if (transfer?.best) {
    const b = transfer.best;
    const dep = b.depUtc;
    const launch = dep - (ASSUMED_DURATIONS.parkingCoast_s.value + ASSUMED_DURATIONS.ascent_s.value) * 1000;
    phases.push({ id: "ascent", label: "Старт і виведення на НОО", start: launch, end: launch + ASSUMED_DURATIONS.ascent_s.value * 1000, model: "не моделюється — бюджетна оцінка Δv", kind: "assumed" });
    phases.push({ id: "parking", label: "Паркувальна орбіта", start: launch + ASSUMED_DURATIONS.ascent_s.value * 1000, end: dep, model: "тривалість — припущення", kind: "assumed" });
    phases.push({ id: "cruise", label: target === "moon" ? "Переліт до Місяця" : "Міжпланетний переліт", start: dep, end: b.arrUtc, model: "Lambert, двотільна задача (" + transfer.frame + ")", kind: "computed" });
    const arrivalWait = target === "moon" ? ASSUMED_DURATIONS.moonOrbitBeforeDescent_s.value : target === "mars" ? ASSUMED_DURATIONS.marsEntryToPoweredDescent_s.value : 0;
    phases.push({ id: "arrival", label: target === "moon" ? "Вихід на орбіту Місяця й гальмування" : "Прибуття / вхід в атмосферу", start: b.arrUtc, end: b.arrUtc + arrivalWait * 1000, model: target === "moon" ? "імпульсні маневри (оцінка)" : "EDL не моделюється", kind: target === "moon" ? "estimated" : "assumed" });
    if (descent?.ok) {
      const s = b.arrUtc + arrivalWait * 1000;
      phases.push({ id: "descent", label: "Локальний моторний спуск", start: s, end: s + descent.duration * 1000, model: descent.model, kind: "computed" });
    }
  } else if (descent?.ok) {
    phases.push({ id: "descent", label: "Локальний моторний спуск", start: 0, end: descent.duration * 1000, model: descent.model, kind: "computed", relative: true });
  }
  return phases;
}
