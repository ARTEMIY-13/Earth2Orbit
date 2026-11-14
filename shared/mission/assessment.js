// Three independent verdict cards: terrain, vehicle landing, transfer.
// Status vocabulary: "pass" = meets the model's conditions, "fail" = does not,
// "insufficient" = not enough data, "na" = not applicable.
// Rule: any critical "fail" → card fail; else any critical "insufficient" →
// card insufficient; only then pass. Unknowns never become a pass.
// Every text is produced in the requested language (uk | en); cards are pure
// functions of solver results, so a language switch never re-runs physics.
import { edlCriteria } from "./edl.js";
import { pixelsInEllipse, regionStats, footprintPlane, meanSpacing, roughnessWindow } from "../terrain/analysis.js";

export const L = (lang) => (uk, en) => (lang === "en" ? en : uk);

export const STATUS_LABELS_I18N = {
  uk: { pass: "відповідає умовам моделі", fail: "не відповідає", insufficient: "недостатньо даних", na: "не застосовно" },
  en: { pass: "meets model conditions", fail: "does not meet", insufficient: "insufficient data", na: "not applicable" },
};
export const STATUS_LABELS = STATUS_LABELS_I18N.uk;

export function unassessedSurface(lang = "uk") {
  const x = L(lang);
  return [
    x("Несуча здатність ґрунту / реголіту", "Soil / regolith bearing capacity"),
    x("Пил і ерозія струменем двигуна (plume–surface interaction)", "Dust and plume–surface interaction (erosion)"),
    x("Камені й кратери менші за піксель DEM", "Rocks and craters smaller than a DEM pixel"),
    x("Підповерхневі порожнини, лід, лавові трубки", "Subsurface voids, ice, lava tubes"),
    x("Освітлення, тепловий режим і зв'язок у момент посадки", "Illumination, thermal environment and communications at landing"),
  ];
}
export const UNASSESSED_SURFACE = unassessedSurface("uk");

function combine(criteria) {
  const crit = criteria.filter((c) => c.critical !== false);
  if (crit.some((c) => c.status === "fail")) return "fail";
  if (crit.some((c) => c.status === "insufficient")) return "insufficient";
  if (crit.length && crit.every((c) => c.status === "na")) return "na";
  return "pass";
}

const crit = (o) => ({ critical: true, ...o });
const r1 = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Terrain card for a site.
 * site: { col, row }, ellipse: { a_m, b_m, azimuth_deg, origin }
 */
