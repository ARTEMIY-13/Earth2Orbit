import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function ClimatePanel({ lat, lon }) {
  const { tr } = useLang();
  const [value, setValue] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setValue(null);
    setError("");
    apiFetch(`/api/climate?lat=${lat}&lon=${lon}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Кліматичні дані недоступні");
        return result;
      })
      .then(setValue)
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [lat, lon]);
  if (error)
    return (
      <section className="data-panel">
        <div className="eyebrow">NASA POWER</div>
        <p role="status">{tr(error)}</p>
      </section>
    );
  if (!value)
    return (
      <section className="data-panel">
        <div className="eyebrow">NASA POWER</div>
        <p className="loading-copy" role="status">
          {tr("Отримуємо кліматичні дані з відкритого API…")}
        </p>
      </section>
    );
  return <ClimateValues value={value} />;
}
export function ClimateValues({ value }) {
  const { lang, tr } = useLang();
  const number = (n) =>
    n === null
      ? tr("Немає даних")
      : new Intl.NumberFormat(lang === "en" ? "en-US" : "uk-UA", { maximumFractionDigits: 2 }).format(n);
  return (
    <section className="data-panel">
      <div className="section-heading">
        <span className="eyebrow">{tr("NASA POWER · КЛІМАТИЧНА НОРМА")}</span>
        <span className="verified-dot">API</span>
      </div>
      <div className="climate-grid">
        <div>
          <small>{tr("Температура")}</small>
          <b>
            {number(value.temperatureC)}
            <em> °C</em>
          </b>
        </div>
        <div>
          <small>{tr("Опади")}</small>
          <b>
            {number(value.precipitationMmDay)}
            <em> {lang === "en" ? "mm/day" : "мм/день"}</em>
          </b>
        </div>
        <div>
          <small>{tr("Сонячна енергія")}</small>
          <b>
            {number(value.solarKwhM2Day)}
            <em> {lang === "en" ? "kWh/m²/day" : "кВт·год/м²/день"}</em>
          </b>
        </div>
      </div>
      <p className="mini-note">{tr(value.period)}</p>
      <p className="mini-note">{tr(value.note)}</p>
      <a
        className="source-link"
        href={value.source}
        target="_blank"
        rel="noopener noreferrer"
      >
        {tr("Відкрита відповідь NASA POWER →")}
      </a>
    </section>
  );
}
