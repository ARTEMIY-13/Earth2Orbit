// Vehicle presets. Every parameter is { value, unit, source } where source is a
// URL/citation or "assumed" (user/educational assumption). Presets are NOT
// certified data of any real spacecraft unless a parameter cites a source, and
// even then the overall model is a simplified educational one.

const p = (value, unit, source = "assumed") => ({ value, unit, source });
const NSSDC_LM =
  "assumed: approximate public historical value; to verify at https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C (unreachable when this preset was written, 2026-11-14)";

export const VEHICLE_PRESETS = [
  {
    id: "edu-robotic",
    name: "Навчальний робот-посадковий модуль",
    nameEn: "Educational robotic lander",
    real: false,
    note: "Вигаданий навчальний preset. Усі параметри — редаговані припущення.",
    lander: {
      dryMass: p(1200, "kg"),
      propellant: p(900, "kg"),
      thrustMax: p(9000, "N"),
      throttleMin: p(0.2, "fraction of max"),
      isp: p(320, "s"),
      footprintDiameter: p(4, "m"),
      maxSlope: p(12, "deg"),
      maxLegHeightDiff: p(0.3, "m"),
      maxVerticalTouchdown: p(2, "m/s"),
      maxHorizontalTouchdown: p(1, "m/s"),
      maxTilt: p(15, "deg"),
      reserveFraction: p(0.05, "fraction of propellant"),
      maxThrustTilt: p(45, "deg from vertical"),
    },
  },
  {
    id: "apollo-lm-like",
    name: "Спуск, подібний до Apollo LM (історичні маса/тяга, спрощено)",
    nameEn: "Apollo LM-like descent (historical mass/thrust, simplified)",
    real: false,
    note: "Маса, тяга й Isp — наближені історичні порядки величин, НЕ перевірені за першоджерелом у цій версії; пороги посадки та модель керування — припущення. Це не відтворення реального апарата.",
    lander: {
      dryMass: p(6800, "kg", NSSDC_LM + " (descent dry ≈2 030 kg + ascent stage ≈4 700 kg, rounded)"),
      propellant: p(8200, "kg", NSSDC_LM + " (descent propellant ≈8 200 kg)"),
      thrustMax: p(45000, "N", NSSDC_LM + " (descent engine ≈45 kN)"),
      throttleMin: p(0.1, "fraction of max", "assumed (deep-throttling descent engine)"),
      isp: p(311, "s", NSSDC_LM),
      footprintDiameter: p(9.4, "m", "assumed (approx. footpad span)"),
      maxSlope: p(12, "deg"),
      maxLegHeightDiff: p(0.6, "m"),
      maxVerticalTouchdown: p(3, "m/s"),
      maxHorizontalTouchdown: p(1.2, "m/s"),
      maxTilt: p(12, "deg"),
      reserveFraction: p(0.05, "fraction of propellant"),
      maxThrustTilt: p(60, "deg from vertical"),
    },
  },
  {
    id: "edu-mars",
    name: "Навчальний марсіанський посадковий модуль (фаза після парашута)",
    nameEn: "Educational Mars lander (post-parachute phase)",
    real: false,
    note: "Вигаданий preset. EDL до старту моторного спуску не моделюється.",
    lander: {
      dryMass: p(900, "kg"),
      propellant: p(400, "kg"),
      thrustMax: p(16000, "N"),
      throttleMin: p(0.15, "fraction of max"),
      isp: p(220, "s"),
      footprintDiameter: p(3, "m"),
      maxSlope: p(15, "deg"),
      maxLegHeightDiff: p(0.35, "m"),
      maxVerticalTouchdown: p(2.4, "m/s"),
      maxHorizontalTouchdown: p(1, "m/s"),
      maxTilt: p(15, "deg"),
      reserveFraction: p(0.05, "fraction of propellant"),
      maxThrustTilt: p(45, "deg from vertical"),
      dragArea: p(4, "m²·Cd"),
    },
  },
  {
    id: "edu-earth-vtvl",
    name: "Навчальний земний VTVL-стенд (тест-посадка на аналогу)",
    nameEn: "Educational Earth VTVL test vehicle",
    real: false,
    note: "Вигаданий preset для локальних тестових спусків на Землі. Земна гравітація й атмосфера відрізняються від Місяця/Марса.",
    lander: {
      dryMass: p(300, "kg"),
      propellant: p(220, "kg"),
      thrustMax: p(9000, "N"),
      throttleMin: p(0.25, "fraction of max"),
      isp: p(230, "s"),
      footprintDiameter: p(2.5, "m"),
      maxSlope: p(10, "deg"),
      maxLegHeightDiff: p(0.25, "m"),
      maxVerticalTouchdown: p(2, "m/s"),
      maxHorizontalTouchdown: p(0.8, "m/s"),
      maxTilt: p(12, "deg"),
      reserveFraction: p(0.05, "fraction of propellant"),
      maxThrustTilt: p(30, "deg from vertical"),
      dragArea: p(1.2, "m²·Cd"),
    },
  },
];

export const DEFAULT_PRESET_BY_BODY = { moon: "edu-robotic", mars: "edu-mars", earth: "edu-earth-vtvl" };
export const DEFAULT_START_BY_BODY = {
  moon: { altitude: 1500, downrange: 2000, horizontalSpeed: 40, verticalSpeed: -15, dt: 0.05 },
  mars: { altitude: 1500, downrange: 900, horizontalSpeed: 30, verticalSpeed: -55, dt: 0.05 },
  earth: { altitude: 300, downrange: 250, horizontalSpeed: 10, verticalSpeed: -5, dt: 0.05 },
};

export const STACK_DEFAULTS = {
  transferDryMass: p(4000, "kg"),
  transferPropellant: p(30000, "kg"),
  transferIsp: p(450, "s"),
  launcherLeoCapacity: p(45000, "kg", "assumed heavy-lift capacity to ~200 km LEO"),
  parkingAltitude: p(200000, "m"),
  ascentLosses: p(1600, "m/s", "assumed gravity+drag+steering losses (typical 1.3–2 km/s)"),
  arrivalOrbitAltitude: p(100000, "m"),
};

export function presetById(id) {
  return VEHICLE_PRESETS.find((v) => v.id === id) || VEHICLE_PRESETS[0];
}

/** Flatten {value} objects to plain numbers for the solvers. */
export function values(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "object" && v ? v.value : v]));
}

export function validateLander(l) {
  const errors = [];
  const pos = ["dryMass", "thrustMax", "isp", "footprintDiameter", "maxVerticalTouchdown", "maxHorizontalTouchdown"];
  for (const k of pos) if (!(l[k] > 0)) errors.push(`${k} must be > 0`);
  if (!(l.propellant >= 0)) errors.push("propellant must be ≥ 0");
  if (!(l.throttleMin >= 0 && l.throttleMin <= 1)) errors.push("throttleMin must be in [0,1]");
  if (!(l.maxSlope > 0 && l.maxSlope < 60)) errors.push("maxSlope must be in (0,60) deg");
  return errors;
}
