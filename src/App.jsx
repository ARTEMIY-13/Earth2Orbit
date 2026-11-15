import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "./lib/api";
import {
  catalog as initialCatalog,
  criteria,
  evidenceLabels,
  filterAnalogs,
  challenge,
  methodologySource,
} from "../shared/catalog.js";
import SpaceScene from "./components/SpaceScene.jsx";
import Gallery from "./components/Gallery.jsx";
import ClimatePanel from "./components/ClimatePanel.jsx";
import Comparison from "./components/Comparison.jsx";
import CandidateForm from "./components/CandidateForm.jsx";
import MapModal from "./components/MapModal.jsx";
import GuideModal from "./components/GuideModal.jsx";
import LanguageSwitch from "./components/LanguageSwitch.jsx";
import { useLang } from "./i18n/LanguageContext.jsx";

const traitName = (id) => criteria.find((item) => item.id === id)?.label || id;
const targetName = (id, lang = "uk") =>
  id === "moon"
    ? lang === "en" ? "Moon" : "Місяць"
    : lang === "en" ? "Mars" : "Марс";
function loadCandidates() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("orbital.candidates.v1") || "[]",
    );
    return Array.isArray(saved)
      ? saved
          .filter(
            (item) =>
              typeof item.id === "string" &&
              typeof item.name === "string" &&
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lon) &&
              Array.isArray(item.declaredTraits) &&
              Array.isArray(item.measuredTraits),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
function SourceLinks({ sources }) {
  return (
    <div className="source-list">
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {source.title} <span>↗</span>
        </a>
      ))}
    </div>
  );
}
function SolarStory({ tr }) {
  return (
    <div className="sun-story">
      <div className="eyebrow">{tr("ЗІРКА НАШОЇ СИСТЕМИ")}</div>
      <h2>{tr("Джерело світла")}</h2>
      <div
        className="sun-art"
        role="img"
        aria-label={tr("Фотокарта поверхні Сонця")}
        data-label={tr("ФОТОКАРТА ПОВЕРХНІ")}
      />
      <p>
        {tr("Сонячна енергія впливає на температуру та умови роботи майбутніх експедицій. Візуалізація поверхні й корони стилізована.")}
      </p>
      <details open>
        <summary>
          <span>01</span> {tr("Фотосфера")}
        </summary>
        <p>{tr("Видимий шар Сонця з температурою близько 5 500 °C.")}</p>
      </details>
      <details>
        <summary>
          <span>02</span> {tr("Корона")}
        </summary>
        <p>{tr("Зовнішня атмосфера Сонця простягається далеко в космос.")}</p>
      </details>
      <a
        className="source-link"
        href="https://science.nasa.gov/sun/facts/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {tr("Сонце · NASA →")}
      </a>
    </div>
  );
}

