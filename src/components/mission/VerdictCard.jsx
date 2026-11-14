import { STATUS_LABELS_I18N } from "../../../shared/mission/assessment.js";
import { useLang } from "../../i18n/LanguageContext.jsx";

const ICON = { pass: "✓", fail: "✕", insufficient: "?", na: "–" };

const fmtValue = (c, x) => {
  if (c.value === null || c.value === undefined) return x("немає даних", "no data");
  if (Array.isArray(c.value)) return "—";
  return `${c.value}${c.unit ? " " + c.unit : ""}`;
};

export default function VerdictCard({ card, stale }) {
  const { lang } = useLang();
  const x = (uk, en) => (lang === "en" ? en : uk);
  const STATUS_LABELS = STATUS_LABELS_I18N[lang] || STATUS_LABELS_I18N.uk;
  if (!card) return null;
  return (
    <section className={`m-card m-${card.status}${stale ? " m-stale" : ""}`} aria-label={`${card.title}: ${STATUS_LABELS[card.status]}`}>
      <header>
        <h3>{card.title}</h3>
        <span className="m-status">
          <b aria-hidden="true">{ICON[card.status]}</b> {STATUS_LABELS[card.status]}
        </span>
      </header>
      {stale && <p className="m-stale-note">{x("Результат застарів: вхідні дані змінено. Перерахуй.", "Result is stale: inputs changed. Recompute.")}</p>}
      {card.error && <p className="m-muted">{card.error}</p>}
      {card.note && <p className="m-muted">{card.note}</p>}
      {card.criteria?.length > 0 && (
        <div className="m-table-wrap">
          <table className="m-table">
            <thead>
              <tr>
                <th>{x("Критерій", "Criterion")}</th>
                <th>{x("Значення", "Value")}</th>
                <th>{x("Поріг", "Threshold")}</th>
                <th>{x("Статус", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {card.criteria.map((c) => (
                <tr key={c.id} className={"m-row-" + c.status}>
                  <td>
                    {c.label}
                    {c.critical === false && <small> ({x("інф.", "info")})</small>}
                    <details>
                      <summary>{x("метод і джерело", "method & source")}</summary>
                      <p>
                        <b>{x("Метод", "Method")}:</b> {c.method}
                      </p>
                      <p>
                        <b>{x("Джерело", "Source")}:</b> {c.source}
                      </p>
                      <p>
                        <b>{x("Причина", "Reason")}:</b> {c.reason}
                      </p>
                    </details>
                  </td>
                  <td>{fmtValue(c, x)}</td>
                  <td>{c.threshold}</td>
                  <td>
                    <span aria-hidden="true">{ICON[c.status]}</span> {STATUS_LABELS[c.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {card.unassessed?.length > 0 && (
        <details className="m-unassessed">
          <summary>{x("Не оцінено", "Not assessed")} ({card.unassessed.length})</summary>
          <ul>
            {card.unassessed.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
