import { useState } from "react";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { IMAGING_PRODUCTS, DTM_PRODUCTS, odeQueryUrl, parseOdeProducts, parseOdeDtms, ODE_DOC } from "../../../shared/terrain/imaging.js";



/**
 * Keeps six often-confused quantities apart and fetches real imaging geometry
 * (PDS product metadata via ODE; works on GitHub Pages too — ODE sends CORS headers).
 */
export default function ImagingPanel({ body, lat, lon, site, onFootprints }) {
  const { lang } = useLang();
  const x = (uk, en) => (lang === "en" ? en : uk);
  const f = (v, d = 1, u = "") => (v === null || v === undefined || !Number.isFinite(v) ? x("недоступно", "unavailable") : v.toFixed(d) + u);
  const altNote = (p) =>
    p.spacecraftAltitudeSource === "lroc-index"
      ? x("З індексної таблиці LROC у PDS (SPACECRAFT_ALTITUDE, перевірено проти TARGET_CENTER_DISTANCE)", "From the LROC PDS index table (SPACECRAFT_ALTITUDE, checked against TARGET_CENTER_DISTANCE)")
      : p.spacecraftAltitudeSource === "not-published-needs-spice"
        ? x("Не публікується в метаданих ODE/етикетці HiRISE RDR; для обчислення потрібні SPICE-кернели MRO (не підключено).", "Not published in ODE metadata / the HiRISE RDR label; computing it needs MRO SPICE kernels (not connected).")
        : x("Немає в індексному записі продукту.", "Not in the product index record.");
  const [state, setState] = useState({ status: "idle" });
  const spec = IMAGING_PRODUCTS[body];
  async function search() {
    setState({ status: "loading" });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const [a, b] = await Promise.all([
        fetch(odeQueryUrl(spec, lat, lon, { limit: 5 }), { signal: ctrl.signal }).then((r) => r.json()),
        fetch(odeQueryUrl(DTM_PRODUCTS[body], lat, lon, { limit: 5 }), { signal: ctrl.signal }).then((r) => r.json()),
      ]);
      clearTimeout(timer);
      const products = parseOdeProducts(a, body);
      const dtms = parseOdeDtms(b);
      setState({ status: "done", products, dtms, at: { lat, lon } });
      onFootprints?.(products.map((p) => p.footprint).filter(Boolean));
    } catch (e) {
      setState({ status: "error", error: e.name === "AbortError" ? x("ODE не відповів за 30 с", "ODE did not respond within 30 s") : e.message });
    }
  }
  const p0 = state.products?.[0];
  return (
    <div className="m-imaging">
      <table className="m-table m-quantities">
        <caption>{x("Різні величини — різні джерела", "Different quantities, different sources")}</caption>
        <tbody>
          <tr>
            <th>1. {x("Висота поверхні", "Surface elevation")}</th>
            <td>{f(site?.z, 1, x(" м", " m"))} {x("відносно датуму набору", "relative to the dataset datum")} ({site?.datum || "—"}) — {x("з DEM", "from the DEM")}</td>
          </tr>
          <tr>
            <th>2. {x("Висота камери над поверхнею", "Camera altitude above the surface")}</th>
            <td>{p0 ? `${f(p0.spacecraftAltitude_km, 2, x(" км", " km"))} (${p0.productId})` : x("знайди знімок нижче", "find an image below")}{p0 && p0.spacecraftAltitude_km === null ? ` — ${altNote(p0)}` : ""}</td>
          </tr>
          <tr>
            <th>3. {x("Кут спостереження (emission)", "Viewing (emission) angle")}</th>
            <td>{p0 ? `${f(p0.emission_deg, 2, "°")} ${x("від нормалі до опорної поверхні", "from the reference-surface normal")}` : "—"}</td>
          </tr>
          <tr>
            <th>4. {x("Сонце: incidence / phase", "Sun: incidence / phase")}</th>
            <td>{p0 ? `${f(p0.incidence_deg, 2, "°")} / ${f(p0.phase_deg, 2, "°")} (${x("на момент", "at")} ${p0.observationUtc})` : "—"}</td>
          </tr>
          <tr>
            <th>5. {x("Ухил і експозиція рельєфу", "Terrain slope and aspect")}</th>
            <td>
              {f(site?.slope, 1, "°")} / {f(site?.aspect, 0, "°")} — {x("розраховано з DEM (Горн 3×3), не з кутів знімання", "computed from the DEM (Horn 3×3), not from imaging angles")}
            </td>
          </tr>
          <tr>
            <th>6. {x("Кут траєкторії й орієнтація апарата", "Trajectory angle and vehicle attitude")}</th>
            <td>{site?.trajectory || x("з симуляції спуску (після розрахунку)", "from the descent simulation (after computing)")}</td>
          </tr>
        </tbody>
      </table>
      {spec ? (
        <>
          <button className="text-button" onClick={search} disabled={state.status === "loading" || !Number.isFinite(lat)}>
            {state.status === "loading" ? x("Запит до PDS ODE…", "Querying PDS ODE…") : x(`Знайти знімки ${spec.label} над точкою`, `Find ${spec.label} images over the point`)}
          </button>
          {state.status === "error" && <p className="m-error">{x("Геометрію знімання не отримано", "Imaging geometry not retrieved")}: {state.error}. {x("Інші розрахунки працюють.", "Other computations still work.")}</p>}
          {state.status === "done" && (
            <>
              {state.products.length === 0 ? (
                <p className="m-muted">{x(`Над точкою не знайдено продуктів ${spec.label}.`, `No ${spec.label} products found over the point.`)}</p>
              ) : (
                <div className="m-table-wrap">
                  <table className="m-table">
                    <thead>
                      <tr>
                        <th>{x("Продукт", "Product")}</th>
                        <th>UTC</th>
                        <th>{x("Висота КА", "S/C altitude")}</th>
                        <th>Emission</th>
                        <th>Incidence</th>
                        <th>Phase</th>
                        <th>{x("м/пікс.", "m/px")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.products.map((p) => (
                        <tr key={p.productId}>
                          <td>
                            {p.productUrl ? (
                              <a href={p.productUrl} target="_blank" rel="noopener noreferrer">
                                {p.productId}
                              </a>
                            ) : (
                              p.productId
                            )}
                          </td>
                          <td>{p.observationUtc?.replace("T", " ").slice(0, 19)}</td>
                          <td title={altNote(p)}>{f(p.spacecraftAltitude_km, 1, x(" км", " km"))}</td>
                          <td>{f(p.emission_deg, 1, "°")}</td>
                          <td>{f(p.incidence_deg, 1, "°")}</td>
                          <td>{f(p.phase_deg, 1, "°")}</td>
                          <td>{f(p.resolution_m, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="m-muted">
                {x("Значення — опубліковані метадані продуктів PDS (через", "Values are published PDS product metadata (via")}{" "}
                <a href={ODE_DOC} target="_blank" rel="noopener noreferrer">
                  ODE REST
                </a>
                ){x(
                  "; SPICE-обчислень тут немає. Кути — відносно нормалі до опорної сфери/еліпсоїда в центрі знімка. Контури знімків показано на 2D-карті фіолетовим пунктиром.",
                  "; no SPICE computation here. Angles are relative to the reference sphere/ellipsoid normal at the image centre. Image footprints are drawn on the 2D map as purple dashed lines.",
                )}
              </p>
              <p className="m-muted">
                {x("Високороздільні DTM над точкою", "High-resolution DTMs over the point")} ({DTM_PRODUCTS[body].label}):{" "}
                {state.dtms.length
                  ? state.dtms.map((d, i) => (
                      <span key={d.productId || i}>
                        {i > 0 && ", "}
                        {d.filesUrl ? (
                          <a href={d.filesUrl} target="_blank" rel="noopener noreferrer">
                            {d.productId}
                          </a>
                        ) : (
                          d.productId
                        )}
                      </span>
                    ))
                  : x("не знайдено", "none found")}
                . {x("Вони покривають лише окремі ділянки й автоматично не завантажуються.", "They cover only individual areas and are not loaded automatically.")}
              </p>
            </>
          )}
        </>
      ) : (
        <p className="m-muted">{x("Для Землі пошук орбітальних знімків PDS не застосовується; DEM — радарна інтерферометрія без окремої геометрії «знімка».", "PDS orbital image search does not apply to Earth; the DEM comes from radar interferometry with no single-image geometry.")}</p>
      )}
    </div>
  );
}