export default function App() {
  const { lang, tr } = useLang();
  // Interface-only settings: all scientific and 3D behavior stays unchanged.
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("orbital.panelWidth"));
    return saved >= 340 && saved <= 900 ? saved : 500;
  });
  const [interfaceScale, setInterfaceScale] = useState(() => {
    const saved = Number(localStorage.getItem("orbital.interfaceScale"));
    return saved >= 0.75 && saved <= 1.5 ? saved : 1;
  });
  const dragPanel = useRef(null);
  const updateScale = useCallback((next) => {
    setInterfaceScale(Math.min(1.5, Math.max(0.75, Math.round(next * 20) / 20)));
  }, []);
  useEffect(() => {
    document.documentElement.style.zoom = String(interfaceScale);
    localStorage.setItem("orbital.interfaceScale", String(interfaceScale));
    window.dispatchEvent(new Event("resize"));
    return () => { document.documentElement.style.zoom = ""; };
  }, [interfaceScale]);
  useEffect(() => {
    document.documentElement.style.setProperty("--orbital-panel-width", `${panelWidth}px`);
    localStorage.setItem("orbital.panelWidth", String(panelWidth));
    window.dispatchEvent(new Event("resize"));
  }, [panelWidth]);
  const beginPanelResize = useCallback((event) => {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    event.preventDefault();
    dragPanel.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("panel-resizing");
  }, [panelWidth]);
  const movePanelResize = useCallback((event) => {
    if (!dragPanel.current) return;
    const delta = (dragPanel.current.x - event.clientX) / interfaceScale;
    const viewport = window.innerWidth / interfaceScale;
    setPanelWidth(Math.round(Math.max(340, Math.min(Math.min(900, viewport - 360), dragPanel.current.width + delta))));
  }, [interfaceScale]);
  const endPanelResize = useCallback(() => {
    dragPanel.current = null;
    document.body.classList.remove("panel-resizing");
  }, []);
  const [catalog, setCatalog] = useState(initialCatalog),
    [selection, setSelection] = useState({ world: 0, site: null }),
    [tab, setTab] = useState("analogs");
  const [query, setQuery] = useState(""),
    [target, setTarget] = useState("all"),
    [traits, setTraits] = useState([]),
    [remote, setRemote] = useState(null),
    [apiWarning, setApiWarning] = useState("");
  const [compareIds, setCompareIds] = useState([]),
    [markers, setMarkers] = useState(true),
    [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(".25"),
    [cinematic, setCinematic] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [hover, setHover] = useState(null),
    [modal, setModal] = useState(null),
    [guideChat, setGuideChat] = useState([]),
    [toast, setToast] = useState("");
  const [draft, setDraft] = useState({
      name: "",
      lat: "",
      lon: "",
      target: "mars",
      traits: [],
    }),
    [candidateBusy, setCandidateBusy] = useState(false),
    [candidateError, setCandidateError] = useState(""),
    [candidateResult, setCandidateResult] = useState(null),
    [saved, setSaved] = useState(loadCandidates);
  const scene = useRef(null),
    explorer = useRef(null),
    candidateRequest = useRef(null);
  const localizedCatalog = useMemo(
    () =>
      catalog.map((item) => ({
        ...item,
        name: tr(item.name),
        desc: tr(item.desc),
        stats: item.stats.map(([label, value]) => [tr(label), tr(value)]),
        places: item.places.map((place) => ({
          ...place,
          name: tr(place.name),
          type: tr(place.type),
          description: tr(place.description),
          science: place.science
            ? {
                ...place.science,
                summary: tr(place.science.summary),
                uses: place.science.uses.map(tr),
                limit: tr(place.science.limit),
                sources: place.science.sources.map((source) => ({
                  ...source,
                  title: tr(source.title),
                })),
              }
            : null,
          photos: place.photos.map((photo) => ({
            ...photo,
            title: tr(photo.title),
          })),
        })),
      })),
    [catalog, tr],
  );
  const world = localizedCatalog[selection.world] || localizedCatalog[0],
    site = selection.site === null ? null : world.places[selection.site];
  const earth = localizedCatalog[0].places;
  const relatedAnalogs =
    world.id === "earth"
      ? []
      : earth.filter((place) => place.science?.targets.includes(world.id));
  const filters = useMemo(
    () => ({ target, traits, query }),
    [target, traits, query],
  );
  const filterKey = JSON.stringify(filters);
  const localSites = useMemo(
    () => filterAnalogs(earth, filters),
    [earth, filters],
  );
  const visibleSites =
    world.id === "earth"
      ? lang === "uk" && remote?.key === filterKey
        ? remote.sites
        : localSites
      : world.places;
  const comparison = compareIds
    .map((id) => earth.find((item) => item.id === id))
    .filter(Boolean);
  const referenceCount = earth.filter(
    (item) => item.science.status === "reference",
  ).length;

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result) => {
        if (!Array.isArray(result.worlds) || result.worlds.length < 4)
          throw new Error();
        setCatalog(result.worlds);
        setApiWarning("");
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setApiWarning(
            "API каталогу недоступний. Показано локальну копію перевірених даних.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        target,
        traits: traits.join(","),
        q: query,
      });
      apiFetch("/api/analogs?" + params, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          return response.json();
        })
        .then((result) => {
          if (Array.isArray(result.sites))
            setRemote({ key: filterKey, sites: result.sites });
        })
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filterKey]);
  useEffect(() => {
    document.body.dataset.world = world.id;
    return () => {
      delete document.body.dataset.world;
    };
  }, [world.id]);
  useEffect(() => {
    document.body.classList.toggle("cinematic", cinematic);
    return () => document.body.classList.remove("cinematic");
  }, [cinematic]);
  useEffect(() => {
    function key(event) {
      if (event.key === "Escape") setCinematic(false);
      if (
        /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName) ||
        document.querySelector("dialog[open]")
      )
        return;
      if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "_", "0"].includes(event.key)) {
        event.preventDefault();
        setInterfaceScale((previous) => event.key === "0" ? 1 : Math.min(1.5, Math.max(0.75, Math.round((previous + (["+", "="].includes(event.key) ? 0.05 : -0.05)) * 20) / 20)));
        return;
      }
      if (["+", "="].includes(event.key)) {
        event.preventDefault();
        scene.current?.zoom(1);
      }
      if (["-", "_"].includes(event.key)) {
        event.preventDefault();
        scene.current?.zoom(-1);
      }
    }
    function screen() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    setFullscreenAvailable(
      Boolean(document.fullscreenEnabled) &&
        typeof document.documentElement.requestFullscreen === "function",
    );
    addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", screen);
    return () => {
      removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", screen);
      candidateRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    explorer.current?.scrollTo({ top: 0 });
  }, [selection.world, selection.site, tab]);
  const selectWorld = useCallback((index) => {
    setSelection({ world: index, site: null });
    setTab("analogs");
    setHover(null);
  }, []);
  const openPlace = useCallback((index) => {
    setSelection((value) => ({ ...value, site: index }));
    setTab("analogs");
    setCinematic(false);
    setHover(null);
  }, []);
  const openEarth = useCallback((index) => {
    setSelection({ world: 0, site: index });
    setTab("analogs");
    setCinematic(false);
    setModal(null);
  }, []);
  function toggleTrait(id) {
    setTraits((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  }
  function toggleCompare(id) {
    if (compareIds.length === 3 && !compareIds.includes(id))
      setToast(tr("Для читабельного порівняння обери до трьох локацій."));
    setCompareIds((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : values.length < 3
          ? [...values, id]
          : values,
    );
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenAvailable(false);
    }
  }
  async function evaluate(event, override) {
    event?.preventDefault();
    if (candidateBusy) return;
    const form = override || draft;
    setCandidateBusy(true);
    setCandidateError("");
    setCandidateResult(null);
    candidateRequest.current = new AbortController();
    try {
      const payload = {
        name: form.name,
        lat: Number(form.lat),
        lon: Number(form.lon),
        target: form.target,
        traits: form.traits,
      };
      const response = await apiFetch("/api/candidates/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: candidateRequest.current.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(tr(result.error || "Не вдалося отримати аналіз"));
      setCandidateResult(result);
      const next = [
        result,
        ...saved.filter(
          (item) =>
            !(
              item.name === result.name &&
              item.lat === result.lat &&
              item.lon === result.lon &&
              item.target === result.target
            ),
        ),
      ].slice(0, 20);
      setSaved(next);
      try {
        localStorage.setItem("orbital.candidates.v1", JSON.stringify(next));
      } catch {
        setCandidateError(tr(
          "Аналіз готовий, але браузер не дозволив зберегти його. Завантаж JSON.",
        ));
      }
    } catch (error) {
      if (error.name !== "AbortError") setCandidateError(error.message);
    } finally {
      setCandidateBusy(false);
    }
  }
  const chooseCandidatePoint = useCallback((point) => {
    setDraft((value) => ({ ...value, ...point }));
    setModal(null);
    setTab("candidate");
    setSelection({ world: 0, site: null });
  }, []);
  // Дії гіда: порівняння та кандидатури. Повертає короткий коментар або нічого.
  function guideAct(action) {
    const en = lang === "en";
    if (action.type === "compare") {
      if (action.op === "add")
        setCompareIds((values) => {
          const next = [...values];
          for (const id of action.ids || [])
            if (!next.includes(id) && next.length < 3 && earth.some((item) => item.id === id))
              next.push(id);
          return next;
        });
      else if (action.op === "remove")
        setCompareIds((values) => values.filter((id) => !(action.ids || []).includes(id)));
      else if (action.op === "clear") setCompareIds([]);
      else if (action.op === "open") {
        setTab("compare");
        setModal(null);
      }
      return;
    }
    if (action.type === "candidate") {
      const base = { name: "", lat: "", lon: "", target: "mars", traits: [] };
      if (action.op === "fill") {
        setDraft({ ...base, ...action.draft });
        return;
      }
      if (action.op === "open") {
        setTab("candidate");
        setModal(null);
        return;
      }
      if (action.op === "submit") {
        const form = action.draft ? { ...base, ...action.draft } : draft;
        if (!String(form.name).trim() || form.lat === "" || form.lon === "")
          return en
            ? "The form is incomplete: it needs a name and coordinates. Tell me, e.g., “Create candidate Death Valley 36.5 -117.1 Mars aridity”."
            : "Форма неповна: потрібні назва й координати. Напиши, наприклад: «Оформи кандидатуру Долина Смерті 36.5 -117.1 Марс сухість».";
        setDraft(form);
        evaluate(null, form);
        return en
          ? "Analysis started. The result will appear in the “Candidate” tab."
          : "Аналіз запущено. Результат з’явиться на вкладці «Кандидат».";
      }
    }
  }
  const detail = site && (
    <Fragment key={`${world.id}:${site.id}`}>
      <div className="detail-top">
        <button
          className="text-button"
          onClick={() => setSelection((value) => ({ ...value, site: null }))}
        >
          {tr("← Усі локації")}
        </button>
        <span className="detail-category">{world.name}</span>
      </div>
      <div className="eyebrow">{site.type}</div>
      <h2 className="detail-title">{site.name}</h2>
      <Gallery photos={site.photos} />
      {site.science ? (
        <>
          <div className={"evidence-status " + site.science.status}>
            {tr(evidenceLabels[site.science.status])}
            {site.science.organization && " · " + site.science.organization}
          </div>
          <p className="detail-desc">{site.science.summary}</p>
          <div className="tag-list">
            {site.science.targets.map((id) => (
              <span key={id} className="target-tag">
                {targetName(id, lang)}
              </span>
            ))}
            {site.science.traits.map((id) => (
              <span className="tag" key={id}>
                {tr(traitName(id))}
              </span>
            ))}
          </div>
          <section className="evidence-section">
            <h3>{tr("Що тут можна досліджувати")}</h3>
            {site.science.uses.length ? (
              <ul>
                {site.science.uses.map((use) => (
                  <li key={use}>{use}</li>
                ))}
              </ul>
            ) : (
              <p>
                {tr("Спочатку потрібні джерела для геологічних та операційних умов.")}
              </p>
            )}
            <h3>{tr("Межі аналогії")}</h3>
            <p>{site.science.limit}</p>
            <SourceLinks sources={site.science.sources} />
          </section>
        </>
      ) : (
        <p className="detail-desc">{site.description}</p>
      )}
      {world.id !== "earth" && relatedAnalogs.length > 0 && (
        <section className="evidence-section">
          <h3>{tr("Земні аналоги для цього світу")}</h3>
          <p>
            {tr(
              "Це загальні майданчики для цільового світу, а не підтверджені аналоги саме цієї точки.",
            )}
          </p>
          <div className="analog-list">
            {relatedAnalogs.map((analog) => (
              <button
                className="place"
                key={analog.id}
                onClick={() => openEarth(analog.index)}
                aria-label={`${tr("Відкрити земний аналог")}: ${analog.name}`}
              >
                <span className="place-index">
                  {String(analog.index + 1).padStart(2, "0")}
                </span>
                <span>
                  <b>{analog.name}</b>
                  <small>{tr(evidenceLabels[analog.science.status])}</small>
                </span>
                <span className="place-arrow">→</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="coordinates">
        <span>{tr("Опорні координати")}</span>
        <b>
          {site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°
        </b>
      </div>
      {world.id === "earth" && (
        <ClimatePanel lat={site.lat} lon={site.lon} />
      )}
      <div className="detail-actions">
        <button className="action" onClick={() => setModal({ type: "guide" })}>
          {tr("✧ Запитати гіда ОРІ")}
        </button>
        {world.id === "earth" && (
          <>
            <button
              className="action secondary"
              onClick={() => toggleCompare(site.id)}
            >
              {compareIds.includes(site.id)
                ? tr("✓ У порівнянні")
                : tr("⇄ До порівняння")}
            </button>
            <button
              className="action secondary"
              onClick={() => setModal({ type: "map", selected: site })}
            >
              {tr("⌖ Ця локація на карті")}
            </button>
          </>
        )}
      </div>
    </Fragment>
  );
  return (
    <>
      <header className="top">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label={tr("ORBITAL головна")}>
          <span className="brand-icon">◈</span> ORBITAL
          <small>EARTH ANALOG EXPLORER</small>
        </a>
        <nav className="planet-nav" aria-label={tr("Вибір світу")}>
          {localizedCatalog.map((item, index) => (
            <button
              key={item.id}
              className={selection.world === index ? "active" : ""}
              onClick={() => selectWorld(index)}
              aria-pressed={selection.world === index}
            >
              <i className={"dot " + item.id} />
              {item.name}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <LanguageSwitch />
          <button
            className="outline guide-launch"
            aria-label={lang === "en" ? "Open the ORI guide" : "Відкрити гіда ОРІ"}
            aria-haspopup="dialog"
            onClick={() => setModal({ type: "guide" })}
          >
            ✧ <span>{lang === "en" ? "ORI Guide" : "Гід ОРІ"}</span>
          </button>
          <button
            className="outline"
            aria-label={tr("Огляд системи")}
            onClick={() => {
              setSelection((value) => ({ ...value, site: null }));
              scene.current?.overview();
            }}
          >
            ◎ <span>{tr("Огляд системи")}</span>
          </button>
        </div>
      </header>
      <main id="universe" aria-label={tr("Інтерактивна візуалізація світів")}>
        <SpaceScene
          ref={scene}
          world={world}
          worldIndex={selection.world}
          siteIndex={selection.site}
          markers={markers}
          paused={paused}
          speed={speed}
          cinematic={cinematic}
          onWorld={selectWorld}
          onPlace={openPlace}
          onHover={setHover}
        />
        <div className="world-info">
          <div className="eyebrow">
            NASA SPACE APPS · 2026{" "}
            <span>{String(selection.world + 1).padStart(2, "0")} / 04</span>
          </div>
          <h1>{world.name}</h1>
          <p>{world.desc}</p>
          <button
            className="text-button"
            onClick={() => selectWorld(selection.world)}
          >
            {tr("↗ У фокус")}
          </button>
        </div>
        <div className="scene-tools">
          <button
            onClick={() => setMarkers((value) => !value)}
            aria-pressed={markers}
          >
            {markers ? "◉" : "○"} {tr("Мітки")}
          </button>
          <button
            onClick={() => setCinematic((value) => !value)}
            aria-pressed={cinematic}
          >
            {cinematic ? tr("← Інтерфейс") : tr("⛶ Кінорежим")}
          </button>
          {fullscreenAvailable && (
            <button
              id="fullscreen"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
            >
              {fullscreen ? tr("↙ Згорнути") : tr("↗ Повний екран")}
            </button>
          )}
        </div>
        <div className="scene-reticle" aria-hidden="true" />
        <div className="stats">
          {world.stats.map(([label, value]) => (
            <div className="stat" key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="scene-help">
          {tr("Перетягуй для обертання · Натискай на планети та мітки · Масштаб умовний")}
        </div>
      </main>
      <div
        className="panel-divider"
        role="separator"
        aria-label={tr("Змінити ширину панелі досліджень")}
        aria-orientation="vertical"
        aria-valuemin={340}
        aria-valuemax={900}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={beginPanelResize}
        onPointerMove={movePanelResize}
        onPointerUp={endPanelResize}
        onPointerCancel={endPanelResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setPanelWidth((width) => Math.max(340, Math.min(900, width + (event.key === "ArrowLeft" ? 24 : -24))));
          }
        }}
      ><span className="divider-grip" aria-hidden="true">⋮⋮</span></div>
      <aside className="explorer" ref={explorer}>
        <div className="explorer-heading">
          <div>
            <div className="eyebrow">{tr("ДОСЛІДЖЕННЯ ЗА ВІДКРИТИМИ ДАНИМИ")}</div>
            <h2>{tr("Пошук земних аналогів")}</h2>
          </div>
          <span className="badge">
            {referenceCount}
            <small>{tr("еталонів")}</small>
          </span>
        </div>
        <nav className="tabbar" aria-label={tr("Розділи дослідження")}>
          {[
            ["analogs", tr("Аналоги")],
            ["compare", tr("Порівняння")],
            ["candidate", tr("Кандидат")],
            ["method", tr("Методика")],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "compare" && compareIds.length > 0 && (
                <sup>{compareIds.length}</sup>
              )}
            </button>
          ))}
        </nav>
        {apiWarning && (
          <p className="api-warning" role="status">
            {tr(apiWarning)}
          </p>
        )}
        {tab === "analogs" &&
          (world.id === "sun" ? (
            <SolarStory tr={tr} />
          ) : site ? (
            detail
          ) : (
            <Fragment key={`${world.id}:locations`}>
              {world.id === "earth" ? (
                <>
                  <section className="challenge-brief">
                    <span className="eyebrow">{tr("ЗЕМЛЯ → МІСЯЦЬ / МАРС")}</span>
                    <p>
                      {tr("Знайди місця з подібними умовами. Перевір докази, порівняй еталони й запропонуй нову кандидатуру.")}
                    </p>
                    <a
                      href={challenge.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tr("Офіційне завдання NASA →")}
                    </a>
                  </section>
                  <label className="search">
                    <span>⌕</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      type="search"
                      placeholder={tr("Знайти локацію…")}
                      aria-label={tr("Пошук локації")}
                    />
                  </label>
                  <div className="filter-row">
                    <label>
                      {tr("Аналог для")}
                      <select
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                      >
                        <option value="all">{tr("Місяць і Марс")}</option>
                        <option value="moon">{tr("Місяця")}</option>
                        <option value="mars">{tr("Марса")}</option>
                      </select>
                    </label>
                    <button
                      className="text-button"
                      onClick={() => setModal({ type: "map" })}
                    >
                      ⌖ {tr("Карта")}
                    </button>
                  </div>
                  <div className="filter-chips" aria-label={tr("Фільтри ознак")}>
                    {criteria.map((criterion) => (
                      <button
                        key={criterion.id}
                        className={
                          traits.includes(criterion.id) ? "active" : ""
                        }
                        aria-pressed={traits.includes(criterion.id)}
                        onClick={() => toggleTrait(criterion.id)}
                        title={tr(criterion.description)}
                      >
                        {tr(criterion.label)}
                      </button>
                    ))}
                  </div>
                  <div className="list-caption">
                    <span>
                      {visibleSites.length} {tr("локацій · усі обрані ознаки")}
                    </span>
                    {(query || traits.length || target !== "all") && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery("");
                          setTraits([]);
                          setTarget("all");
                        }}
                      >
                        {tr("Скинути")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="eyebrow">
                    {world.id === "moon"
                      ? "LUNAR REFERENCE SITES"
                      : "MARTIAN REFERENCE SITES"}
                  </div>
                  <h2>{tr("Опорні локації")}</h2>
                  <p>
                    {world.id === "moon"
                      ? tr("Досліджуй регіони Місяця, а земні майданчики шукай на вкладці Землі.")
                      : tr("Досліджуй регіони Марса, а земні майданчики шукай на вкладці Землі.")}
                  </p>
                  <button
                    className="action secondary"
                    onClick={() => {
                      setTarget(world.id);
                      selectWorld(0);
                    }}
                  >
                    {tr("Знайти земні аналоги →")}
                  </button>
                </>
              )}
              <div className="analog-list">
                {visibleSites.map((item) => (
                  <article className="analog-row" key={item.id}>
                    <button
                      className="place"
                      onClick={() => openPlace(item.index)}
                    >
                      <span className="place-index">
                        {String(item.index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <b>{item.name}</b>
                        <small>
                          {item.science
                            ? tr(evidenceLabels[item.science.status])
                            : item.type}
                        </small>
                      </span>
                      <span className="place-arrow">→</span>
                    </button>
                    {item.science && (
                      <div className="row-evidence">
                        <span>
                          {item.science.targets.map((id) => targetName(id, lang)).join(" · ") ||
                            tr("Аналогія не перевірена")}
                        </span>
                        <button
                          onClick={() => toggleCompare(item.id)}
                          aria-pressed={compareIds.includes(item.id)}
                        >
                          {compareIds.includes(item.id)
                            ? tr("✓ Додано")
                            : tr("＋ Порівняти")}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!visibleSites.length && (
                <div className="empty-state">
                  <span>⌕</span>
                  <p>
                    {tr("Немає підтверджених збігів. Зміни ознаки або запропонуй кандидатуру.")}
                  </p>
                  <button
                    className="action secondary"
                    onClick={() => setTab("candidate")}
                  >
                    {tr("Нова кандидатура →")}
                  </button>
                </div>
              )}
            </Fragment>
          ))}
        {tab === "compare" && (
          <Comparison
            sites={comparison}
            onRemove={(id) =>
              setCompareIds((values) => values.filter((value) => value !== id))
            }
            onOpen={openEarth}
          />
        )}
        {tab === "candidate" && (
          <CandidateForm
            draft={draft}
            onChange={setDraft}
            onMap={() => setModal({ type: "map", pick: true })}
            onSubmit={evaluate}
            busy={candidateBusy}
            error={candidateError}
            result={candidateResult}
            saved={saved}
            onSelectSaved={setCandidateResult}
          />
        )}
        {tab === "method" && (
          <section className="methodology">
            <div className="eyebrow">{tr("ВІД ОЗНАК ДО ОБҐРУНТУВАННЯ")}</div>
            <h2>{tr("Як читати результати")}</h2>
            <ol>
              <li>
                <b>{tr("Обери цільовий світ.")}</b>
                <p>
                  {tr("Місяць і Марс мають різні геологічні, кліматичні та операційні умови.")}
                </p>
              </li>
              <li>
                <b>{tr("Порівняй конкретні ознаки.")}</b>
                <p>
                  {tr("Сухість, холод, кратери, вулканізм, печери, ізоляція й сценарії випробувань.")}
                </p>
              </li>
              <li>
                <b>{tr("Перевір першоджерело.")}</b>
                <p>
                  {tr("Еталонні записи спираються на матеріали NASA, JPL або ESA. Для ландшафтних кандидатур позначено прогалини.")}
                </p>
              </li>
              <li>
                <b>{tr("Додай нову кандидатуру.")}</b>
                <p>
                  {tr("NASA POWER дає кліматичні норми. Геологічні ознаки й інженерні умови потребують окремих доказів.")}
                </p>
              </li>
            </ol>
            <h3>{tr("Типи планетарних аналогів")}</h3>
            <div className="method-cards">
              <div>
                <b>{tr("Геологічні")}</b>
                <p>{tr("Породи, рельєф і процеси формування.")}</p>
              </div>
              <div>
                <b>{tr("Астробіологічні")}</b>
                <p>{tr("Умови життя й збереження біосигнатур.")}</p>
              </div>
              <div>
                <b>{tr("Місійні")}</b>
                <p>{tr("Процедури, прилади та робота експедиції.")}</p>
              </div>
            </div>
            <p>
              {tr("У таблиці «Немає даних» зберігає невизначеність. Кількість позначок показує обсяг підтверджених ознак, а не відсоток подібності чи придатність бази.")}
            </p>
            <h3>{tr("Кліматичні фільтри кандидатур")}</h3>
            <p>
              {tr("Сухість — середні опади нижче 1 мм/день. Холод — середня температура нижче 0 °C. Це обрані в проєкті пороги попереднього пошуку.")}
            </p>
            <p>
              {tr("Погодні норми описують сітку регіональних даних. Вони не вимірюють мікроклімат конкретної печери, схилу чи місця посадки.")}
            </p>
            <SourceLinks
              sources={[
                {
                  title: tr("Офіційне завдання NASA Space Apps"),
                  url: challenge.url,
                },
                {
                  title: tr("NASA — типи планетарних аналогів"),
                  url: methodologySource,
                },
                {
                  title: "NASA POWER — документація API",
                  url: "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/",
                },
              ]}
            />
          </section>
        )}
        <footer className="credits">
          <span>
            {tr("ORBITAL · дослідницький проєкт за завданням NASA Space Apps 2026")}
          </span>
          <span>
            {tr("Земля 8K · Сонце 4K · географічні координати регіонів орієнтовні")}
          </span>
          <a
            href="https://github.com/fury-gl/fury-data/tree/master/textures"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("Фотокарти Землі · FURY Data")}
          </a>
          <a
            href="https://www.solarsystemscope.com/textures/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("Планетарні текстури · Solar System Scope / CC BY 4.0")}
          </a>
          <a
            href="https://svs.gsfc.nasa.gov/4720/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("Місяць · NASA LROC")}
          </a>
        </footer>
      </aside>
      <footer className="controlbar">
        <div className="control-group">
          <button
            onClick={() =>
              selectWorld(
                (selection.world + catalog.length - 1) % catalog.length,
              )
            }
            aria-label={tr("Попередній світ")}
          >
            ←
          </button>
          <span>
            {String(selection.world + 1).padStart(2, "0")} —{" "}
            {world.id.toUpperCase()}
          </span>
          <button
            onClick={() => selectWorld((selection.world + 1) % catalog.length)}
            aria-label={tr("Наступний світ")}
          >
            →
          </button>
        </div>
        <div className="control-group simulation">
          <button id="orbitPause" onClick={() => setPaused((value) => !value)}>
            {paused ? tr("▶ Продовжити") : tr("⏸ Пауза")}
          </button>
          <label htmlFor="orbitSpeed">{tr("Орбіти")}</label>
          <select
            id="orbitSpeed"
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
          >
            <option value=".25">0.25×</option>
            <option value="1">1×</option>
            <option value="3">3×</option>
            <option value="8">8×</option>
          </select>
        </div>
        <div className="control-group interface-scale-controls" aria-label={tr("Масштаб усієї сторінки")}>
          <span className="zoom-label">{tr("ІНТЕРФЕЙС")}</span>
          <button onClick={() => updateScale(interfaceScale - 0.05)} aria-label={tr("Зменшити інтерфейс")} disabled={interfaceScale <= 0.75}>−</button>
          <button className="scale-value" onClick={() => updateScale(1)} title={tr("Скинути масштаб до 100%")}>{Math.round(interfaceScale * 100)}%</button>
          <button onClick={() => updateScale(interfaceScale + 0.05)} aria-label={tr("Збільшити інтерфейс")} disabled={interfaceScale >= 1.5}>+</button>
        </div>
        <div className="control-group">
          <button
            onClick={() => scene.current?.zoom(-1)}
            aria-label={tr("Віддалити")}
          >
            −
          </button>
          <span className="zoom-label">{tr("3D МАСШТАБ")}</span>
          <button onClick={() => scene.current?.zoom(1)} aria-label={tr("Наблизити")}>
            +
          </button>
        </div>
      </footer>
      {hover && (
        <div
          className="tip"
          style={{
            display: "block",
            left: Math.min(hover.x + 12, innerWidth - 250),
            top: Math.min(hover.y + 12, innerHeight - 90),
          }}
        >
          <b>{tr(hover.title)}</b>
          <small>{tr(hover.subtitle)}</small>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {modal?.type === "map" && (
        <MapModal
          sites={earth}
          selected={modal.selected}
          onClose={() => setModal(null)}
          onSelect={openEarth}
          onPick={modal.pick ? chooseCandidatePoint : undefined}
        />
      )}
      {modal?.type === "guide" && (
        <GuideModal
          world={world}
          site={site}
          messages={guideChat}
          setMessages={setGuideChat}
          compareIds={compareIds}
          onAction={guideAct}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
