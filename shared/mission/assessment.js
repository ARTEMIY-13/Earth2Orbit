// Three independent verdict cards: terrain, vehicle landing, transfer.
// Status vocabulary: "pass" = відповідає умовам моделі, "fail" = не відповідає,
// "insufficient" = недостатньо даних, "na" = не застосовно.
// Rule: any critical "fail" → card fail; else any critical "insufficient" →
// card insufficient; only then pass. Unknowns never become a pass.
import { edlCriteria } from "./edl.js";
import { pixelsInEllipse, regionStats, footprintPlane, meanSpacing, roughnessWindow } from "../terrain/analysis.js";

export const STATUS_LABELS = {
  pass: "відповідає умовам моделі",
  fail: "не відповідає",
  insufficient: "недостатньо даних",
  na: "не застосовно",
};

export const UNASSESSED_SURFACE = [
  "Несуча здатність ґрунту / реголіту",
  "Пил і ерозія струменем двигуна (plume–surface interaction)",
  "Камені й кратери менші за піксель DEM",
  "Підповерхневі порожнини, лід, лавові трубки",
  "Освітлення, тепловий режим і зв'язок у момент посадки",
];

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
export function terrainCard(grid, site, lander, ellipse) {
  const px = meanSpacing(grid);
  const footR = lander.footprintDiameter / 2;
  const ell = pixelsInEllipse(grid, site.col, site.row, ellipse.a_m, ellipse.b_m, ellipse.azimuth_deg);
  const stats = regionStats(grid, ell);
  const fp = footprintPlane(grid, site.col, site.row, footR);
  const rw = roughnessWindow(grid);
  const criteria = [];
  const src = grid.meta?.source?.productId || grid.meta?.id || "DEM";

  criteria.push(
    crit({
      id: "coverage",
      label: "Покриття даними в еліпсі",
      value: r1((1 - stats.nodataFraction) * 100),
      unit: "%",
      threshold: "≥ 99 % валідних пікселів, ≥ 25 пікселів",
      source: src,
      method: "Частка пікселів DEM без nodata всередині еліпса",
      status: stats.count < 25 ? "insufficient" : stats.nodataFraction > 0.01 ? "insufficient" : "pass",
      reason:
        stats.count < 25
          ? `Еліпс охоплює лише ${stats.count} пікс. — замало для статистики`
          : stats.nodataFraction > 0.01
            ? "Є прогалини DEM; вони не інтерпольовані й не вважаються безпечними"
            : "Покриття повне",
    }),
  );
  const resolvable = px <= footR; // ≥ 2 px across footprint
  criteria.push(
    crit({
      id: "resolution",
      label: "Роздільність vs розмір опор",
      value: r1(px),
      unit: "м/пікс.",
      threshold: `≤ ${r1(footR)} м (≥ 2 пікс. на діаметр опор ${lander.footprintDiameter} м)`,
      source: src,
      method: "Порівняння кроку сітки з діаметром опорного контуру",
      status: resolvable ? "pass" : "insufficient",
      reason: resolvable
        ? "Схил під опорами розв'язується DEM"
        : `Піксель ${r1(px)} м більший за радіус опор — небезпеки масштабу опор (камені, малі кратери) не видно; їхня відсутність НЕ доведена`,
    }),
  );
  if (fp.valid) {
    const slopeStatus = fp.slope_deg > lander.maxSlope ? "fail" : fp.enlarged ? "insufficient" : "pass";
    criteria.push(
      crit({
        id: "footprint-slope",
        label: "Ухил під апаратом",
        value: r1(fp.slope_deg),
        unit: "°",
        threshold: `≤ ${lander.maxSlope}° (preset)`,
        source: src,
        method: `Площина МНК по ${fp.count} пікс., база ${r1(fp.baseline_m)} м`,
        status: slopeStatus,
        reason:
          slopeStatus === "fail"
            ? "Ухил на базі DEM перевищує допуск — відоме порушення"
            : fp.enlarged
              ? `Опори менші за 3×3 пікс.; ухил виміряно на базі ${r1(fp.baseline_m)} м, на масштабі опор може бути більшим`
              : "У межах допуску на масштабі DEM",
      }),
    );
    const resStatus = !resolvable ? "insufficient" : fp.maxResidual_m > lander.maxLegHeightDiff ? "fail" : "pass";
    criteria.push(
      crit({
        id: "leg-relief",
        label: "Перепад під опорами (відхилення від площини)",
        value: r1(fp.maxResidual_m, 2),
        unit: "м",
        threshold: `≤ ${lander.maxLegHeightDiff} м`,
        source: src,
        method: "Макс. |залишок| від площини під опорним контуром",
        status: resStatus,
        reason:
          resStatus === "insufficient"
            ? "Перепад на масштабі опор менший за роздільність — невідомий"
            : resStatus === "fail"
              ? "Перепад перевищує допуск"
              : "У межах допуску (лише на масштабі DEM)",
      }),
    );
  } else {
    criteria.push(crit({ id: "footprint-slope", label: "Ухил під апаратом", value: null, unit: "°", threshold: `≤ ${lander.maxSlope}°`, source: src, method: "Площина МНК", status: "insufficient", reason: "У контурі опор є nodata" }));
  }
  criteria.push(
    crit({
      id: "ellipse-slope",
      label: "Ухил у посадковому еліпсі (P95)",
      value: r1(stats.slopeP95),
      unit: "°",
      threshold: `P95 ≤ ${lander.maxSlope}°`,
      source: src,
      method: `Horn 3×3, база ${r1(2 * px)} м; макс. ${r1(stats.slopeMax)}°`,
      status: !Number.isFinite(stats.slopeP95) ? "insufficient" : stats.slopeP95 > lander.maxSlope ? "fail" : "pass",
      reason: !Number.isFinite(stats.slopeP95)
        ? "Немає валідних ухилів"
        : stats.slopeP95 > lander.maxSlope
          ? "Понад 5 % площі еліпса крутіше за допуск (з урахуванням похибки наведення)"
          : "Більша частина еліпса в межах допуску",
    }),
  );
  criteria.push({
    id: "roughness",
    critical: false,
    label: "Шорсткість (P95)",
    value: r1(stats.roughnessP95, 2),
    unit: "м",
    threshold: "інформаційно",
    source: src,
    method: `${rw.metric}, вікно ${rw.pixels}×${rw.pixels} пікс. ≈ ${r1(rw.metres, 0)} м`,
    status: Number.isFinite(stats.roughnessP95) ? "pass" : "insufficient",
    reason: "Метрика залежить від масштабу вікна; не порівнюй із шорсткістю на іншому масштабі",
  });
  return {
    id: "terrain",
    title: "Рельєф",
    status: combine(criteria),
    criteria,
    stats,
    footprint: fp,
    ellipse: { ...ellipse, pixels: ell.length },
    unassessed: UNASSESSED_SURFACE,
  };
}

