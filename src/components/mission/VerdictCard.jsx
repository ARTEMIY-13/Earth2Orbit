import { STATUS_LABELS } from "../../../shared/mission/assessment.js";

const ICON = { pass: "✓", fail: "✕", insufficient: "?", na: "–" };

const fmtValue = (c) => {
  if (c.value === null || c.value === undefined) return "немає даних";
  if (Array.isArray(c.value)) return "—";
  return `${c.value}${c.unit ? " " + c.unit : ""}`;
};

export default function VerdictCard({ card, stale }) {
  if (!card) return null;
  return (
    <section className={`m-card m-${card.status}${stale ? " m-stale" : ""}`} aria-label={`${card.title}: ${STATUS_LABELS[card.status]}`}>
      <header>
        <h3>{card.title}</h3>
        <span className="m-status">
          <b aria-hidden="true">{ICON[card.status]}</b> {STATUS_LABELS[card.status]}
        </span>
      </header>
      {stale && <p className="m-stale-note">Результат застарів: вхідні дані змінено. Перерахуй.</p>}
      {card.error && <p className="m-muted">{card.error}</p>}
      {card.note && <p className="m-muted">{card.note}</p>}
      {card.criteria?.length > 0 && (
        <div className="m-table-wrap">
          <table className="m-table">
            <thead>
              <tr>
                <th>Критерій</th>
                <th>Значення</th>
                <th>Поріг</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {card.criteria.map((c) => (
                <tr key={c.id} className={"m-row-" + c.status}>
                  <td>
                    {c.label}
                    {c.critical === false && <small> (інф.)</small>}
                    <details>
                      <summary>метод і джерело</summary>
                      <p>
                        <b>Метод:</b> {c.method}
                      </p>
                      <p>
                        <b>Джерело:</b> {c.source}
                      </p>
                      <p>
                        <b>Причина:</b> {c.reason}
                      </p>
                    </details>
                  </td>
                  <td>{fmtValue(c)}</td>
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
          <summary>Не оцінено ({card.unassessed.length})</summary>
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