export function terrainCard(grid, site, lander, ellipse, lang = "uk") {
  const x = L(lang);
  const px = meanSpacing(grid);
  const footR = lander.footprintDiameter / 2;
  const ell = pixelsInEllipse(grid, site.col, site.row, ellipse.a_m, ellipse.b_m, ellipse.azimuth_deg);
  const stats = regionStats(grid, ell);
  const fp = footprintPlane(grid, site.col, site.row, footR);
  const rw = roughnessWindow(grid);
  const criteria = [];
  const src = grid.meta?.source?.productId || grid.meta?.id || "DEM";
  const m = x("м", "m"),
    pxU = x("пікс.", "px");

  criteria.push(
    crit({
      id: "coverage",
      label: x("Покриття даними в еліпсі", "Data coverage in the ellipse"),
      value: r1((1 - stats.nodataFraction) * 100),
      unit: "%",
      threshold: x("≥ 99 % валідних пікселів, ≥ 25 пікселів", "≥ 99 % valid pixels, ≥ 25 pixels"),
      source: src,
      method: x("Частка пікселів DEM без nodata всередині еліпса", "Fraction of DEM pixels without nodata inside the ellipse"),
      status: stats.count < 25 ? "insufficient" : stats.nodataFraction > 0.01 ? "insufficient" : "pass",
      reason:
        stats.count < 25
          ? x(`Еліпс охоплює лише ${stats.count} пікс. — замало для статистики`, `The ellipse covers only ${stats.count} px — too few for statistics`)
          : stats.nodataFraction > 0.01
            ? x("Є прогалини DEM; вони не інтерпольовані й не вважаються безпечними", "DEM gaps present; they are not interpolated and not treated as safe")
            : x("Покриття повне", "Full coverage"),
    }),
  );
  const resolvable = px <= footR; // ≥ 2 px across footprint
  criteria.push(
    crit({
      id: "resolution",
      label: x("Роздільність vs розмір опор", "Resolution vs footprint size"),
      value: r1(px),
      unit: x("м/пікс.", "m/px"),
      threshold: x(`≤ ${r1(footR)} м (≥ 2 пікс. на діаметр опор ${lander.footprintDiameter} м)`, `≤ ${r1(footR)} m (≥ 2 px across the ${lander.footprintDiameter} m footprint)`),
      source: src,
      method: x("Порівняння кроку сітки з діаметром опорного контуру", "Grid spacing compared with the footprint diameter"),
      status: resolvable ? "pass" : "insufficient",
      reason: resolvable
        ? x("Схил під опорами розв'язується DEM", "The slope under the legs is resolved by the DEM")
        : x(
            `Піксель ${r1(px)} м більший за радіус опор — небезпеки масштабу опор (камені, малі кратери) не видно; їхня відсутність НЕ доведена`,
            `Pixel ${r1(px)} m is larger than the footprint radius — footprint-scale hazards (rocks, small craters) are invisible; their absence is NOT proven`,
          ),
    }),
  );
  if (fp.valid) {
    const slopeStatus = fp.slope_deg > lander.maxSlope ? "fail" : fp.enlarged ? "insufficient" : "pass";
    criteria.push(
      crit({
        id: "footprint-slope",
        label: x("Ухил під апаратом", "Slope under the lander"),
        value: r1(fp.slope_deg),
        unit: "°",
        threshold: `≤ ${lander.maxSlope}° (preset)`,
        source: src,
        method: x(`Площина МНК по ${fp.count} пікс., база ${r1(fp.baseline_m)} м`, `Least-squares plane over ${fp.count} px, baseline ${r1(fp.baseline_m)} m`),
        status: slopeStatus,
        reason:
          slopeStatus === "fail"
            ? x("Ухил на базі DEM перевищує допуск — відоме порушення", "Slope at DEM baseline exceeds the limit — a known violation")
            : fp.enlarged
              ? x(`Опори менші за 3×3 пікс.; ухил виміряно на базі ${r1(fp.baseline_m)} м, на масштабі опор може бути більшим`, `Footprint smaller than 3×3 px; slope measured over ${r1(fp.baseline_m)} m, may be steeper at footprint scale`)
              : x("У межах допуску на масштабі DEM", "Within the limit at DEM scale"),
      }),
    );
    const resStatus = !resolvable ? "insufficient" : fp.maxResidual_m > lander.maxLegHeightDiff ? "fail" : "pass";
    criteria.push(
      crit({
        id: "leg-relief",
        label: x("Перепад під опорами (відхилення від площини)", "Height difference under legs (deviation from plane)"),
        value: r1(fp.maxResidual_m, 2),
        unit: m,
        threshold: `≤ ${lander.maxLegHeightDiff} ${m}`,
        source: src,
        method: x("Макс. |залишок| від площини під опорним контуром", "Max |residual| from the plane under the footprint"),
        status: resStatus,
        reason:
          resStatus === "insufficient"
            ? x("Перепад на масштабі опор менший за роздільність — невідомий", "Height difference at footprint scale is below resolution — unknown")
            : resStatus === "fail"
              ? x("Перепад перевищує допуск", "Height difference exceeds the limit")
              : x("У межах допуску (лише на масштабі DEM)", "Within the limit (at DEM scale only)"),
      }),
    );
  } else {
    criteria.push(
      crit({
        id: "footprint-slope",
        label: x("Ухил під апаратом", "Slope under the lander"),
        value: null,
        unit: "°",
        threshold: `≤ ${lander.maxSlope}°`,
        source: src,
        method: x("Площина МНК", "Least-squares plane"),
        status: "insufficient",
        reason: x("У контурі опор є nodata", "Nodata inside the footprint"),
      }),
    );
  }
  criteria.push(
    crit({
      id: "ellipse-slope",
      label: x("Ухил у посадковому еліпсі (P95)", "Slope in the landing ellipse (P95)"),
      value: r1(stats.slopeP95),
      unit: "°",
      threshold: `P95 ≤ ${lander.maxSlope}°`,
      source: src,
      method: x(`Horn 3×3, база ${r1(2 * px)} м; макс. ${r1(stats.slopeMax)}°`, `Horn 3×3, baseline ${r1(2 * px)} m; max ${r1(stats.slopeMax)}°`),
      status: !Number.isFinite(stats.slopeP95) ? "insufficient" : stats.slopeP95 > lander.maxSlope ? "fail" : "pass",
      reason: !Number.isFinite(stats.slopeP95)
        ? x("Немає валідних ухилів", "No valid slopes")
        : stats.slopeP95 > lander.maxSlope
          ? x("Понад 5 % площі еліпса крутіше за допуск (з урахуванням похибки наведення)", "More than 5 % of the ellipse is steeper than the limit (given targeting dispersion)")
          : x("Більша частина еліпса в межах допуску", "Most of the ellipse is within the limit"),
    }),
  );
  criteria.push({
    id: "roughness",
    critical: false,
    label: x("Шорсткість (P95)", "Roughness (P95)"),
    value: r1(stats.roughnessP95, 2),
    unit: m,
    threshold: x("інформаційно", "informational"),
    source: src,
    method: x(`${rw.metric}, вікно ${rw.pixels}×${rw.pixels} ${pxU} ≈ ${r1(rw.metres, 0)} м`, `${rw.metric}, window ${rw.pixels}×${rw.pixels} ${pxU} ≈ ${r1(rw.metres, 0)} m`),
    status: Number.isFinite(stats.roughnessP95) ? "pass" : "insufficient",
    reason: x("Метрика залежить від масштабу вікна; не порівнюй із шорсткістю на іншому масштабі", "The metric depends on window scale; do not compare with roughness at another scale"),
  });
  return {
    id: "terrain",
    title: x("Рельєф", "Terrain"),
    status: combine(criteria),
    criteria,
    stats,
    footprint: fp,
    ellipse: { ...ellipse, pixels: ell.length },
    unassessed: unassessedSurface(lang),
  };
}

