// Bilingual messages for code that has no React context (libs, worker).
// A message is "uk‖en"; the UI shows the half for the active language.
export const SEP = "‖";
export const bi = (uk, en) => uk + SEP + en;
export function pick(msg, lang) {
  const s = String(msg ?? "");
  if (!s.includes(SEP)) return s;
  const [uk, en] = s.split(SEP);
  return lang === "en" ? en : uk;
}
