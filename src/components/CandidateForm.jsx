import { criteria } from "../../shared/catalog.js";
import { ClimateValues } from "./ClimatePanel.jsx";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function CandidateForm({
  draft,
  onChange,
  onMap,
  onSubmit,
  busy,
  error,
  result,
  saved,
  onSelectSaved,
}) {
  const { lang, tr } = useLang();
  const change = (key, value) => onChange({ ...draft, [key]: value });
  function toggle(id) {
    change(
      "traits",
      draft.traits.includes(id)
        ? draft.traits.filter((value) => value !== id)
        : [...draft.traits, id],
    );
  }
  function download() {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "orbital-candidate-" + result.id + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="eyebrow">{tr("НОВИЙ ЗЕМНИЙ АНАЛОГ")}</div>
      <h2>{tr("Запропонуй кандидатуру")}</h2>
      <p>
        {tr("Вкажи нову точку. Ми отримаємо кліматичні дані NASA POWER. Геологічні ознаки залишаться заявленими до перевірки.")}
      </p>
      <form className="candidate-form" onSubmit={onSubmit}>
        <fieldset disabled={busy}>
          <label>
            {tr("Назва локації")}
            <input
              value={draft.name}
              onChange={(event) => change("name", event.target.value)}
              required
              maxLength={100}
              placeholder={tr("Назва або район дослідження")}
            />
          </label>
          <div className="coordinate-inputs">
            <label>
              {tr("Широта")}
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                required
                value={draft.lat}
                onChange={(event) => change("lat", event.target.value)}
                placeholder="−90 … 90"
              />
            </label>
            <label>
              {tr("Довгота")}
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                required
                value={draft.lon}
                onChange={(event) => change("lon", event.target.value)}
                placeholder="−180 … 180"
              />
            </label>
          </div>
          <button type="button" className="map-pick" onClick={onMap}>
            {tr("⌖ Обрати точку на карті")}
          </button>
          <label>
            {tr("Для якого світу?")}
            <select
              value={draft.target}
              onChange={(event) => { change("target", event.target.value); event.currentTarget.dataset.selectionComplete = "true"; event.currentTarget.blur(); }}
              onPointerLeave={(event) => { delete event.currentTarget.dataset.selectionComplete; }}
            >
              <option value="moon">{lang === "en" ? "Moon" : "Місяць"}</option>
              <option value="mars">{lang === "en" ? "Mars" : "Марс"}</option>
            </select>
          </label>
          <div className="form-label">{tr("Заявлені ознаки місцевості")}</div>
          <div className="trait-options">
            {criteria.map((criterion) => (
              <label key={criterion.id}>
                <input
                  type="checkbox"
                  checked={draft.traits.includes(criterion.id)}
                  onChange={() => toggle(criterion.id)}
                />
                {tr(criterion.label)}
              </label>
            ))}
          </div>
          <button type="submit" className="action">
            {busy ? tr("Отримуємо дані NASA…") : tr("Проаналізувати кандидатуру →")}
          </button>
        </fieldset>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="candidate-result">
          <div className="eyebrow">{tr("ПОПЕРЕДНЯ КАНДИДАТУРА")}</div>
          <h3>{result.name}</h3>
          <p className="mini-note">
            {result.lat.toFixed(4)}°, {result.lon.toFixed(4)}° ·{" "}
            {result.target === "moon"
              ? lang === "en" ? "Moon" : "Місяць"
              : lang === "en" ? "Mars" : "Марс"}
          </p>
          {result.climate ? (
            <ClimateValues value={result.climate} />
          ) : (
            <p className="form-error">{tr(result.climateError)}</p>
          )}
          <h4>{tr("Кліматичні фільтри")}</h4>
          {result.measuredTraits.length ? (
            result.measuredTraits.map((trait) => (
              <p key={trait.id} className="criteria-check">
                ✓ {tr(trait.rule)} · NASA POWER
              </p>
            ))
          ) : (
            <p className="mini-note">
              {tr("Пороги сухості або холоду не підтверджені цими даними.")}
            </p>
          )}
          <p className="mini-note">{tr(result.method)}</p>
          <div className="tag-list">
            {result.declaredTraits.map((id) => (
              <span className="tag unverified" key={id}>
                {tr(criteria.find((item) => item.id === id)?.label)} · {tr("заявлено")}
              </span>
            ))}
          </div>
          <button type="button" className="action secondary" onClick={download}>
            {tr("Завантажити аналіз JSON ↓")}
          </button>
          <p className="mini-note">
            {tr("Кандидатури зберігаються в цьому браузері. Їхній статус потребує незалежної перевірки.")}
          </p>
        </section>
      )}
      {saved.length > 0 && (
        <section className="saved-candidates">
          <h3>{tr("Твої кандидатури")}</h3>
          {saved.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              onClick={() => onSelectSaved(item)}
            >
              {item.name}
              <small>
                {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
              </small>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