export function landingCard(descent, lander, lang = "uk") {
  const x = L(lang);
  const title = x("Посадка апарата", "Vehicle landing");
  if (!descent || !descent.ok)
    return { id: "landing", title, status: "insufficient", criteria: [], error: descent?.errorCode === "nodata" ? x("У цільовому пікселі немає даних DEM (nodata) — спуск не моделюється", "No DEM data at the target pixel (nodata) — descent not simulated") : descent?.error || x("Симуляцію не виконано", "Simulation not run"), unassessed: [] };
  const criteria = [];
  const td = descent.touchdown;
  const ms = x("м/с", "m/s");
  const informational = x("інформаційно", "informational");
  const sim = x("симуляція", "simulation");
  criteria.push(
    crit({
      id: "twr",
      label: x("Тяга / вага на старті спуску", "Thrust-to-weight at descent start"),
      value: r1(descent.thrustToWeight, 2),
      unit: "",
      threshold: "> 1.0",
      source: x("preset + g тіла", "preset + body gravity"),
      method: "T_max / (m0 · g_local)",
      status: descent.thrustToWeight > 1 ? "pass" : "fail",
      reason: descent.thrustToWeight > 1 ? x("Апарат може зависати", "The vehicle can hover") : x("Тяги недостатньо, щоб утримати масу в цьому полі тяжіння", "Not enough thrust to hold the mass in this gravity field"),
    }),
  );
  const contactOk = descent.outcome === "contact";
  criteria.push(
    crit({
      id: "contact",
      label: x("Контакт з поверхнею", "Surface contact"),
      value: descent.outcome,
      unit: "",
      threshold: x("контакт у межах DEM", "contact within the DEM"),
      source: sim,
      method: descent.model,
      status: contactOk ? "pass" : descent.outcome === "left-coverage" ? "insufficient" : "fail",
      reason: contactOk
        ? `t = ${r1(td.t)} ${x("с", "s")}`
        : descent.outcome === "left-coverage"
          ? x("Траєкторія вийшла за межі DEM — рельєф невідомий", "The trajectory left the DEM — terrain unknown")
          : x("Посадки не відбулося (", "No landing (") + descent.outcome + ")",
    }),
  );
  if (td) {
    criteria.push(crit({ id: "vz", label: x("Вертикальна швидкість торкання", "Vertical touchdown speed"), value: r1(td.vVertical, 2), unit: ms, threshold: `≤ ${lander.maxVerticalTouchdown}`, source: "preset", method: x("стан у момент перетину DEM (бісекція між кроками)", "state at DEM crossing (bisection between steps)"), status: td.vVertical <= lander.maxVerticalTouchdown ? "pass" : "fail", reason: td.vVertical <= lander.maxVerticalTouchdown ? x("У допуску", "Within limit") : x("Перевищення — жорстка посадка/аварія", "Exceeded — hard landing / crash") }));
    criteria.push(crit({ id: "vh", label: x("Горизонтальна швидкість торкання", "Horizontal touchdown speed"), value: r1(td.vHorizontal, 2), unit: ms, threshold: `≤ ${lander.maxHorizontalTouchdown}`, source: "preset", method: x("|v_xy| у момент контакту", "|v_xy| at contact"), status: td.vHorizontal <= lander.maxHorizontalTouchdown ? "pass" : "fail", reason: td.vHorizontal <= lander.maxHorizontalTouchdown ? x("У допуску", "Within limit") : x("Ризик перекидання", "Tip-over risk") }));
    if (td.thrustTilt_deg !== null)
      criteria.push(crit({ id: "tilt", label: x("Нахил апарата при торканні", "Vehicle tilt at touchdown"), value: r1(td.thrustTilt_deg), unit: "°", threshold: `≤ ${lander.maxTilt}`, source: "preset", method: x("орієнтація = напрям тяги (без динаміки обертання)", "attitude = thrust direction (no rotational dynamics)"), status: td.thrustTilt_deg <= lander.maxTilt ? "pass" : "fail", reason: x("Модель орієнтації спрощена", "Simplified attitude model") }));
    const fp = td.footprint;
    criteria.push(
      crit({
        id: "td-slope",
        label: x("Ухил у точці контакту", "Slope at the contact point"),
        value: fp.valid ? r1(fp.slope_deg) : null,
        unit: "°",
        threshold: `≤ ${lander.maxSlope}`,
        source: "DEM",
        method: fp.valid ? x(`площина МНК, база ${r1(fp.baseline_m)} м`, `least-squares plane, baseline ${r1(fp.baseline_m)} m`) : "—",
        status: !fp.valid ? "insufficient" : fp.slope_deg > lander.maxSlope ? "fail" : fp.enlarged ? "insufficient" : "pass",
        reason: !fp.valid ? x("nodata під апаратом", "nodata under the vehicle") : fp.slope_deg > lander.maxSlope ? x("Відоме порушення", "Known violation") : fp.enlarged ? x("Масштаб опор не розв'язано", "Footprint scale not resolved") : x("У допуску", "Within limit"),
      }),
    );
    criteria.push({ id: "miss", critical: false, label: x("Відхилення від цілі", "Miss distance"), value: r1(td.miss_m), unit: x("м", "m"), threshold: informational, source: sim, method: x("горизонтальна відстань", "horizontal distance"), status: "pass", reason: x("Без помилок навігації/вітру — ідеальний випадок", "No navigation errors / wind — ideal case") });
  }
  const reserve = lander.propellant * lander.reserveFraction;
  const kg = x("кг", "kg");
  criteria.push(
    crit({
      id: "fuel",
      label: x("Залишок палива", "Propellant remaining"),
      value: r1(descent.propellantRemaining),
      unit: kg,
      threshold: x(`≥ ${r1(reserve)} кг (${lander.reserveFraction * 100} % резерв)`, `≥ ${r1(reserve)} kg (${lander.reserveFraction * 100} % reserve)`),
      source: "preset",
      method: x("dm/dt = −T/(Isp·g0), без від'ємної маси", "dm/dt = −T/(Isp·g0), no negative mass"),
      status: descent.fuelOut ? "fail" : descent.propellantRemaining >= reserve ? "pass" : "fail",
      reason: descent.fuelOut ? x("Паливо вичерпано до торкання", "Propellant exhausted before touchdown") : descent.propellantRemaining >= reserve ? x("Резерв збережено", "Reserve kept") : x("Резерв порушено", "Reserve violated"),
    }),
  );
  criteria.push(
    crit({
      id: "corridor",
      label: x("Мін. clearance у коридорі заходу", "Min. clearance in the approach corridor"),
      value: descent.corridorMinClearance === null ? null : r1(descent.corridorMinClearance),
      unit: x("м", "m"),
      threshold: x(`≥ ${descent.corridorThreshold} м (далі 200 м від цілі)`, `≥ ${descent.corridorThreshold} m (beyond 200 m from target)`),
      source: x("DEM + траєкторія", "DEM + trajectory"),
      method: x("висота апарата − рельєф уздовж траси з урахуванням кривизни", "vehicle height − terrain along the track, curvature included"),
      status: descent.corridorMinClearance === null ? "insufficient" : descent.corridorMinClearance >= descent.corridorThreshold ? "pass" : "fail",
      reason: descent.corridorMinClearance === null ? x("Немає даних рельєфу під трасою", "No terrain data under the track") : descent.corridorMinClearance >= descent.corridorThreshold ? x("Запас висоти над рельєфом достатній", "Sufficient clearance above terrain") : x("Траєкторія надто близько до рельєфу", "Trajectory too close to terrain"),
    }),
  );
  criteria.push({ id: "sat", critical: false, label: x("Час у насиченні тяги", "Time in thrust saturation"), value: r1(descent.saturatedFraction * 100), unit: "%", threshold: informational, source: sim, method: x("частка кроків із T_cmd > T_max", "fraction of steps with T_cmd > T_max"), status: "pass", reason: x("Велике значення означає, що керування на межі можливостей", "A large value means guidance is at the edge of capability") });
  return {
    id: "landing",
    title,
    status: combine(criteria),
    criteria,
    unassessed: [x("Помилки навігації та датчиків", "Navigation and sensor errors"), x("Вітер (Марс/Земля)", "Wind (Mars/Earth)"), x("Динаміка обертання й сповзання опор", "Rotational dynamics and leg sliding"), x("Збої двигуна", "Engine failures")],
  };
}

