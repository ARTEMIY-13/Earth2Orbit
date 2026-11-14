// Офлайн-гід ОРІ: відповідає з даних каталогу, без зовнішнього AI та ключів.
import { translations } from "../src/i18n/translations.js";
const has = (q, words) => words.some((w) => q.includes(w));
const targetName = { moon: "Місяць", mars: "Марс", earth: "Земля" };
const traitName = {
  aridity: "сухість", robotics: "тести роботів", astrobiology: "астробіологія",
  cold: "холод", ice: "лід", volcanic: "вулканізм", basalt: "базальти",
  dust: "пил", radiation: "радіація", altitude: "висота", isolation: "ізоляція",
};
export function localAnswer(world, site, messages, lang = "uk") {
  if (lang === "en") return localAnswerEnglish(world, site, messages);
  const q = String(messages.at(-1)?.content || "").toLowerCase();
  const s = site.science || {};
  const coords = `${site.lat}°, ${site.lon}°`;
  const targets = (s.targets || []).map((t) => targetName[t] || t).join(", ");
  const traits = (s.traits || []).map((t) => traitName[t] || t).join(", ");
  const uses = (s.uses || []).join("; ");
  const parts = [];
  if (has(q, ["координат", "де ", "де?", "розташ", "широт", "довгот", "lat", "lon"]))
    parts.push(`${site.name} — ${world.name}, координати ${coords}.`);
  if (has(q, ["чому", "аналог", "схож", "навіщо", "для чого", "why"]))
    parts.push(
      `${site.name} — ${site.type.toLowerCase()}${targets ? ` (аналог для: ${targets})` : ""}. ${site.description}` +
        (traits ? ` Ключові риси: ${traits}.` : ""),
    );
  if (has(q, ["доказ", "дослід", "наук", "джерел", "nasa", "місі", "хто", "організ"]))
    parts.push(
      `${s.summary || "Детальних доказів для цієї локації немає."}` +
        (s.organization ? ` Організація: ${s.organization}.` : "") +
        (s.sources?.length ? ` Джерело: ${s.sources[0].title}.` : ""),
    );
  if (has(q, ["використ", "тест", "випроб", "практи", "робот"]) && uses)
    parts.push(`Тут використовують для: ${uses}.`);
  if (has(q, ["обмеж", "відміннос", "різниц", "недолік", "проблем", "ризик", "limit"]))
    parts.push(`Обмеження аналога: ${s.limit || "потрібні окремі дослідження"}`);
  if (has(q, ["баз", "жити", "придат", "селит", "колон"]))
    parts.push(
      "Придатність для бази визначають не лише кліматом: потрібні геологія, вода, енергія, радіація й логістика. " +
        `Для ${site.name} відомо: ${s.summary || site.description} ${s.limit ? "Обмеження: " + s.limit : ""}`,
    );
  if (has(q, ["клімат", "температур", "опад", "погод"]))
    parts.push(
      "Клімат цієї точки можна переглянути у вкладці «Клімат» (дані NASA POWER). Кліматичні пороги — лише фільтр, а не доказ придатності.",
    );
  if (!parts.length)
    parts.push(
      `${site.name} (${world.name}, ${coords}). ${site.description}` +
        (s.summary ? ` ${s.summary}` : "") +
        (s.limit ? ` Обмеження: ${s.limit}` : "") +
        " Запитай про координати, докази, обмеження, використання або придатність для бази.",
    );
  return parts.join("\n\n");
}

function localAnswerEnglish(world, site, messages) {
  const translate = (text) => translations.en[text] || text;
  const q = String(messages.at(-1)?.content || "").toLowerCase();
  const s = site.science || {};
  const coords = `${site.lat}°, ${site.lon}°`;
  const targets = (s.targets || [])
    .map((target) => translate({ moon: "Місяць", mars: "Марс" }[target] || target))
    .join(", ");
  const traits = (s.traits || [])
    .map((trait) => translate(traitName[trait] || trait))
    .join(", ");
  const uses = (s.uses || []).map(translate).join("; ");
  const parts = [];
  if (has(q, ["coordinate", "where", "latitude", "longitude", "location"]))
    parts.push(`${translate(site.name)} is on ${translate(world.name)} at ${coords}.`);
  if (has(q, ["why", "analog", "similar", "purpose"]))
    parts.push(
      `${translate(site.name)} is a ${translate(site.type).toLowerCase()}${targets ? ` (an analog for: ${targets})` : ""}. ${translate(site.description)}` +
        (traits ? ` Key features: ${traits}.` : ""),
    );
  if (has(q, ["evidence", "research", "science", "source", "nasa", "mission"]))
    parts.push(
      `${translate(s.summary || "Детальних доказів для цієї локації немає.")}` +
        (s.organization ? ` Organization: ${s.organization}.` : "") +
        (s.sources?.length ? ` Source: ${translate(s.sources[0].title)}.` : ""),
    );
  if (has(q, ["use", "test", "experiment", "robot"]) && uses)
    parts.push(`This site is used for: ${uses}.`);
  if (has(q, ["limit", "difference", "risk", "problem"]))
    parts.push(`Limitations of the analog: ${translate(s.limit || "потрібні окремі дослідження")}`);
  if (has(q, ["base", "live", "habitable", "settle", "colony"]))
    parts.push(
      `Base suitability depends on more than climate: geology, water, energy, radiation, and logistics all matter. For ${translate(site.name)}: ${translate(s.summary || site.description)} ${s.limit ? `Limitations: ${translate(s.limit)}` : ""}`,
    );
  if (has(q, ["climate", "temperature", "rain", "weather"]))
    parts.push("Climate data for this location is available from NASA POWER. Climate thresholds are only a filter, not evidence of suitability.");
  if (!parts.length)
    parts.push(
      `${translate(site.name)} (${translate(world.name)}, ${coords}). ${translate(site.description)}` +
        (s.summary ? ` ${translate(s.summary)}` : "") +
        (s.limit ? ` Limitations: ${translate(s.limit)}` : "") +
        " Ask about coordinates, evidence, limitations, uses, or base suitability.",
    );
  return parts.join("\n\n");
}
