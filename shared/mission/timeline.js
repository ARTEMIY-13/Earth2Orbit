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
  marsEntryToPoweredDescent_s: { value: 360, source: "assumed (used only when EDL is not computed)" },
};

/**
 * Phases with UTC epochs. Each phase declares its model and whether it is
 * computed, estimated or assumed.
 */
export function buildPhases(transfer, descent, target, extras = {}, lang = "uk") {
  const { ascent, edl } = extras;
  const x = (uk, en) => (lang === "en" ? en : uk);
  const phases = [];
  if (transfer?.best) {
    const b = transfer.best;
    const dep = b.depUtc;
    const ascentDur = ascent?.ok ? ascent.t : ASSUMED_DURATIONS.ascent_s.value;
    const launch = dep - (ASSUMED_DURATIONS.parkingCoast_s.value + ascentDur) * 1000;
    phases.push({ id: "ascent", label: x("Старт і виведення на НОО", "Launch and ascent to LEO"), start: launch, end: launch + ascentDur * 1000, model: ascent?.ok ? ascent.model : x("не розраховано", "not computed"), kind: ascent?.ok ? "computed" : "assumed", samples: ascent?.samples });
    phases.push({ id: "parking", label: x("Паркувальна орбіта", "Parking orbit"), start: launch + ascentDur * 1000, end: dep, model: x("тривалість — припущення", "duration assumed"), kind: "assumed" });
    phases.push({ id: "cruise", label: target === "moon" ? x("Переліт до Місяця", "Transfer to the Moon") : x("Міжпланетний переліт", "Interplanetary cruise"), start: dep, end: b.arrUtc, model: x("Lambert, двотільна задача (", "Lambert, two-body (") + transfer.frame + ")", kind: "computed" });
    const marsEdl = target === "mars" && edl;
    const arrivalWait = target === "moon" ? ASSUMED_DURATIONS.moonOrbitBeforeDescent_s.value : marsEdl ? edl.end.t : target === "mars" ? ASSUMED_DURATIONS.marsEntryToPoweredDescent_s.value : 0;
    phases.push({ id: "arrival", label: target === "moon" ? x("Вихід на орбіту Місяця й гальмування", "Lunar orbit insertion and braking") : x("Вхід в атмосферу, гальмування, парашут (EDL)", "Entry, deceleration, parachute (EDL)"), start: b.arrUtc, end: b.arrUtc + arrivalWait * 1000, model: target === "moon" ? x("імпульсні маневри (оцінка)", "impulsive manoeuvres (estimate)") : marsEdl ? edl.model : x("EDL не розраховано", "EDL not computed"), kind: target === "moon" ? "estimated" : marsEdl ? "computed" : "assumed", samples: marsEdl ? edl.samples : undefined });
    if (descent?.ok) {
      const s = b.arrUtc + arrivalWait * 1000;
      phases.push({ id: "descent", label: x("Локальний моторний спуск", "Local powered descent"), start: s, end: s + descent.duration * 1000, model: descent.model, kind: "computed" });
    }
  } else if (descent?.ok) {
    phases.push({ id: "descent", label: x("Локальний моторний спуск", "Local powered descent"), start: 0, end: descent.duration * 1000, model: descent.model, kind: "computed", relative: true });
  }
  return phases;
}
