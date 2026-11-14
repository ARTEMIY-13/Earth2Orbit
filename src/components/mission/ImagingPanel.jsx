import { useState } from "react";
import { IMAGING_PRODUCTS, DTM_PRODUCTS, odeQueryUrl, parseOdeProducts, parseOdeDtms, ODE_DOC } from "../../../shared/terrain/imaging.js";

const f = (v, d = 1, u = "") => (v === null || v === undefined || !Number.isFinite(v) ? "недоступно" : v.toFixed(d) + u);

/**
 * Keeps six often-confused quantities apart and fetches real imaging geometry
 * (PDS product metadata via ODE; works on GitHub Pages too — ODE sends CORS headers).
 */
export default function ImagingPanel({ body, lat, lon, site, onFootprints }) {
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
      setState({ status: "error", error: e.name === "AbortError" ? "ODE не відповів за 30 с" : e.message });
    }
  }
  const p0 = state.products?.[0];
  return (
    <div className="m-imaging">
      <table className="m-table m-quantities">
        <caption>Різні величини — різні джерела</caption>
        <tbody>
          <tr>
            <th>1. Висота поверхні</th>
            <td>{f(site?.z, 1, " м")} відносно датуму набору ({site?.datum || "—"}) — з DEM</td>
          </tr>
          <tr>
            <th>2. Висота камери над поверхнею</th>
            <td>{p0 ? `${f(p0.spacecraftAltitude_km, 2, " км")} (${p0.productId})` : "знайди знімок нижче"}{p0 && p0.spacecraftAltitude_km === null ? ` — ${p0.spacecraftAltitudeNote}` : ""}</td>
          </tr>
          <tr>
            <th>3. Кут спостереження (emission)</th>
            <td>{p0 ? `${f(p0.emission_deg, 2, "°")} від нормалі до опорної поверхні` : "—"}</td>
          </tr>
          <tr>
            <th>4. Сонце: incidence / phase</th>
            <td>{p0 ? `${f(p0.incidence_deg, 2, "°")} / ${f(p0.phase_deg, 2, "°")} (на момент ${p0.observationUtc})` : "—"}</td>
          </tr>
          <tr>
            <th>5. Ухил і експозиція рельєфу</th>
            <td>
              {f(site?.slope, 1, "°")} / {f(site?.aspect, 0, "°")} — розраховано з DEM (Горн 3×3), не з кутів знімання
            </td>
          </tr>
          <tr>
            <th>6. Кут траєкторії й орієнтація апарата</th>
            <td>{site?.trajectory || "з симуляції спуску (після розрахунку)"}</td>
          </tr>
        </tbody>
      </table>
      {spec ? (
        <>
          <button className="text-button" onClick={search} disabled={state.status === "loading" || !Number.isFinite(lat)}>
            {state.status === "loading" ? "Запит до PDS ODE…" : `Знайти знімки ${spec.label} над точкою`}
          </button>
          {state.status === "error" && <p className="m-error">Геометрію знімання не отримано: {state.error}. Інші розрахунки працюють.</p>}
          {state.status === "done" && (
            <>
              {state.products.length === 0 ? (
                <p className="m-muted">Над точкою не знайдено продуктів {spec.label}.</p>
              ) : (
                <div className="m-table-wrap">
                  <table className="m-table">
                    <thead>
                      <tr>
                        <th>Продукт</th>
                        <th>UTC</th>
                        <th>Висота КА</th>
                        <th>Emission</th>
                        <th>Incidence</th>
                        <th>Phase</th>
                        <th>м/пікс.</th>
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
                          <td title={p.spacecraftAltitudeNote}>{f(p.spacecraftAltitude_km, 1, " км")}</td>
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
                Значення — опубліковані метадані продуктів PDS (через{" "}
                <a href={ODE_DOC} target="_blank" rel="noopener noreferrer">
                  ODE REST
                </a>
                ); SPICE-обчислень тут немає. Кути — відносно нормалі до опорної сфери/еліпсоїда в центрі знімка. Контури знімків показано на 2D-карті фіолетовим пунктиром.
              </p>
              <p className="m-muted">
                Високороздільні DTM над точкою ({DTM_PRODUCTS[body].label}):{" "}
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
                  : "не знайдено"}
                . Вони покривають лише окремі ділянки й автоматично не завантажуються.
              </p>
            </>
          )}
        </>
      ) : (
        <p className="m-muted">Для Землі пошук орбітальних знімків PDS не застосовується; DEM — радарна інтерферометрія без окремої геометрії «знімка».</p>
      )}
    </div>
  );
}
