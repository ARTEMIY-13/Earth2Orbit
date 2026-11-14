// Time scales. Mission epochs are stored as UTC milliseconds (Unix). Ephemeris
// evaluation uses TDB, obtained explicitly: UTC → TAI (leap seconds) → TT (+32.184 s)
// → TDB (periodic term, |TDB−TT| < 2 ms). Never use Date.now() / animation
// time as a physical epoch.

// TAI−UTC (s) from the IERS Bulletin C table (dates of change, UTC).
const LEAP = [
  ["1972-01-01", 10], ["1972-07-01", 11], ["1973-01-01", 12], ["1974-01-01", 13],
  ["1975-01-01", 14], ["1976-01-01", 15], ["1977-01-01", 16], ["1978-01-01", 17],
  ["1979-01-01", 18], ["1980-01-01", 19], ["1981-07-01", 20], ["1982-07-01", 21],
  ["1983-07-01", 22], ["1985-07-01", 23], ["1988-01-01", 24], ["1990-01-01", 25],
  ["1991-01-01", 26], ["1992-07-01", 27], ["1993-07-01", 28], ["1994-07-01", 29],
  ["1996-01-01", 30], ["1997-07-01", 31], ["1999-01-01", 32], ["2006-01-01", 33],
  ["2009-01-01", 34], ["2012-07-01", 35], ["2015-07-01", 36], ["2017-01-01", 37],
].map(([d, s]) => [Date.parse(d + "T00:00:00Z"), s]);

export const LEAP_SECONDS_SOURCE =
  "IERS Bulletin C (TAI−UTC = 37 s since 2017-01-01; future leap seconds unknown — assumed none)";

export function taiMinusUtc(utcMs) {
  let v = 10;
  for (const [t, s] of LEAP) if (utcMs >= t) v = s;
  return v;
}

export const JD_UNIX_EPOCH = 2440587.5;
export const J2000_JD = 2451545.0;

export function utcToJdUtc(utcMs) {
  return JD_UNIX_EPOCH + utcMs / 86400000;
}

/** Julian Date in TT. */
export function utcToJdTT(utcMs) {
  return utcToJdUtc(utcMs) + (taiMinusUtc(utcMs) + 32.184) / 86400;
}

/** Julian Date in TDB (Fairhead & Bretagnon leading terms). */
export function utcToJdTDB(utcMs) {
  const jdTT = utcToJdTT(utcMs);
  const g = ((357.53 + 0.98560028 * (jdTT - J2000_JD)) * Math.PI) / 180;
  return jdTT + (0.001657 * Math.sin(g) + 0.000014 * Math.sin(2 * g)) / 86400;
}

/** Seconds of TDB past J2000 for an UTC epoch. */
export function tdbSecondsJ2000(utcMs) {
  return (utcToJdTDB(utcMs) - J2000_JD) * 86400;
}

/** Offset (ms) of a time zone from UTC at a given instant, via Intl. */
export function zoneOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Parse a wall-clock "YYYY-MM-DDTHH:mm" in a zone → UTC ms. */
export function zonedToUtc(local, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error("Невірний формат дати/часу");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (timeZone === "UTC") return guess;
  let utc = guess - zoneOffsetMs(guess, timeZone);
  utc = guess - zoneOffsetMs(utc, timeZone);
  return utc;
}

export function formatUtc(utcMs) {
  return new Date(utcMs).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function formatZone(utcMs, timeZone, locale = "uk-UA") {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(utcMs));
}

export function formatDuration(seconds) {
  const s = Math.abs(seconds);
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  return (seconds < 0 ? "−" : "") + (d ? `${d} д ` : "") + `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
