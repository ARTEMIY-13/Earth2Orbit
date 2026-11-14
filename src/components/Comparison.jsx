import { criteria } from "../../shared/catalog.js";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function Comparison({ sites, onRemove, onOpen }) {
  const { lang, tr } = useLang();
  if (!sites.length)
    return (
      <div className="empty-state">
        <span>⇄</span>
        <h2>{tr("Порівняй докази")}</h2>
        <p>
          {tr("Додай до трьох земних локацій кнопкою «До порівняння». Таблиця покаже підтверджені ознаки та прогалини в даних.")}
        </p>
      </div>
    );
  return (
    <>
      <div className="eyebrow">{tr("ПОРІВНЯННЯ ЗЕМНИХ АНАЛОГІВ")}</div>
      <h2>{tr("Що саме збігається?")}</h2>
      <p className="mini-note">
        {tr("Позначки відображають ознаки з наведених джерел. «Немає даних» означає відсутність підтвердження в каталозі.")}
      </p>
      <div className="table-scroll">
        <table className="evidence-table">
          <thead>
            <tr>
              <th>{tr("Ознака")}</th>
              {sites.map((site) => (
                <th key={site.id}>
                  <button
                    className="text-button"
                    onClick={() => onOpen(site.index)}
                  >
                    {site.name}
                  </button>
                  <button
                    onClick={() => onRemove(site.id)}
                    className="remove-compare"
                    aria-label={tr("Прибрати ") + site.name}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => (
              <tr key={criterion.id}>
                <td>{tr(criterion.label)}</td>
                {sites.map((site) => (
                  <td key={site.id}>
                    {site.science.traits.includes(criterion.id) ? (
                      <span className="positive-evidence">✓ {tr("Є джерело")}</span>
                    ) : (
                      <span className="unknown-evidence">{tr("Немає даних")}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>{tr("Цільовий світ")}</td>
              {sites.map((site) => (
                <td key={site.id}>
                  {site.science.targets
                    .map((target) =>
                      target === "moon"
                        ? lang === "en" ? "Moon" : "Місяць"
                        : lang === "en" ? "Mars" : "Марс",
                    )
                    .join(" · ") || tr("Потребує перевірки")}
                </td>
              ))}
            </tr>
            <tr>
              <td>{tr("Джерела")}</td>
              {sites.map((site) => (
                <td key={site.id}>
                  {site.science.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {site.science.organization || tr("Джерело")} →
                    </a>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mini-note">
        {tr("Гравітацію, атмосферний тиск і позаземне радіаційне середовище польова локація на Землі повністю не відтворює.")}
      </p>
    </>
  );
}