export function transferCard(transfer, stack, extras = {}, lang = "uk") {
  const x = L(lang);
  const title = x("Переліт", "Transfer");
  if (!transfer) return { id: "transfer", title, status: "insufficient", criteria: [], error: x("Розрахунок не виконано", "Not computed"), unassessed: [] };
  if (transfer.applicable === false)
    return { id: "transfer", title, status: "na", criteria: [], note: x("Ціль — Земля: міжтілесний переліт не застосовується; аналізується лише локальний тестовий спуск.", "Target is Earth: no interplanetary transfer; only a local test descent is analysed."), unassessed: [] };
  const unmodelled = transfer.unmodelledKeys ? transferUnmodelled(transfer.unmodelledKeys, lang) : transfer.unmodelled || [];
  if (!transfer.best)
    return { id: "transfer", title, status: "insufficient", criteria: [], error: x("Немає розв'язку Lambert у заданому вікні", "No Lambert solution in the search window"), unassessed: unmodelled };
  const b = transfer.best;
  const { ascent, edl, edlVehicle } = extras;
  const criteria = [];
  const ms = x("м/с", "m/s");
  if (ascent) {
    criteria.push(
      crit({
        id: "launcher",
        label: x("Виведення стека на паркувальну орбіту", "Stack ascent to the parking orbit"),
        value: ascent.ok ? `${Math.round(ascent.perigeeAlt / 1000)}×${Math.round(ascent.apogeeAlt / 1000)} ${x("км", "km")}` : ascent.reason || x("не досягнуто", "not reached"),
        unit: "",
        threshold: x(`перигей ≥ ${Math.round((stack.parkingAltitude - 20000) / 1000)} км з корисним навантаженням ${Math.round(transfer.stackMass)} кг`, `perigee ≥ ${Math.round((stack.parkingAltitude - 20000) / 1000)} km with a ${Math.round(transfer.stackMass)} kg payload`),
        source: x("симуляція виведення (носій — навчальний preset)", "ascent simulation (educational launcher preset)"),
        method: ascent.model + (ascent.ok ? x(`; нахил ${ascent.kick_deg}°, програма тангажу ${ascent.pitchFrac}`, `; kick ${ascent.kick_deg}°, pitch programme ${ascent.pitchFrac}`) : ""),
        status: ascent.ok ? "pass" : "fail",
        reason: ascent.ok
          ? x(`Залишок палива 2-го ступеня ${Math.round(ascent.propellantLeft)} кг (${(ascent.propellantLeftFraction * 100).toFixed(1)} %)`, `Stage-2 propellant left ${Math.round(ascent.propellantLeft)} kg (${(ascent.propellantLeftFraction * 100).toFixed(1)} %)`)
          : x("Жоден варіант програми тангажу не вивів стек на орбіту: ", "No pitch programme reached orbit: ") + Object.entries(ascent.reasons || {}).map(([k, n]) => `${k}×${n}`).join(", "),
      }),
    );
    if (ascent.ok)
      criteria.push({
        id: "ascent-losses",
        critical: false,
        label: x("Втрати на виведенні (розраховано)", "Ascent losses (computed)"),
        value: Math.round(ascent.gravityLoss + ascent.dragLoss + ascent.steeringLoss),
        unit: ms,
        threshold: x("інформаційно", "informational"),
        source: x("симуляція", "simulation"),
        method: x(
          `гравітаційні ${Math.round(ascent.gravityLoss)} + аеродинамічні ${Math.round(ascent.dragLoss)} + керування ${Math.round(ascent.steeringLoss)}; внесок обертання Землі +${Math.round(ascent.rotationBonus)}; max q ${(ascent.maxQ / 1000).toFixed(1)} кПа`,
          `gravity ${Math.round(ascent.gravityLoss)} + drag ${Math.round(ascent.dragLoss)} + steering ${Math.round(ascent.steeringLoss)}; Earth rotation +${Math.round(ascent.rotationBonus)}; max q ${(ascent.maxQ / 1000).toFixed(1)} kPa`,
        ),
        status: "pass",
        reason: x("Без дроселювання для max q і без 3-D маневру площини", "No max-q throttling and no 3-D plane manoeuvre"),
      });
  }
  criteria.push(
    crit({
      id: "dv",
      label: x("Потрібна Δv перелітного ступеня", "Required transfer-stage Δv"),
      value: Math.round(b.dvStage),
      unit: ms,
      threshold: x(`≤ ${Math.round(transfer.dvAvailable)} м/с (ідеальна, Isp·g0·ln(m0/mf))`, `≤ ${Math.round(transfer.dvAvailable)} m/s (ideal, Isp·g0·ln(m0/mf))`),
      source: x("Lambert + рівняння Ціолковського", "Lambert + rocket equation"),
      method: dvBreakdown(b, lang),
      status: b.dvStage <= transfer.dvAvailable ? "pass" : "fail",
      reason: b.dvStage <= transfer.dvAvailable ? x("Ідеального запасу Δv вистачає (без втрат, корекцій і маневрів)", "Ideal Δv is sufficient (no losses, corrections or manoeuvres)") : x("Ідеальної Δv недостатньо", "Ideal Δv is insufficient"),
    }),
  );
  if (b.dla_deg !== undefined)
    criteria.push({ id: "dla", critical: false, label: x("Схилення асимптоти відльоту (DLA)", "Declination of the launch asymptote (DLA)"), value: r1(b.dla_deg), unit: "°", threshold: x(`|DLA| ≤ нахил парк. орбіти ≥ |широта старту| = ${r1(Math.abs(transfer.launchLat))}°`, `|DLA| ≤ parking-orbit inclination ≥ |launch latitude| = ${r1(Math.abs(transfer.launchLat))}°`), source: "Lambert", method: x("v∞ у екваторіальній системі J2000", "v∞ in the J2000 equatorial frame"), status: "pass", reason: x("Інформаційно: визначає мінімальний нахил паркувальної орбіти", "Informational: sets the minimum parking-orbit inclination") });
  if (b.entrySpeed !== undefined) {
    if (edl && edlVehicle) criteria.push(...edlCriteria(edl, edlVehicle, lang));
    else criteria.push(crit({ id: "edl", label: x("Вхід в атмосферу Марса (EDL)", "Mars atmospheric entry (EDL)"), value: Math.round(b.entrySpeed), unit: ms, threshold: x("потрібна симуляція EDL", "EDL simulation required"), source: x("Lambert v∞ + енергія", "Lambert v∞ + energy"), method: "v_entry = √(v∞² + 2μ/r_entry)", status: "insufficient", reason: x("EDL не розраховано", "EDL not computed") }));
  }
  return { id: "transfer", title, status: combine(criteria), criteria, unassessed: unmodelled };
}