export function landingCard(descent, lander) {
  if (!descent || !descent.ok)
    return { id: "landing", title: "Посадка апарата", status: "insufficient", criteria: [], error: descent?.error || "Симуляцію не виконано", unassessed: [] };
  const criteria = [];
  const td = descent.touchdown;
  criteria.push(
    crit({
      id: "twr",
      label: "Тяга / вага на старті спуску",
      value: r1(descent.thrustToWeight, 2),
      unit: "",
      threshold: "> 1.0",
      source: "preset + g тіла",
      method: "T_max / (m0 · g_local)",
      status: descent.thrustToWeight > 1 ? "pass" : "fail",
      reason: descent.thrustToWeight > 1 ? "Апарат може зависати" : "Тяги недостатньо, щоб утримати масу в цьому полі тяжіння",
    }),
  );
  const contactOk = descent.outcome === "contact";
  criteria.push(
    crit({
      id: "contact",
      label: "Контакт з поверхнею",
      value: descent.outcome,
      unit: "",
      threshold: "контакт у межах DEM",
      source: "симуляція",
      method: descent.model,
      status: contactOk ? "pass" : descent.outcome === "left-coverage" ? "insufficient" : "fail",
      reason: contactOk ? `t = ${r1(td.t)} с` : descent.outcome === "left-coverage" ? "Траєкторія вийшла за межі DEM — рельєф невідомий" : "Посадки не відбулося (" + descent.outcome + ")",
    }),
  );
  if (td) {
    criteria.push(crit({ id: "vz", label: "Вертикальна швидкість торкання", value: r1(td.vVertical, 2), unit: "м/с", threshold: `≤ ${lander.maxVerticalTouchdown}`, source: "preset", method: "стан у момент перетину DEM (бісекція між кроками)", status: td.vVertical <= lander.maxVerticalTouchdown ? "pass" : "fail", reason: td.vVertical <= lander.maxVerticalTouchdown ? "У допуску" : "Перевищення — жорстка посадка/аварія" }));
    criteria.push(crit({ id: "vh", label: "Горизонтальна швидкість торкання", value: r1(td.vHorizontal, 2), unit: "м/с", threshold: `≤ ${lander.maxHorizontalTouchdown}`, source: "preset", method: "|v_xy| у момент контакту", status: td.vHorizontal <= lander.maxHorizontalTouchdown ? "pass" : "fail", reason: td.vHorizontal <= lander.maxHorizontalTouchdown ? "У допуску" : "Ризик перекидання" }));
    if (td.thrustTilt_deg !== null)
      criteria.push(crit({ id: "tilt", label: "Нахил апарата при торканні", value: r1(td.thrustTilt_deg), unit: "°", threshold: `≤ ${lander.maxTilt}`, source: "preset", method: "орієнтація = напрям тяги (без динаміки обертання)", status: td.thrustTilt_deg <= lander.maxTilt ? "pass" : "fail", reason: "Модель орієнтації спрощена" }));
    const fp = td.footprint;
    criteria.push(
      crit({
        id: "td-slope",
        label: "Ухил у точці контакту",
        value: fp.valid ? r1(fp.slope_deg) : null,
        unit: "°",
        threshold: `≤ ${lander.maxSlope}`,
        source: "DEM",
        method: fp.valid ? `площина МНК, база ${r1(fp.baseline_m)} м` : "—",
        status: !fp.valid ? "insufficient" : fp.slope_deg > lander.maxSlope ? "fail" : fp.enlarged ? "insufficient" : "pass",
        reason: !fp.valid ? "nodata під апаратом" : fp.slope_deg > lander.maxSlope ? "Відоме порушення" : fp.enlarged ? "Масштаб опор не розв'язано" : "У допуску",
      }),
    );
    criteria.push({ id: "miss", critical: false, label: "Відхилення від цілі", value: r1(td.miss_m), unit: "м", threshold: "інформаційно", source: "симуляція", method: "горизонтальна відстань", status: "pass", reason: "Без помилок навігації/вітру — ідеальний випадок" });
  }
  const reserve = lander.propellant * lander.reserveFraction;
  criteria.push(
    crit({
      id: "fuel",
      label: "Залишок палива",
      value: r1(descent.propellantRemaining),
      unit: "кг",
      threshold: `≥ ${r1(reserve)} кг (${lander.reserveFraction * 100} % резерв)`,
      source: "preset",
      method: "dm/dt = −T/(Isp·g0), без від'ємної маси",
      status: descent.fuelOut ? "fail" : descent.propellantRemaining >= reserve ? "pass" : "fail",
      reason: descent.fuelOut ? "Паливо вичерпано до торкання" : descent.propellantRemaining >= reserve ? "Резерв збережено" : "Резерв порушено",
    }),
  );
  criteria.push(
    crit({
      id: "corridor",
      label: "Мін. clearance у коридорі заходу",
      value: descent.corridorMinClearance === null ? null : r1(descent.corridorMinClearance),
      unit: "м",
      threshold: `≥ ${descent.corridorThreshold} м (далі 200 м від цілі)`,
      source: "DEM + траєкторія",
      method: "висота апарата − рельєф уздовж траси з урахуванням кривизни",
      status: descent.corridorMinClearance === null ? "insufficient" : descent.corridorMinClearance >= descent.corridorThreshold ? "pass" : "fail",
      reason: descent.corridorMinClearance === null ? "Немає даних рельєфу під трасою" : descent.corridorMinClearance >= descent.corridorThreshold ? "Запас висоти над рельєфом достатній" : "Траєкторія надто близько до рельєфу",
    }),
  );
  criteria.push({ id: "sat", critical: false, label: "Час у насиченні тяги", value: r1(descent.saturatedFraction * 100), unit: "%", threshold: "інформаційно", source: "симуляція", method: "частка кроків із T_cmd > T_max", status: "pass", reason: "Велике значення означає, що керування на межі можливостей" });
  return {
    id: "landing",
    title: "Посадка апарата",
    status: combine(criteria),
    criteria,
    unassessed: ["Помилки навігації та датчиків", "Вітер (Марс/Земля)", "Динаміка обертання й сповзання опор", "Збої двигуна"],
  };
}

