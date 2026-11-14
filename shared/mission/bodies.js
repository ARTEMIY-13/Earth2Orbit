// Physical constants (SI). Each value carries its source.
export const G0 = 9.80665; // m/s², standard gravity used ONLY in the Isp definition
export const AU = 149597870700; // m (IAU 2012)
export const DAY = 86400;

const FACT = "https://nssdc.gsfc.nasa.gov/planetary/factsheet/";

export const BODIES = {
  sun: { id: "sun", GM: 1.32712440018e20, radius: 695700e3, source: "IAU / JPL DE440" },
  earth: {
    id: "earth",
    GM: 3.986004418e14,
    radius: 6378137,
    meanRadius: 6371000,
    rotationRate: 7.2921159e-5,
    atmosphere: { model: "exponential (educational)", rho0: 1.225, H: 8500 },
    soi: 9.24e8,
    source: FACT + "earthfact.html",
  },
  moon: {
    id: "moon",
    GM: 4.9028e12,
    radius: 1737400,
    meanRadius: 1737400,
    rotationRate: 2.6617e-6,
    atmosphere: null,
    soi: 6.61e7,
    source: FACT + "moonfact.html",
  },
  mars: {
    id: "mars",
    GM: 4.282837e13,
    radius: 3396200,
    meanRadius: 3389500,
    rotationRate: 7.088218e-5,
    atmosphere: { model: "exponential (educational): ρ0 ≈ 0.020 kg/m³, H ≈ 11.1 km", rho0: 0.02, H: 11100 },
    soi: 5.77e8,
    source: FACT + "marsfact.html",
  },
};

export function surfaceGravity(bodyId) {
  const b = BODIES[bodyId];
  return b.GM / b.meanRadius ** 2;
}

export function airDensity(bodyId, altitude_m) {
  const atm = BODIES[bodyId]?.atmosphere;
  if (!atm) return 0;
  return atm.rho0 * Math.exp(-Math.max(0, altitude_m) / atm.H);
}