export function dvBreakdown(b, lang = "uk") {
  const x = L(lang);
  const R = Math.round;
  if (b.dvTLI !== undefined)
    return x(`TLI ${R(b.dvTLI)} + LOI ${R(b.dvLOI)} + гальмування до старту спуску ≈${R(b.dvBrake)} м/с (оцінка)`, `TLI ${R(b.dvTLI)} + LOI ${R(b.dvLOI)} + braking to descent start ≈${R(b.dvBrake)} m/s (estimate)`);
  if (b.entrySpeed === undefined) return x(`TMI ${R(b.dvDep)} + MOI ${R(b.dvCap)} м/с (ідеальні імпульси)`, `TMI ${R(b.dvDep)} + MOI ${R(b.dvCap)} m/s (ideal impulses)`);
  return x(`TMI ${R(b.dvDep)} м/с; прибуття — прямий вхід в атмосферу (EDL моделюється окремо)`, `TMI ${R(b.dvDep)} m/s; arrival by direct atmospheric entry (EDL modelled separately)`);
}

export function transferUnmodelled(keys, lang = "uk") {
  const x = L(lang);
  const T = {
    moonGravity: x("Гравітація Місяця на перельоті (patched conic)", "Lunar gravity during the transfer (patched conic)"),
    sun: x("Вплив Сонця, тиск світла", "Solar gravity and radiation pressure"),
    tcm: x("Корекції траєкторії (TCM) і навігаційні похибки", "Trajectory correction manoeuvres (TCM) and navigation errors"),
    plane: x("Вибір площини парк. орбіти та часу старту в межах доби", "Parking-orbit plane and launch time within the day"),
    lowEnergy: x("Низькоенергетичні/багатотільні траєкторії — не підтримуються", "Low-energy / multi-body trajectories — not supported"),
    edlSimplified: x("EDL — лише спрощена планарна модель (без радіаційного нагріву, вітру, 3-D і похибок навігації)", "EDL is a simplified planar model only (no radiative heating, wind, 3-D or navigation errors)"),
    srp: x("Тиск сонячного світла, збурення інших планет", "Solar radiation pressure, perturbations by other planets"),
  };
  return keys.map((k) => T[k] || k);
}