export function transferCard(transfer, stack, extras = {}) {
  if (!transfer) return { id: "transfer", title: "Переліт", status: "insufficient", criteria: [], error: "Розрахунок не виконано", unassessed: [] };
  if (transfer.applicable === false)
    return { id: "transfer", title: "Переліт", status: "na", criteria: [], note: transfer.note, unassessed: [] };
  if (!transfer.best)
    return { id: "transfer", title: "Переліт", status: "insufficient", criteria: [], error: transfer.error || "Розв'язок Lambert не знайдено у вікні", unassessed: transfer.unmodelled || [] };
  const b = transfer.best;
  const { ascent, edl, edlVehicle } = extras;
  const criteria = [];
  if (ascent) {
    criteria.push(
      crit({
        id: "launcher",
        label: "Виведення стека на паркувальну орбіту",
        value: ascent.ok ? `${Math.round(ascent.perigeeAlt / 1000)}×${Math.round(ascent.apogeeAlt / 1000)} км` : ascent.reason || "не досягнуто",
        unit: "",
        threshold: `перигей ≥ ${Math.round((stack.parkingAltitude - 20000) / 1000)} км з корисним навантаженням ${Math.round(transfer.stackMass)} кг`,
        source: "симуляція виведення (носій — навчальний preset)",
        method: ascent.model + (ascent.ok ? `; нахил ${ascent.kick_deg}°, програма тангажу ${ascent.pitchFrac}` : ""),
        status: ascent.ok ? "pass" : "fail",
        reason: ascent.ok
          ? `Залишок палива 2-го ступеня ${Math.round(ascent.propellantLeft)} кг (${(ascent.propellantLeftFraction * 100).toFixed(1)} %)`
          : "Жоден варіант програми тангажу не вивів стек на орбіту: " + Object.entries(ascent.reasons || {}).map(([k, n]) => `${k}×${n}`).join(", "),
      }),
    );
    if (ascent.ok)
      criteria.push({
        id: "ascent-losses",
        critical: false,
        label: "Втрати на виведенні (розраховано)",
        value: Math.round(ascent.gravityLoss + ascent.dragLoss + ascent.steeringLoss),
        unit: "м/с",
        threshold: "інформаційно",
        source: "симуляція",
        method: `гравітаційні ${Math.round(ascent.gravityLoss)} + аеродинамічні ${Math.round(ascent.dragLoss)} + керування ${Math.round(ascent.steeringLoss)}; внесок обертання Землі +${Math.round(ascent.rotationBonus)}; max q ${(ascent.maxQ / 1000).toFixed(1)} кПа`,
        status: "pass",
        reason: "Без дроселювання для max q і без 3-D маневру площини",
      });
  }
  criteria.push(
    crit({
      id: "dv",
      label: "Потрібна Δv перелітного ступеня",
      value: Math.round(b.dvStage),
      unit: "м/с",
      threshold: `≤ ${Math.round(transfer.dvAvailable)} м/с (ідеальна, Isp·g0·ln(m0/mf))`,
      source: "Lambert + рівняння Ціолковського",
      method: b.dvBreakdown,
      status: b.dvStage <= transfer.dvAvailable ? "pass" : "fail",
      reason: b.dvStage <= transfer.dvAvailable ? "Ідеального запасу Δv вистачає (без втрат, корекцій і маневрів)" : "Ідеальної Δv недостатньо",
    }),
  );
  if (b.dla_deg !== undefined)
    criteria.push({ id: "dla", critical: false, label: "Схилення асимптоти відльоту (DLA)", value: r1(b.dla_deg), unit: "°", threshold: `|DLA| ≤ нахил парк. орбіти ≥ |широта старту| = ${r1(Math.abs(transfer.launchLat))}°`, source: "Lambert", method: "v∞ у екваторіальній системі J2000", status: "pass", reason: "Інформаційно: визначає мінімальний нахил паркувальної орбіти" });
  if (b.entrySpeed !== undefined) {
    if (edl && edlVehicle) criteria.push(...edlCriteria(edl, edlVehicle));
    else criteria.push(crit({ id: "edl", label: "Вхід в атмосферу Марса (EDL)", value: Math.round(b.entrySpeed), unit: "м/с", threshold: "потрібна симуляція EDL", source: "Lambert v∞ + енергія", method: "v_entry = √(v∞² + 2μ/r_entry)", status: "insufficient", reason: "EDL не розраховано" }));
  }
  return {
    id: "transfer",
    title: "Переліт",
    status: combine(criteria),
    criteria,
    unassessed: transfer.unmodelled || [],
  };
}
