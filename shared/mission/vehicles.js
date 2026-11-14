// Vehicle presets. Every parameter is { value, unit, source } where source is a
// URL/citation or "assumed" (user/educational assumption). Presets are NOT
// certified data of any real spacecraft unless a parameter cites a source, and
// even then the overall model is a simplified educational one.

const p = (value, unit, source = "assumed") => ({ value, unit, source });
// Primary sources (NASA NTRS), checked 2026-11-14:
const A11_MR = "Apollo 11 Mission Report MSC-00171 (1969), Table A-I 'Mass properties', p. A-11 — https://ntrs.nasa.gov/citations/19700008096";
const TN_D7143 = "NASA TN D-7143, Apollo Experience Report: Descent Propulsion System (1973), 'Descent Engine' design requirements — https://ntrs.nasa.gov/citations/19730011150";

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
    name: "Спуск за даними Apollo 11 LM (маси, тяга, Isp — NASA; керування спрощене)",
    nameEn: "Apollo 11 LM-based descent (NASA masses, thrust, Isp; simplified guidance)",
    real: false,
    note: "Маси (Apollo 11 Mission Report, табл. A-I), максимальна тяга, діапазон дроселювання й Isp (NASA TN D-7143) взято з першоджерел NASA. Пороги посадки, геометрія опор і модель керування — припущення. Це не відтворення реального польоту: реальний LM мав фіксовану точку тяги 92.5 % і зону 10–65 %, тут дроселювання безперервне.",
    lander: {
      dryMass: p(7327, "kg", A11_MR + ": 'Lunar landing' 16 153.2 lb = 7 327 kg (маса після посадки; залишок палива вважається недоступним)"),
      propellant: p(7824, "kg", A11_MR + ": 'Descent orbit insertion — cutoff' 33 401.6 lb = 15 151 kg мінус маса посадки = 7 824 kg (паливо DPS + RCS між DOI і посадкою)"),
      thrustMax: p(46706, "N", TN_D7143 + ": maximum-rated thrust 10 500 lbf = 46.7 kN"),
      throttleMin: p(0.1, "fraction of max", TN_D7143 + ": throttling ratio 10:1"),
      isp: p(305, "s", TN_D7143 + ": specific impulse (end of duty cycle) 305 lbf·s/lbm"),
      footprintDiameter: p(9.4, "m", "assumed (approx. footpad span; не перевірено за першоджерелом)"),
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
