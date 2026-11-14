import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./mission.css";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { loadDemIndex, loadDemData, loadCapabilities, loadLiveEarthDem, horizonsState } from "../../lib/dem.js";
import { createMissionClient } from "../../lib/missionWorker.js";
import { makeGrid, offsetToPixel } from "../../../shared/terrain/analysis.js";
import { latLonToPixel, pixelToLatLon, haversine } from "../../../shared/terrain/georef.js";
import { ANALOG_LIMITS_I18N } from "../../../shared/terrain/analogs.js";
import { terrainCard, landingCard, transferCard, dvBreakdown } from "../../../shared/mission/assessment.js";
import { bi, pick } from "../../i18n/bilingual.js";
import { localFrame } from "../../../shared/mission/descent.js";
import { VEHICLE_PRESETS, STACK_DEFAULTS, DEFAULT_PRESET_BY_BODY, DEFAULT_START_BY_BODY, presetById, values, validateLander, LAUNCHER_PRESETS, launcherValues, edlValues } from "../../../shared/mission/vehicles.js";
import { zonedToUtc, formatUtc, formatZone, formatDuration } from "../../../shared/mission/time.js";
import { bodyState, moonState } from "../../../shared/mission/ephemeris.js";
import { buildPhases, stateAt } from "../../../shared/mission/timeline.js";
import { buildScenario, parseScenario, profileCSV } from "../../../shared/mission/scenario.js";
import { BODIES } from "../../../shared/mission/bodies.js";
import { criteria } from "../../../shared/catalog.js";
import DemMap from "./DemMap.jsx";
import { LAYERS, layerColors } from "./layers.js";
import VerdictCard from "./VerdictCard.jsx";
import ImagingPanel from "./ImagingPanel.jsx";
import { ProfileChart, SeriesChart, Porkchop, SlopeHistogram } from "./charts.jsx";
import { createMissionScene } from "../../scene/landing.js";

const BODY_NAME = { uk: { moon: "Місяць", mars: "Марс", earth: "Земля" }, en: { moon: "Moon", mars: "Mars", earth: "Earth" } };
const LAUNCH_SITES = [
  { id: "ksc", name: "Космічний центр Кеннеді (США)", nameEn: "Kennedy Space Center (USA)", lat: 28.573, lon: -80.649 },
  { id: "kourou", name: "Куру (Французька Гвіана)", nameEn: "Kourou (French Guiana)", lat: 5.236, lon: -52.775 },
  { id: "tanegashima", name: "Танеґасіма (Японія)", nameEn: "Tanegashima (Japan)", lat: 30.4, lon: 130.97 },
  { id: "sriharikota", name: "Шріхаріхота (Індія)", nameEn: "Sriharikota (India)", lat: 13.72, lon: 80.23 },
  { id: "custom", name: "Інша точка (вкажи широту)", nameEn: "Other site (enter latitude)", lat: 45, lon: 30 },
];
const TRANSFER_DEFAULTS = {
  moon: { windowDays: 30, tofMinDays: 3, tofMaxDays: 6, depStepDays: 0.25, tofStepDays: 0.125, arrivalMode: "capture" },
  mars: { windowDays: 120, tofMinDays: 150, tofMaxDays: 330, depStepDays: 2, tofStepDays: 5, arrivalMode: "entry" },
};
const ELLIPSE_DEFAULTS = {
  moon: { a_m: 300, b_m: 150 },
  mars: { a_m: 7500, b_m: 3500 },
  earth: { a_m: 100, b_m: 60 },
};
const LANDER_FIELDS = [
  ["dryMass", "Суха маса", "кг", "Dry mass", "kg"],
  ["propellant", "Паливо", "кг", "Propellant", "kg"],
  ["thrustMax", "Тяга макс.", "Н", "Max thrust", "N"],
  ["throttleMin", "Мін. дросель", "частка", "Min throttle", "fraction"],
  ["isp", "Isp", "с", "Isp", "s"],
  ["footprintDiameter", "Діаметр опор", "м", "Footprint diameter", "m"],
  ["maxSlope", "Допустимий ухил", "°", "Max slope", "°"],
  ["maxLegHeightDiff", "Перепад під опорами", "м", "Leg height difference", "m"],
  ["maxVerticalTouchdown", "Верт. швидкість торкання", "м/с", "Vertical touchdown speed", "m/s"],
  ["maxHorizontalTouchdown", "Гориз. швидкість торкання", "м/с", "Horizontal touchdown speed", "m/s"],
  ["maxTilt", "Допустимий нахил", "°", "Max tilt", "°"],
  ["reserveFraction", "Резерв палива", "частка", "Propellant reserve", "fraction"],
  ["maxThrustTilt", "Макс. відхилення тяги", "°", "Max thrust tilt", "°"],
  ["dragArea", "Cd·A (атмосфера)", "м²", "Cd·A (atmosphere)", "m²"],
];
const PHASE_WEIGHT = { ascent: 0.05, parking: 0.05, cruise: 0.35, arrival: 0.1, descent: 0.45 };
const PHASE_RATE = { ascent: 60, parking: 900, cruise: 2 * 86400, arrival: 1800, descent: 1 };

function datasetCentre(d) {
  return pixelToLatLon(d.georef, (d.width - 1) / 2, (d.height - 1) / 2);
}
function pickDataset(list, body, site) {
  const own = list.filter((d) => d.body === body && !d.id.endsWith("-coarse"));
  if (!own.length) return null;
  if (site?.id) {
    const byCat = own.find((d) => d.catalogId === site.id);
    if (byCat) return byCat;
  }
  if (!site) return own[0];
  const R = BODIES[body].meanRadius;
  return own
    .map((d) => {
      const c = datasetCentre(d);
      return { d, dist: haversine(site.lat, site.lon, c.lat, c.lon, R) };
    })
    .sort((a, b) => a.dist - b.dist)[0].d;
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const key = (o) => JSON.stringify(o);
const r1 = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

export default function MissionPlanner({ body: initialBody, site: catalogSite, earthSites = [], onClose }) {
  const { tr, lang } = useLang();
  const X = useCallback((uk, en) => (lang === "en" ? en : uk), [lang]);
  const dialog = useRef(null);
  const client = useRef(null);
  const sceneCanvas = useRef(null);
  const scene = useRef(null);
  const importInput = useRef(null);
  const [index, setIndex] = useState(null);
  const [caps, setCaps] = useState(null);
  const [error, setError] = useState("");
  const [datasetId, setDatasetId] = useState(null);
  const [dem, setDem] = useState(null); // { meta, buffer }
  const [layers, setLayers] = useState(null);
  const [layer, setLayer] = useState("elevation");
  const [showContours, setShowContours] = useState(false);
  const [contours, setContours] = useState(null);
  const [mapMode, setMapMode] = useState("site");
  const [site, setSite] = useState(null);
  const [approach, setApproach] = useState(90);
  const [ellipse, setEllipse] = useState({ ...ELLIPSE_DEFAULTS[initialBody] || ELLIPSE_DEFAULTS.moon, origin: "user-assumption" });
  const [profileLength, setProfileLength] = useState(3000);
  const [polyline, setPolyline] = useState([]);
  const [vehicleId, setVehicleId] = useState(DEFAULT_PRESET_BY_BODY[initialBody] || "edu-robotic");
  const [lander, setLander] = useState(() => structuredClone(presetById(DEFAULT_PRESET_BY_BODY[initialBody] || "edu-robotic").lander));
  const [start, setStart] = useState({ ...(DEFAULT_START_BY_BODY[initialBody] || DEFAULT_START_BY_BODY.moon) });
  const [stack, setStack] = useState(() => structuredClone(STACK_DEFAULTS));
  const [launcher, setLauncher] = useState(() => structuredClone(LAUNCHER_PRESETS[0]));
  const [edlParams, setEdlParams] = useState(() => structuredClone(presetById("edu-mars").edl));
  const [launch, setLaunch] = useState({ local: "2026-11-14T12:00", timeZone: "Europe/Kyiv", siteId: "ksc", lat: 28.573 });
  const [transferOpts, setTransferOpts] = useState(TRANSFER_DEFAULTS[initialBody] || TRANSFER_DEFAULTS.moon);
  const [exaggeration, setExaggeration] = useState(3);
  const [busy, setBusy] = useState(null); // { label, progress }
  const [res, setRes] = useState({}); // { analysis, descent, transfer, analogs, keys }
  const [hoverProfile, setHoverProfile] = useState({ which: "along", i: null });
  const [bottomTab, setBottomTab] = useState("profiles");
  const [centerTab, setCenterTab] = useState("map");
  const [webglError, setWebglError] = useState("");
  const [scaleInfo, setScaleInfo] = useState(null);
  const [play, setPlay] = useState({ phase: 0, local: 0, playing: false, speed: 1 });
  const [cam, setCam] = useState("overview");
  const [liveLat, setLiveLat] = useState(catalogSite?.lat?.toFixed(3) ?? "");
  const [liveLon, setLiveLon] = useState(catalogSite?.lon?.toFixed(3) ?? "");
  const [liveSource, setLiveSource] = useState("copernicus");
  const [hzCheck, setHzCheck] = useState(null);
  const [importNote, setImportNote] = useState("");
  const [footprintsLL, setFootprintsLL] = useState([]);

  const meta = dem?.meta;
  const body = meta?.body || initialBody;
  const L = useMemo(() => values(lander), [lander]);
  const S = useMemo(() => values(stack), [stack]);
  const landerErrors = validateLander(L);
  const grid = useMemo(() => (dem ? makeGrid(dem.meta.width, dem.meta.height, new Float32Array(dem.buffer), dem.meta.georef, dem.meta) : null), [dem]);
  const launchUtc = useMemo(() => {
    try {
      return zonedToUtc(launch.local, launch.timeZone);
    } catch {
      return NaN;
    }
  }, [launch.local, launch.timeZone]);

  // ---- lifecycle -----------------------------------------------------------
  useEffect(() => {
    dialog.current?.showModal?.();
    client.current = createMissionClient();
    let alive = true;
    Promise.all([loadDemIndex(), loadCapabilities()])
      .then(([list, c]) => {
        if (!alive) return;
        setIndex(list);
        setCaps(c);
        const d = pickDataset(list, initialBody, catalogSite);
        if (d) setDatasetId(d.id);
        else setError(bi("Для цього тіла немає підготовленого DEM.", "No prepared DEM for this body."));
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      client.current?.destroy();
      client.current = null;
      // dialog is closed by React unmount
    };
  }, [initialBody, catalogSite]);

  // ---- dataset loading ---------------------------------------------------
  const pendingImport = useRef(null);
  const initSiteFor = useCallback(
    (m) => {
      const imp = pendingImport.current?.inputs;
      if (imp && imp.datasetId === m.id) {
        setSite(imp.site);
        setPolyline(imp.polyline || []);
        return;
      }
      let p = { col: Math.floor(m.width / 2), row: Math.floor(m.height / 2) };
      if (catalogSite && catalogSite.body === m.body) {
        const q = latLonToPixel(m.georef, catalogSite.lat, catalogSite.lon);
        if (q.col > 2 && q.row > 2 && q.col < m.width - 3 && q.row < m.height - 3) p = { col: Math.round(q.col), row: Math.round(q.row) };
      }
      setSite(p);
      setPolyline([]);
      setProfileLength(Math.round(Math.min(m.width * m.resolution_m * 0.6, 20000)));
    },
    [catalogSite],
  );
  useEffect(() => {
    if (!datasetId || !index) return;
    const m = index.find((d) => d.id === datasetId);
    if (!m || dem?.meta.id === datasetId) return;
    const ctrl = new AbortController();
    loadDemData(m, ctrl.signal)
      .then(async (d) => {
        const ly = await client.current.ensureLoaded(d.meta, d.buffer);
        if (ctrl.signal.aborted) return;
        setError("");
        setDem(d);
        setLayers(ly);
        initSiteFor(d.meta);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, [datasetId, index, dem, initSiteFor]);

  useEffect(() => {
    if (!showContours || !meta || !layers) return;
    const relief = (meta.stats?.max ?? 0) - (meta.stats?.min ?? 0);
    const interval = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((v) => relief / v <= 25) || 1000;
    client.current.call("contours", { datasetId: meta.id, interval }).then((c) => setContours({ ...c, id: meta.id })).catch(() => {});
  }, [showContours, meta, layers]);

  // ---- derived overlays ------------------------------------------------------
  const ellipseOutline = useMemo(() => {
    if (!grid || !site) return null;
    const pts = [];
    const az = (approach * Math.PI) / 180;
    for (let k = 0; k <= 72; k++) {
      const t = (k / 72) * 2 * Math.PI;
      const along = ellipse.a_m * Math.cos(t),
        across = ellipse.b_m * Math.sin(t);
      pts.push(offsetToPixel(grid, site.col, site.row, along * Math.sin(az) + across * Math.cos(az), along * Math.cos(az) - across * Math.sin(az)));
    }
    return pts;
  }, [grid, site, ellipse, approach]);
  const footprints = useMemo(
    () => (meta ? footprintsLL.map((poly) => poly.map((p) => latLonToPixel(meta.georef, p.lat, p.lon))) : []),
    [footprintsLL, meta],
  );
  const approachLine = useMemo(() => {
    if (!grid || !site) return null;
    const az = (approach * Math.PI) / 180;
    return [offsetToPixel(grid, site.col, site.row, -Math.sin(az) * start.downrange, -Math.cos(az) * start.downrange), site];
  }, [grid, site, approach, start.downrange]);

  // ---- staleness keys ------------------------------------------------------------
  const terrainKey = key({ datasetId, site, ellipse, approach, profileLength, polyline, L });
  const descentKey = key({ datasetId, site, approach, L, start });
  const LV = useMemo(() => launcherValues(launcher), [launcher]);
  const marsEntry = body === "mars" && transferOpts.arrivalMode === "entry";
  const EV = useMemo(() => (marsEntry ? edlValues(edlParams, L.dryMass + L.propellant) : null), [marsEntry, edlParams, L.dryMass, L.propellant]);
  const transferKey = key({ body, launchUtc, lat: launch.lat, transferOpts, S, m: L.dryMass + L.propellant, hs: start.horizontalSpeed, LV, EV, site });
  const analogKey = key({ datasetId });

  // ---- computations ------------------------------------------------------------
  const runAll = useCallback(async () => {
    if (!meta || !site || landerErrors.length) return;
    const c = client.current;
    const out = { keys: {} };
    setRes((r) => ({ ...r, error: null }));
    try {
      setBusy({ label: X("Аналіз рельєфу…", "Analysing terrain…"), progress: 0.05 });
      await c.ensureLoaded(dem.meta, dem.buffer);
      out.analysis = await c.call("analyze", { datasetId: meta.id, site, ellipse: { ...ellipse, azimuth_deg: approach }, lander: L, approachAzimuth: approach, profileLength, polyline: polyline.length >= 2 ? polyline : null });
      out.keys.terrain = terrainKey;
      // inputs frozen at compute time: verdict cards are re-derived from them in the current language
      out.inputs = { datasetId: meta.id, site, ellipse: { ...ellipse, azimuth_deg: approach }, lander: L, stack: S, edlVehicle: EV, body: meta.body };
      setBusy({ label: X("Симуляція спуску…", "Simulating descent…"), progress: 0.3 });
      out.descent = await c.call("descent", { datasetId: meta.id, site, bodyId: meta.body, lander: L, start: { ...start, approachAzimuth: approach }, dt: start.dt });
      out.keys.descent = descentKey;
      if (meta.body !== "earth") {
        setBusy({ label: X("Пошук вікна старту (Lambert)…", "Searching launch window (Lambert)…"), progress: 0.5 });
        if (!Number.isFinite(launchUtc)) throw new Error(bi("Некоректна дата старту", "Invalid launch date"));
        out.transfer = await c.call(
          "transfer",
          {
            target: meta.body,
            launchUtc,
            ...transferOpts,
            launchLat: launch.lat,
            stack: S,
            landerMass: L.dryMass + L.propellant + (EV ? EV.aeroshellMass : 0),
            descentStart: { horizontalSpeed: start.horizontalSpeed },
            launcher: LV,
            edlVehicle: EV,
            entryAzimuth_deg: approach,
            siteLat: pixelToLatLon(meta.georef, site.col, site.row).lat,
            siteElevation: grid.data[site.row * grid.width + site.col],
          },
          { onProgress: (p) => setBusy({ label: X("Пошук вікна старту, виведення й EDL…", "Searching launch window, ascent & EDL…"), progress: 0.5 + 0.35 * p }), timeout: 90000 },
        );
      } else {
        out.transfer = { transfer: { applicable: false } };
      }
      out.keys.transfer = transferKey;
      out.computedUtc = Date.now();
      setRes((r) => ({ ...r, ...out, keys: { ...r.keys, ...out.keys } }));
      setPlay((p) => ({ ...p, phase: 0, local: 0, playing: false }));
      setHzCheck(null);
    } catch (e) {
      setRes((r) => ({ ...r, error: e.name === "AbortError" ? bi("Розрахунок скасовано.", "Computation cancelled.") : e.message }));
    } finally {
      setBusy(null);
    }
  }, [meta, dem, grid, site, ellipse, approach, L, profileLength, polyline, start, launchUtc, transferOpts, launch.lat, S, LV, EV, terrainKey, descentKey, transferKey, landerErrors.length, X]);

  const runAnalogs = useCallback(async () => {
    if (!meta || !index) return;
    const c = client.current;
    try {
      setBusy({ label: X("Порівняння з аналогами…", "Comparing with analogs…"), progress: 0.1 });
      const others = meta.body === "earth" ? index.filter((d) => d.body !== "earth") : index.filter((d) => d.body === "earth");
      // pick, per place, the variant whose pixel size is closest to the target's
      const groups = new Map();
      for (const d of others) {
        const g = d.id.replace(/-(fine|coarse)$/, "");
        const prev = groups.get(g);
        const score = Math.abs(Math.log(d.resolution_m / meta.resolution_m));
        if (!prev || score < prev.score) groups.set(g, { d, score });
      }
      const cands = [...groups.values()].map((v) => v.d);
      let k = 0;
      for (const d of cands) {
        const data = await loadDemData(d);
        await c.ensureLoaded(data.meta, data.buffer);
        setBusy({ label: X("Порівняння з аналогами…", "Comparing with analogs…"), progress: 0.1 + (0.8 * ++k) / cands.length });
      }
      await c.ensureLoaded(dem.meta, dem.buffer);
      const list = await c.call("analogs", { targetId: meta.id, candidateIds: cands.map((d) => d.id) });
      setRes((r) => ({ ...r, analogs: list.map((x) => ({ ...x, meta: cands.find((d) => d.id === x.id) })), keys: { ...r.keys, analogs: analogKey } }));
    } catch (e) {
      setRes((r) => ({ ...r, error: e.message }));
    } finally {
      setBusy(null);
    }
  }, [meta, index, dem, analogKey, X]);

  function cancel() {
    client.current?.cancel();
    setBusy(null);
    setRes((r) => ({ ...r, error: bi("Розрахунок скасовано.", "Computation cancelled.") }));
  }

  async function loadLive(scale) {
    const lat = Number(liveLat),
      lon = Number(liveLon);
    try {
      setBusy({ label: X("Отримання DEM (", "Fetching DEM (") + (liveSource === "nasadem" ? "NASADEM" : "Copernicus GLO-30") + X(" + маска ESA WorldCover)…", " + ESA WorldCover mask)…"), progress: 0.3 });
      const d = await loadLiveEarthDem(lat, lon, scale, liveSource);
      setIndex((list) => [...list.filter((x) => x.id !== d.meta.id), { ...d.meta, file: null }]);
      const ly = await client.current.ensureLoaded(d.meta, d.buffer);
      setDem(d);
      setLayers(ly);
      setDatasetId(d.meta.id);
      initSiteFor(d.meta);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  // ---- presets ------------------------------------------------------------------
  function choosePreset(id) {
    setVehicleId(id);
    setLander(structuredClone(presetById(id).lander));
    if (presetById(id).edl) setEdlParams(structuredClone(presetById(id).edl));
  }
  function editEdl(k, v) {
    setEdlParams((e) => ({ ...e, [k]: { ...e[k], value: Number(v), source: "user" } }));
  }
  function editStage(i, k, v) {
    setLauncher((l) => ({ ...l, stages: l.stages.map((st, j) => (j === i ? { ...st, [k]: { ...st[k], value: Number(v), source: "user" } } : st)) }));
  }
  function editLander(k, v) {
    setLander((l) => ({ ...l, [k]: { ...(l[k] || { unit: "" }), value: Number(v), source: "user" } }));
  }
  function editStack(k, v) {
    setStack((s) => ({ ...s, [k]: { ...s[k], value: Number(v), source: "user" } }));
  }

  // ---- 3D scene -------------------------------------------------------------------
  useEffect(() => {
    if (centerTab !== "3d" || !sceneCanvas.current) return;
    const sc = createMissionScene(sceneCanvas.current, { onError: setWebglError, onScale: setScaleInfo });
    scene.current = sc;
    return () => {
      sc?.destroy();
      scene.current = null;
    };
  }, [centerTab]);

  const frame = useMemo(() => (grid && site ? localFrame(grid, site.col, site.row, body) : null), [grid, site, body]);

  const terrain3D = useMemo(() => {
    if (!grid || !frame || !layers) return null;
    const step = Math.max(1, Math.ceil(Math.max(grid.width, grid.height) / 160));
    const nx = Math.floor((grid.width - 1) / step) + 1,
      ny = Math.floor((grid.height - 1) / step) + 1;
    const { rgb } = layerColors(layer, grid.data, layers, L.maxSlope, grid.width, grid.height);
    const x = new Float32Array(nx * ny),
      y = new Float32Array(nx * ny),
      z = new Float32Array(nx * ny),
      colors = new Uint8Array(nx * ny * 3);
    const R = BODIES[body].meanRadius;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i * step,
          r = j * step,
          k = j * nx + i;
        const p = frame.fromPixel(c, r);
        x[k] = p.x;
        y[k] = p.y;
        const v = grid.data[r * grid.width + c];
        z[k] = v === v ? v - frame.z0 - (p.x * p.x + p.y * p.y) / (2 * R) : NaN;
        colors.set(rgb.subarray((r * grid.width + c) * 3, (r * grid.width + c) * 3 + 3), k * 3);
      }
    return { nx, ny, x, y, z, colors };
  }, [grid, frame, layers, layer, L.maxSlope, body]);

  const descent = res.descent?.descent?.ok ? res.descent.descent : null; // failed sims have no states
  const transfer = res.transfer?.transfer;
  useEffect(() => {
    if (scene.current && terrain3D) scene.current.setTerrain(terrain3D);
  }, [terrain3D, centerTab]);
  useEffect(() => {
    scene.current?.setTrajectory(descent?.samples);
  }, [descent, centerTab, terrain3D]);
  useEffect(() => {
    scene.current?.setExaggeration(exaggeration);
  }, [exaggeration, centerTab]);
  useEffect(() => {
    if (!scene.current) return;
    if (!transfer?.best) return scene.current.setTransfer(null);
    const moon = body === "moon";
    const unit = moon ? 384400e3 / 10 : 1.496e11 / 10;
    const samplesOrbit = (fn, days) => Array.from({ length: 181 }, (_, k) => fn(transfer.best.depUtc + (k / 180) * days * 86400000).r);
    scene.current.setTransfer(transfer.best.arc, {
      unit,
      center: moon ? "earth" : "sun",
      centerRadius: moon ? 6.371e6 : 6.957e8,
      centerColor: moon ? 0x3b82f6 : 0xfbbf24,
      targetRadius: moon ? 1.7374e6 : 3.3895e6,
      targetColor: moon ? 0xd1d5db : 0xef4444,
      minBody: moon ? 0.12 : 0.18,
      earthOrbit: moon ? null : samplesOrbit((t) => bodyState("earth", t), 365.25),
      targetOrbit: moon ? samplesOrbit(moonState, 27.32) : samplesOrbit((t) => bodyState("mars", t), 687),
    });
  }, [transfer, body, centerTab]);
  useEffect(() => {
    scene.current?.setCameraMode(cam);
  }, [cam, centerTab]);

  // ---- timeline / playback --------------------------------------------------------
  const ascentRes = res.transfer?.ascent;
  const edlRes = res.transfer?.edl;
  // Verdict cards are pure functions of frozen inputs + raw solver results → instant language switch.
  const cardTerrain = useMemo(
    () => (res.analysis && res.inputs && grid && grid.meta?.id === res.inputs.datasetId ? terrainCard(grid, res.inputs.site, res.inputs.lander, res.inputs.ellipse, lang) : null),
    [res.analysis, res.inputs, grid, lang],
  );
  const cardLanding = useMemo(() => (res.descent && res.inputs ? landingCard(res.descent.descent, res.inputs.lander, lang) : null), [res.descent, res.inputs, lang]);
  const cardTransfer = useMemo(
    () => (res.transfer && res.inputs ? transferCard(res.transfer.transfer, res.inputs.stack, { ascent: res.transfer.ascent, edl: res.transfer.edl, edlVehicle: res.inputs.edlVehicle }, lang) : null),
    [res.transfer, res.inputs, lang],
  );
  const flagText = (f) =>
    f.code === "scale-mismatch"
      ? X(`Масштаби після узгодження різняться на ${f.value} %`, `Scales differ by ${f.value} % after matching`)
      : f.code === "too-few-pixels"
        ? X("Замало валідних пікселів на спільному масштабі — порівняння не виконується", "Too few valid pixels at the common scale — no comparison")
        : f.code === "low-coverage"
          ? X("Покриття метрик < 60 % — рейтинг ненадійний", "Metric coverage < 60 % — rating unreliable")
          : String(f.code || f);
  const phases = useMemo(() => buildPhases(transfer, descent, body, { ascent: ascentRes, edl: edlRes }, lang), [transfer, descent, body, ascentRes, edlRes, lang]);
  const phase = phases[Math.min(play.phase, phases.length - 1)];
  const phaseLen = phase ? (phase.end - phase.start) / 1000 : 0;
  const current = useMemo(() => {
    if (!phase) return null;
    const local = Math.min(play.local, phaseLen);
    const utc = phase.relative ? null : phase.start + local * 1000;
    let sp = null,
      ds = null;
    if (transfer?.best) {
      const arc = transfer.best.arc.states;
      if (phase.id === "cruise") sp = stateAt(arc, utc);
      else sp = phase.id === "ascent" || phase.id === "parking" ? arc[0] : arc[arc.length - 1];
    }
    if (phase.id === "descent" && descent) ds = stateAt(descent.samples, local);
    const ph = phase.samples ? stateAt(phase.samples, local) : null; // ascent / EDL states
    return { utc, local, space: sp, descent: ds, phaseState: ph, phase };
  }, [phase, play.local, phaseLen, transfer, descent]);
  useEffect(() => {
    if (!scene.current || !current) return;
    scene.current.setView(current.phase.id === "descent" ? "surface" : "space");
  }, [current?.phase.id, centerTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scene.current && current) scene.current.setState({ space: current.space, descent: current.descent, thrustMax: L.thrustMax });
  }, [current, L.thrustMax]);
  useEffect(() => {
    if (!play.playing || !phase) return;
    let raf,
      last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlay((p) => {
        const ph = phases[p.phase];
        if (!ph) return { ...p, playing: false };
        const len = (ph.end - ph.start) / 1000;
        const local = p.local + dt * p.speed * (PHASE_RATE[ph.id] || 1);
        if (local >= len) {
          if (p.phase + 1 < phases.length) return { ...p, phase: p.phase + 1, local: 0 };
          return { ...p, local: len, playing: false };
        }
        return { ...p, local };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play.playing, phases, phase]);

  const sliderValue = useMemo(() => {
    if (!phases.length || !phase) return 0;
    const ws = phases.map((p) => PHASE_WEIGHT[p.id] || 0.1);
    const tot = ws.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < play.phase; i++) acc += ws[i];
    return ((acc + ws[play.phase] * (phaseLen ? Math.min(1, play.local / phaseLen) : 0)) / tot) * 1000;
  }, [phases, phase, play, phaseLen]);
  function seekSlider(v) {
    const ws = phases.map((p) => PHASE_WEIGHT[p.id] || 0.1);
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = (v / 1000) * tot;
    for (let i = 0; i < phases.length; i++) {
      if (x <= ws[i] || i === phases.length - 1) {
        const len = (phases[i].end - phases[i].start) / 1000;
        setPlay((p) => ({ ...p, phase: i, local: Math.min(len, (x / ws[i]) * len) }));
        return;
      }
      x -= ws[i];
    }
  }

  // ---- export / import ---------------------------------------------------------------
  const inputs = { datasetId, site, ellipse: { ...ellipse, azimuth_deg: approach }, approachAzimuth: approach, profileLength, polyline, vehicleId, lander, stack, descentStart: start, launch, transfer: transferOpts };
  function summary() {
    return {
      computedUtc: res.computedUtc ?? null,
      terrain: cardTerrain ? { status: cardTerrain.status, criteria: cardTerrain.criteria.map(({ id, value, status }) => ({ id, value, status })) } : null,
      landing: res.descent && descent ? { status: cardLanding?.status, outcome: descent.outcome, touchdown: descent.touchdown ? { t: descent.touchdown.t, vVertical: descent.touchdown.vVertical, vHorizontal: descent.touchdown.vHorizontal, miss_m: descent.touchdown.miss_m } : null, propellantRemaining: descent.propellantRemaining } : null,
      transfer: transfer?.best ? { status: cardTransfer?.status, depUtc: new Date(transfer.best.depUtc).toISOString(), arrUtc: new Date(transfer.best.arrUtc).toISOString(), dvStage: transfer.best.dvStage } : res.transfer ? { status: cardTransfer?.status } : null,
      analogs: res.analogs?.map((a) => ({ id: a.id, score: a.score, coverage: a.coverage })) ?? null,
    };
  }
  function exportScenario() {
    const sc = buildScenario({
      inputs,
      dataset: meta,
      results: summary(),
      limitations: [X("Навчальна модель; не для планування реальних польотів.", "Educational model; not for planning real flights."), X("Див. docs/MODELS_AND_LIMITATIONS.md", "See docs/MODELS_AND_LIMITATIONS.md")],
    });
    download(`earth2orbit-scenario-${datasetId}.json`, JSON.stringify(sc, null, 2), "application/json");
  }
  function exportProfile(which) {
    const p = res.analysis?.profiles?.[which];
    if (!p) return;
    download(`profile-${which}-${datasetId}.csv`, profileCSV(p, { datasetId, datum: meta?.datum?.description }), "text/csv");
  }
  async function importScenario(file) {
    try {
      const sc = parseScenario(await file.text());
      const i = sc.inputs;
      if (!index.some((d) => d.id === i.datasetId)) throw new Error(bi("Набір даних " + i.datasetId + " недоступний у цій версії", "Dataset " + i.datasetId + " is not available in this version"));
      const ds = index.find((d) => d.id === i.datasetId);
      if (sc.data?.sha256 && ds.sha256 !== sc.data.sha256) throw new Error(bi("Контрольна сума DEM відрізняється — це інші дані", "DEM checksum differs — these are different data"));
      pendingImport.current = sc;
      setDatasetId(i.datasetId);
      setVehicleId(i.vehicleId);
      setLander(i.lander);
      setStack(i.stack);
      setStart(i.descentStart);
      setLaunch(i.launch);
      setTransferOpts(i.transfer);
      setApproach(i.approachAzimuth);
      setEllipse(i.ellipse);
      setProfileLength(i.profileLength);
      setImportNote(bi("Сценарій імпортовано. Натисни «Розрахувати», щоб відтворити й звірити результати.", "Scenario imported. Press “Compute” to reproduce and compare the results."));
      if (dem?.meta.id === i.datasetId) {
        setSite(i.site);
        setPolyline(i.polyline || []);
      }
    } catch (e) {
      setError(bi("Імпорт: ", "Import: ") + pick(e.message, lang));
    }
  }
  useEffect(() => {
    const sc = pendingImport.current;
    if (!sc || !res.computedUtc || !sc.results) return;
    const now = summary();
    const same = (a, b) => (a === null && b === null) || Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    const checks = [];
    if (sc.results.landing?.touchdown && now.landing?.touchdown) checks.push(same(now.landing.touchdown.t, sc.results.landing.touchdown.t));
    if (sc.results.transfer?.dvStage && now.transfer?.dvStage) checks.push(same(now.transfer.dvStage, sc.results.transfer.dvStage));
    if (sc.results.terrain && now.terrain) checks.push(now.terrain.status === sc.results.terrain.status);
    setImportNote(checks.length ? (checks.every(Boolean) ? bi("✓ Імпортований сценарій відтворено: ключові результати збігаються.", "✓ Imported scenario reproduced: key results match.") : bi("✕ Результати відрізняються від збережених у файлі.", "✕ Results differ from those saved in the file.")) : "");
    pendingImport.current = null;
  }, [res.computedUtc]); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkHorizons() {
    if (!transfer?.best) return;
    try {
      setHzCheck({ loading: true });
      const tgt = body === "moon" ? "moon" : "mars";
      const hz = await horizonsState(tgt, transfer.best.arrUtc);
      const ours = body === "moon" ? moonState(transfer.best.arrUtc) : bodyState("mars", transfer.best.arrUtc);
      const d = Math.hypot(...ours.r.map((x, i) => x - hz.r_m[i]));
      setHzCheck({ diff_km: d / 1000, utc: hz.utc, frame: hz.frame });
    } catch (e) {
      setHzCheck({ error: e.message });
    }
  }

  // ---- render helpers ------------------------------------------------------------------
  const analysis = res.analysis;
  const profiles = analysis?.profiles;
  const hoverPoint = profiles && hoverProfile.i !== null ? profiles[hoverProfile.which]?.points?.[hoverProfile.i] : null;
  useEffect(() => {
    if (!scene.current || !frame) return;
    if (!hoverPoint || hoverPoint.z === null) return scene.current.setHighlight(null);
    const p = frame.fromPixel(hoverPoint.col, hoverPoint.row);
    scene.current.setHighlight({ x: p.x, y: p.y, z: hoverPoint.z - frame.z0 - (p.x * p.x + p.y * p.y) / (2 * BODIES[body].meanRadius) });
  }, [hoverPoint, frame, body]);
  const track = useMemo(() => {
    if (!descent || !frame) return null;
    const stride = Math.max(1, Math.floor(descent.samples.length / 300));
    return descent.samples.filter((_, i) => i % stride === 0).map((s) => frame.toPixel(s.x, s.y));
  }, [descent, frame]);
  const staleT = res.keys?.terrain && res.keys.terrain !== terrainKey;
  const staleD = res.keys?.descent && res.keys.descent !== descentKey;
  const staleX = res.keys?.transfer && res.keys.transfer !== transferKey;
  const staleA = res.keys?.analogs && res.keys.analogs !== analogKey;
  const bodyDatasets = index?.filter((d) => d.body === body) ?? [];
  const siteLL = meta && site ? pixelToLatLon(meta.georef, site.col, site.row) : null;
  const catalogDist = catalogSite && siteLL && catalogSite.body === body ? haversine(catalogSite.lat, catalogSite.lon, siteLL.lat, siteLL.lon, BODIES[body].meanRadius) : null;
  const cd = current?.descent;

  return (
    <dialog ref={dialog} className="mission-planner" aria-label={tr("Планувальник місії")} onCancel={(e) => (e.preventDefault(), onClose())}>
      <header className="m-head">
        <div>
          <div className="eyebrow">{tr("АНАЛІЗ РЕЛЬЄФУ · ПОСАДКА · ПЕРЕЛІТ")} · {BODY_NAME[lang === "en" ? "en" : "uk"][body]}</div>
          <h2>{tr("Планувальник місії")}</h2>
          <p className="m-disclaimer">{tr("Навчальна модель незалежного проєкту для NASA Space Apps 2026. Не сертифікована система керування польотами.")}</p>
        </div>
        <div className="m-head-actions">
          <button className="action" onClick={runAll} disabled={!!busy || !meta || !site || landerErrors.length > 0}>
            ▶ {tr("Розрахувати")}
          </button>
          {busy && (
            <button className="action secondary" onClick={cancel}>
              ■ {tr("Скасувати")}
            </button>
          )}
          <button className="action secondary" onClick={exportScenario} disabled={!meta}>
            ⇩ JSON
          </button>
          <button className="action secondary" onClick={() => importInput.current?.click()} disabled={!index}>
            ⇧ {tr("Імпорт")}
          </button>
          <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files[0] && importScenario(e.target.files[0])} />
          <button className="close" onClick={onClose} aria-label={tr("Закрити")}>
            ×
          </button>
        </div>
      </header>
      <div className="m-status-area">
      {busy && (
        <div className="m-progress" role="status">
          <span>{busy.label}</span>
          <progress max="1" value={busy.progress} />
        </div>
      )}
      {(error || res.error) && (
        <p className="m-error" role="alert">
          {pick(error || res.error, lang)}
        </p>
      )}
      {importNote && <p className="m-info" role="status">{pick(importNote, lang)}</p>}

      </div>

      <div className="m-layout">
        {/* ------------------------------------------------ LEFT: parameters */}
        <aside className="m-left" aria-label={X("Параметри", "Parameters")}>
          <details open>
            <summary>1. {X("Ділянка й дані", "Site and data")}</summary>
            <label>
              DEM
              <select value={datasetId || ""} onChange={(e) => setDatasetId(e.target.value)}>
                {bodyDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.resolution_m} {X("м/пікс.", "m/px")}
                  </option>
                ))}
              </select>
            </label>
            {meta && (
              <div className="m-source">
                <p>
                  <b>{meta.source.title}</b> · {meta.source.productId} · {meta.source.version}
                </p>
                <p>
                  {X("Статус", "Status")}: <b>{meta.status}</b> ({meta.statusNote}) · {meta.width}×{meta.height} {X("пікс.", "px")} · {meta.resolution_m} {X("м/пікс.", "m/px")}
                </p>
                <p>{X("Датум", "Datum")}: {meta.datum.description}</p>
                <p>
                  CRS: {meta.crs.projection}; {X("широта", "latitude")} {meta.crs.latitude}; {X("довгота", "longitude")} {meta.crs.longitude}
                </p>
                <p>{X("Верт. точність", "Vertical accuracy")}: {meta.verticalAccuracy}</p>
                {meta.mask && (
                  <p>
                    {X("Маска води", "Water mask")} ({meta.mask.status}): {meta.mask.rule}; {X("замасковано", "masked")} {(meta.mask.maskedFraction * 100).toFixed(1)} %
                    {meta.mask.unknownFraction > 0 && X(`, маска невідома для ${(meta.mask.unknownFraction * 100).toFixed(1)} %`, `, mask unknown for ${(meta.mask.unknownFraction * 100).toFixed(1)} %`)}
                    {meta.mask.license && ` · ${meta.mask.license}`}
                  </p>
                )}
                <p>
                  {X("Ліцензія", "Licence")}: {meta.source.license}{" "}
                  <a href={meta.source.label || meta.source.url} target="_blank" rel="noopener noreferrer">
                    {X("джерело", "source")} ↗
                  </a>
                </p>
                {dem?.checksumOk && <p>{X("SHA-256 перевірено ✓", "SHA-256 verified ✓")}</p>}

              </div>
            )}
            {siteLL && (
              <p className="m-muted">
                {X("Точка", "Point")}: {siteLL.lat.toFixed(4)}°, {siteLL.lon.toFixed(4)}° ({X("пікс.", "px")} {site.col},{site.row})
                {catalogDist !== null && X(` · від опорної точки каталогу ${(catalogDist / 1000).toFixed(1)} км${catalogDist > 5000 ? " — вирізка лише поблизу, не саме місце каталогу" : ""}`, ` · ${(catalogDist / 1000).toFixed(1)} km from the catalogue reference point${catalogDist > 5000 ? " — the cut-out is only nearby, not the catalogue site itself" : ""}`)}
              </p>
            )}
            {body === "earth" && (
              <fieldset className="m-live">
                <legend>{X("Інша точка на Землі (live DEM)", "Another point on Earth (live DEM)")}</legend>
                <div className="m-row">
                  <input aria-label={X("Широта", "Latitude")} value={liveLat} onChange={(e) => setLiveLat(e.target.value)} placeholder="lat" />
                  <input aria-label={X("Довгота", "Longitude")} value={liveLon} onChange={(e) => setLiveLon(e.target.value)} placeholder="lon" />
                </div>
                <label>
                  {X("Джерело", "Source")}
                  <select value={liveSource} onChange={(e) => setLiveSource(e.target.value)}>
                    <option value="copernicus">Copernicus DEM GLO-30 (DSM, EGM2008)</option>
                    <option value="nasadem">NASADEM (SRTM 2000, EGM96; 56°S–60°N)</option>
                  </select>
                </label>
                <div className="m-row">
                  <button className="text-button" disabled={!caps?.demEarthOnDemand || !!busy} onClick={() => loadLive("fine")}>
                    ~30 {X("м", "m")}
                  </button>
                  <button className="text-button" disabled={!caps?.demEarthOnDemand || !!busy} onClick={() => loadLive("coarse")}>
                    ~450 {X("м", "m")}
                  </button>
                </div>
                <p className="m-muted">{X("Маска води: ESA WorldCover 2021 (клас 80). Висоти нижче рівня моря не відкидаються.", "Water mask: ESA WorldCover 2021 (class 80). Elevations below sea level are kept.")}</p>
                {!caps?.demEarthOnDemand && <p className="m-muted">{pick(caps?.reason, lang) || X("Потрібен Node-сервер.", "A Node server is required.")}</p>}
              </fieldset>
            )}
          </details>
          <details>
            <summary>{X("Геометрія знімання й розмежування величин", "Imaging geometry and quantity separation")}</summary>
            <ImagingPanel
              key={datasetId}
              body={body}
              lat={siteLL?.lat}
              lon={siteLL?.lon}
              site={{
                z: site && grid ? grid.data[site.row * grid.width + site.col] : null,
                datum: meta?.datum?.description,
                slope: site && layers ? layers.slope[site.row * grid.width + site.col] : null,
                aspect: site && layers ? layers.aspect[site.row * grid.width + site.col] : null,
                trajectory: descent
                  ? X(
                      `початковий кут траєкторії ${(Math.atan2(-descent.samples[0].vz, Math.hypot(descent.samples[0].vx, descent.samples[0].vy)) * 180 / Math.PI).toFixed(1)}° нижче горизонту; нахил тяги при торканні ${descent.touchdown?.thrustTilt_deg?.toFixed(1) ?? "—"}° (орієнтація = напрям тяги)`,
                      `initial flight-path angle ${(Math.atan2(-descent.samples[0].vz, Math.hypot(descent.samples[0].vx, descent.samples[0].vy)) * 180 / Math.PI).toFixed(1)}° below horizon; thrust tilt at touchdown ${descent.touchdown?.thrustTilt_deg?.toFixed(1) ?? "—"}° (attitude = thrust direction)`,
                    )
                  : null,
              }}
              onFootprints={setFootprintsLL}
            />
          </details>
          <details open>
            <summary>2. {X("Майданчик і захід", "Landing site and approach")}</summary>
            <div className="m-seg" role="radiogroup" aria-label={X("Режим карти", "Map mode")}>
              <button role="radio" aria-checked={mapMode === "site"} className={mapMode === "site" ? "active" : ""} onClick={() => setMapMode("site")}>
                ⌖ {X("точка", "point")}
              </button>
              <button role="radio" aria-checked={mapMode === "polyline"} className={mapMode === "polyline" ? "active" : ""} onClick={() => setMapMode("polyline")}>
                ⟋ {X("полілінія", "polyline")}
              </button>
              <button onClick={() => setPolyline([])} disabled={!polyline.length}>
                {X("очистити", "clear")}
              </button>
            </div>
            <label>
              {X("Напрям заходу (азимут руху), °", "Approach direction (azimuth of travel), °")}
              <input type="number" min="0" max="359" value={approach} onChange={(e) => setApproach(((Number(e.target.value) % 360) + 360) % 360)} />
            </label>
            <div className="m-row">
              <label>
                {X("Еліпс: велика піввісь, м", "Ellipse: semi-major axis, m")}
                <input type="number" min="1" value={ellipse.a_m} onChange={(e) => setEllipse((x) => ({ ...x, a_m: Math.max(1, +e.target.value) }))} />
              </label>
              <label>
                {X("мала, м", "semi-minor, m")}
                <input type="number" min="1" value={ellipse.b_m} onChange={(e) => setEllipse((x) => ({ ...x, b_m: Math.max(1, +e.target.value) }))} />
              </label>
            </div>
            <p className="m-muted">{X("Походження еліпса: припущення користувача (3σ розсіювання навігації), не аналіз навігації конкретної місії. Велика вісь орієнтована вздовж заходу.", "Ellipse origin: user assumption (3σ navigation dispersion), not a mission-specific navigation analysis. The major axis follows the approach direction.")}</p>
            <label>
              {X("Довжина профілів, м", "Profile length, m")}
              <input type="number" min="50" value={profileLength} onChange={(e) => setProfileLength(Math.max(50, +e.target.value))} />
            </label>
          </details>
          <details>
            <summary>3. {X("Апарат", "Vehicle")}</summary>
            <select value={vehicleId} onChange={(e) => choosePreset(e.target.value)} aria-label={X("Preset апарата", "Vehicle preset")}>
              {VEHICLE_PRESETS.map((v) => (
                <option key={v.id} value={v.id}>
                  {lang === "en" ? v.nameEn : v.name}
                </option>
              ))}
            </select>
            <p className="m-muted">{lang === "en" ? presetById(vehicleId).noteEn : presetById(vehicleId).note}</p>
            <div className="m-params">
              {LANDER_FIELDS.filter(([k]) => lander[k] !== undefined || k === "dragArea").map(([k, label, unit, labelEn, unitEn]) => (
                <label key={k} title={X("Джерело: ", "Source: ") + (lander[k]?.source || X("немає", "none"))}>
                  {X(label, labelEn)}, {X(unit, unitEn)}
                  <input type="number" step="any" value={lander[k]?.value ?? 0} onChange={(e) => editLander(k, e.target.value)} />
                  <small className={lander[k]?.source === "assumed" ? "m-src-assumed" : "m-src"}>{lander[k]?.source === "assumed" ? X("припущення", "assumption") : lander[k]?.source === "user" ? X("користувач", "user") : lander[k] ? X("джерело ⓘ", "source ⓘ") : X("0 (немає)", "0 (none)")}</small>
                </label>
              ))}
            </div>
            {landerErrors.length > 0 && <p className="m-error">{landerErrors.join("; ")}</p>}
            <p className="m-muted">
              {X("Ідеальна Δv спуску", "Ideal descent Δv")}: {r1(L.isp * 9.80665 * Math.log((L.dryMass + L.propellant) / L.dryMass), 0)} {X("м/с", "m/s")} {X("(Isp·g0·ln(m0/mf) — не повна вартість)", "(Isp·g0·ln(m0/mf) — not the full cost)")}
            </p>
          </details>
          <details>
            <summary>4. {X("Початок спуску", "Descent start")}</summary>
            <div className="m-params">
              {[
                ["altitude", X("Висота над ціллю, м", "Altitude above target, m")],
                ["downrange", X("Відстань до цілі, м", "Distance to target, m")],
                ["horizontalSpeed", X("Гориз. швидкість, м/с", "Horizontal speed, m/s")],
                ["verticalSpeed", X("Верт. швидкість, м/с", "Vertical speed, m/s")],
                ["dt", X("Крок інтегрування, с", "Integration step, s")],
              ].map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input type="number" step="any" value={start[k]} onChange={(e) => setStart((s) => ({ ...s, [k]: Number(e.target.value) }))} />
                </label>
              ))}
            </div>
            <p className="m-muted">{X("Крок фізики фіксований і не залежить від FPS чи швидкості перегляду.", "The physics step is fixed and independent of FPS and playback speed.")}</p>
            {edlRes?.outcome === "powered-descent-start" && (
              <button
                className="text-button"
                onClick={() =>
                  setStart((s) => ({
                    ...s,
                    altitude: Math.round(edlRes.end.h),
                    verticalSpeed: -Math.round(edlRes.end.vVertical * 10) / 10,
                    horizontalSpeed: Math.round(edlRes.end.vHorizontal * 10) / 10,
                  }))
                }
              >
                ⇣ {X("Взяти стан після EDL", "Use post-EDL state")} ({r1(edlRes.end.h, 0)} {X("м", "m")}, v↓ {r1(edlRes.end.vVertical, 1)} {X("м/с", "m/s")})
              </button>
            )}
          </details>
          {body !== "earth" && (
            <details>
              <summary>5. {X("Старт із Землі й переліт", "Launch from Earth and transfer")}</summary>
              <div className="m-row">
                <label>
                  {X("Дата й час", "Date and time")}
                  <input type="datetime-local" value={launch.local} onChange={(e) => setLaunch((l) => ({ ...l, local: e.target.value }))} />
                </label>
                <label>
                  {X("Пояс", "Time zone")}
                  <select value={launch.timeZone} onChange={(e) => setLaunch((l) => ({ ...l, timeZone: e.target.value }))}>
                    <option value="Europe/Kyiv">Europe/Kyiv</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </label>
              </div>
              <p className="m-muted">{Number.isFinite(launchUtc) ? `= ${formatUtc(launchUtc)} · ${formatZone(launchUtc, "Europe/Kyiv", lang === "en" ? "en-GB" : "uk-UA")}` : X("Некоректна дата", "Invalid date")} — {X("початок вікна пошуку.", "start of the search window.")}</p>
              <label>
                {X("Космодром", "Launch site")}
                <select
                  value={launch.siteId}
                  onChange={(e) => {
                    const s = LAUNCH_SITES.find((x) => x.id === e.target.value);
                    setLaunch((l) => ({ ...l, siteId: s.id, lat: s.lat }));
                  }}
                >
                  {LAUNCH_SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {lang === "en" ? s.nameEn : s.name}
                    </option>
                  ))}
                </select>
              </label>
              {launch.siteId === "custom" && (
                <label>
                  {X("Широта старту, °", "Launch latitude, °")}
                  <input type="number" min="-90" max="90" value={launch.lat} onChange={(e) => setLaunch((l) => ({ ...l, lat: +e.target.value }))} />
                </label>
              )}
              <div className="m-params">
                {[
                  ["windowDays", X("Вікно пошуку, діб", "Search window, days")],
                  ["depStepDays", X("Крок дати, діб", "Date step, days")],
                  ["tofMinDays", X("Тривалість від, діб", "Flight time from, days")],
                  ["tofMaxDays", X("до, діб", "to, days")],
                  ["tofStepDays", X("Крок тривалості, діб", "Flight-time step, days")],
                ].map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input type="number" step="any" value={transferOpts[k]} onChange={(e) => setTransferOpts((o) => ({ ...o, [k]: Number(e.target.value) }))} />
                  </label>
                ))}
              </div>
              {body === "mars" && (
                <label>
                  {X("Прибуття", "Arrival")}
                  <select value={transferOpts.arrivalMode} onChange={(e) => setTransferOpts((o) => ({ ...o, arrivalMode: e.target.value }))}>
                    <option value="entry">{X("Прямий вхід в атмосферу (EDL моделюється)", "Direct atmospheric entry (EDL modelled)")}</option>
                    <option value="capture">{X("Захоплення на орбіту (MOI)", "Orbit capture (MOI)")}</option>
                  </select>
                </label>
              )}
              <div className="m-params">
                {[
                  ["transferDryMass", X("Суха маса перелітного ступеня, кг", "Transfer stage dry mass, kg")],
                  ["transferPropellant", X("Паливо ступеня, кг", "Stage propellant, kg")],
                  ["transferIsp", X("Isp ступеня, с", "Stage Isp, s")],
                  ["parkingAltitude", X("Висота паркувальної орбіти, м", "Parking orbit altitude, m")],
                  ["arrivalOrbitAltitude", X("Висота орбіти прибуття, м", "Arrival orbit altitude, m")],
                ].map(([k, l]) => (
                  <label key={k} title={X("Джерело: ", "Source: ") + stack[k].source}>
                    {l}
                    <input type="number" step="any" value={stack[k].value} onChange={(e) => editStack(k, e.target.value)} />
                    <small className="m-src-assumed">{stack[k].source === "user" ? X("користувач", "user") : X("припущення", "assumption")}</small>
                  </label>
                ))}
              </div>
              <fieldset className="m-live">
                <legend>{X("Носій (симуляція виведення)", "Launcher (ascent simulation)")}</legend>
                <p className="m-muted">{lang === "en" ? launcher.noteEn : launcher.note}</p>
                {launcher.stages.map((st, i) => (
                  <div key={i} className="m-params">
                    {[
                      ["propellant", X(`Ступінь ${i + 1}: паливо, кг`, `Stage ${i + 1}: propellant, kg`)],
                      ["dryMass", X("суха маса, кг", "dry mass, kg")],
                      ["thrustVac", X("тяга (вакуум), Н", "thrust (vacuum), N")],
                      ["ispVac", X("Isp вакуум, с", "Isp vacuum, s")],
                      ...(i === 0 ? [["ispSl", X("Isp біля землі, с", "Isp sea level, s")]] : []),
                      ["cdA", X("Cd·A, м²", "Cd·A, m²")],
                    ].map(([k, l]) => (
                      <label key={k}>
                        {l}
                        <input type="number" step="any" value={st[k].value} onChange={(e) => editStage(i, k, e.target.value)} />
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              {marsEntry && (
                <fieldset className="m-live">
                  <legend>{X("EDL Марса (навчальні припущення)", "Mars EDL (educational assumptions)")}</legend>
                  <div className="m-params">
                    {[
                      ["flightPathAngle_deg", X("Кут входу γ, °", "Entry flight-path angle γ, °")],
                      ["aeroshellMass", X("Маса аерооболонки, кг", "Aeroshell mass, kg")],
                      ["heatShieldMass", X("з неї теплощит, кг", "of which heat shield, kg")],
                      ["aeroshellDiameter", X("Діаметр, м", "Diameter, m")],
                      ["cdHypersonic", X("Cd гіперзвук", "Hypersonic Cd")],
                      ["noseRadius", X("Радіус носка, м", "Nose radius, m")],
                      ["liftToDrag", "L/D"],
                      ["chuteDiameter", X("Парашут: діаметр, м", "Parachute: diameter, m")],
                      ["chuteCd", X("Парашут: Cd", "Parachute: Cd")],
                      ["chuteMachMax", X("Розкриття при M ≤", "Deploy at M ≤")],
                      ["chuteMachMin", X("Мін. M розкриття", "Min deploy Mach")],
                      ["chuteQMax", X("Макс. q розкриття, Па", "Max deploy q, Pa")],
                      ["poweredDescentAltitude", X("Висота старту моторного спуску, м", "Powered-descent start altitude, m")],
                      ["maxHeatFlux_Wcm2", X("Допустимий тепловий потік, Вт/см²", "Allowed heat flux, W/cm²")],
                      ["maxDecel_g", X("Допустиме перевантаження, g₀", "Allowed deceleration, g₀")],
                    ].map(([k, l]) => (
                      <label key={k}>
                        {l}
                        <input type="number" step="any" value={edlParams[k].value} onChange={(e) => editEdl(k, e.target.value)} />
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </details>
          )}
        </aside>

        {/* ------------------------------------------------ CENTER */}
        <section className="m-center">
          <div className="m-tabs" role="tablist">
            <button role="tab" aria-selected={centerTab === "map"} className={centerTab === "map" ? "active" : ""} onClick={() => setCenterTab("map")}>
              {X("2D-карта", "2D map")}
            </button>
            <button role="tab" aria-selected={centerTab === "3d"} className={centerTab === "3d" ? "active" : ""} onClick={() => setCenterTab("3d")}>
              3D
            </button>
            <span className="m-sep" />
            <select aria-label={X("Шар", "Layer")} value={layer} onChange={(e) => setLayer(e.target.value)}>
              {LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {lang === "en" ? l.labelEn : l.label}
                </option>
              ))}
            </select>
            <label className="m-check">
              <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} /> {X("горизонталі", "contours")}
            </label>
            {centerTab === "3d" && (
              <label className="m-check">
                {X("верт. ×", "vert. ×")}
                <input type="number" min="1" max="20" step="0.5" value={exaggeration} onChange={(e) => setExaggeration(Math.max(1, Math.min(20, +e.target.value)))} style={{ width: "4em" }} />
              </label>
            )}
          </div>
          {centerTab === "map" && meta && dem && (
            <DemMap
              meta={meta}
              data={grid.data}
              layers={layers}
              layer={layer}
              maxSlope={L.maxSlope}
              site={site}
              ellipseOutline={ellipseOutline}
              approachLine={approachLine}
              polyline={polyline}
              track={track}
              footprints={footprints}
              contours={showContours && contours?.id === meta.id ? contours : null}
              hover={hoverPoint}
              mode={mapMode}
              onPick={setSite}
              onPolylinePoint={(p) => setPolyline((l) => [...l, p].slice(-20))}
            />
          )}
          {centerTab === "3d" && (
            <div className="m-3d">
              {webglError ? (
                <p className="m-error">{pick(webglError, lang)}</p>
              ) : (
                <canvas ref={sceneCanvas} aria-label={X("3D-перегляд рельєфу й траєкторії", "3D view of terrain and trajectory")} />
              )}
              <div className="m-hud" aria-live="off">
                <b>{current?.phase?.label || "—"}</b>
                {current?.utc && (
                  <span>
                    {formatUtc(current.utc)} · {formatZone(current.utc, "Europe/Kyiv", lang === "en" ? "en-GB" : "uk-UA")}
                  </span>
                )}
                {current?.utc && phases[0] && <span>T+ {formatDuration((current.utc - phases[0].start) / 1000)}</span>}
                {current?.phaseState && (
                  <>
                    <span>{X("висота", "altitude")} {r1(current.phaseState.h / 1000, 2)} {X("км", "km")}</span>
                    <span>{X("швидкість", "speed")} {r1(current.phaseState.v, 0)} {X("м/с", "m/s")}</span>
                    {current.phaseState.q_Wcm2 !== undefined && <span>{X("тепловий потік", "heat flux")} {r1(current.phaseState.q_Wcm2, 1)} {X("Вт/см²", "W/cm²")} · {r1(current.phaseState.decel_g, 1)} g₀</span>}
                    {current.phaseState.stage !== undefined && <span>{X("ступінь", "stage")} {Math.round(current.phaseState.stage)} · {X("маса", "mass")} {r1(current.phaseState.m / 1000, 1)} {X("т", "t")}</span>}
                  </>
                )}
                {cd && (
                  <>
                    <span>{X("висота над рельєфом", "height above terrain")} {r1(cd.clearance, 1)} {X("м", "m")}</span>
                    <span>{X("швидкість", "speed")} {r1(Math.hypot(cd.vx, cd.vy, cd.vz), 1)} {X("м/с", "m/s")}</span>
                    <span>{X("паливо", "propellant")} {r1(cd.fuel, 0)} {X("кг", "kg")}</span>
                    <span>{X("тяга", "thrust")} {r1(cd.thrust / 1000, 2)} {X("кН", "kN")}</span>
                  </>
                )}
                {scaleInfo && current?.phase?.id !== "descent" && <span className="m-muted">{X(`Відстані в масштабі; тіла збільшено: центр ×${r1(scaleInfo.center, 0)}, ціль ×${r1(scaleInfo.target, 0)}; маркер апарата — символ, не в масштабі`, `Distances to scale; bodies enlarged: centre ×${r1(scaleInfo.center, 0)}, target ×${r1(scaleInfo.target, 0)}; spacecraft marker is a symbol, not to scale`)}</span>}
                {current?.phase?.id === "descent" && <span className="m-muted">{X(`Апарат збільшено для видимості; верт. перебільшення ×${exaggeration} (лише відображення)`, `Lander enlarged for visibility; vertical exaggeration ×${exaggeration} (display only)`)}</span>}
              </div>
              <div className="m-cam" role="group" aria-label={X("Камера", "Camera")}>
                {["overview", "follow", "landing"].map((m) => (
                  <button key={m} className={cam === m ? "active" : ""} onClick={() => setCam(m)}>
                    {lang === "en" ? { overview: "overview", follow: "follow", landing: "landing" }[m] : { overview: "огляд", follow: "супровід", landing: "посадка" }[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------ RIGHT: verdicts */}
        <aside className="m-right" aria-label={X("Висновки", "Conclusions")}>
          {!analysis && <p className="m-muted">{X("Обери точку на карті й натисни «Розрахувати». Три картки нижче оцінюються незалежно; відсоток «успіху» не показується, бо немає відкаліброваної ймовірнісної моделі.", "Pick a point on the map and press “Compute”. The three cards below are assessed independently; no “success” percentage is shown because there is no calibrated probabilistic model.")}</p>}
          <VerdictCard card={cardTerrain} stale={staleT} />
          {analysis && (
            <p className="m-muted">
              {X(
                `Еліпс: ${analysis.regionStats.count} пікс.; висоти ${r1(analysis.regionStats.min)}…${r1(analysis.regionStats.max)} м (сер. ${r1(analysis.regionStats.mean)}), перепад ${r1(analysis.regionStats.relief)} м; ухил сер. ${r1(analysis.regionStats.slopeMean)}°, експозиція сер. ${r1(analysis.regionStats.aspectMean, 0)}°; nodata ${r1(analysis.regionStats.nodataFraction * 100)} %.`,
                `Ellipse: ${analysis.regionStats.count} px; elevation ${r1(analysis.regionStats.min)}…${r1(analysis.regionStats.max)} m (mean ${r1(analysis.regionStats.mean)}), relief ${r1(analysis.regionStats.relief)} m; mean slope ${r1(analysis.regionStats.slopeMean)}°, mean aspect ${r1(analysis.regionStats.aspectMean, 0)}°; nodata ${r1(analysis.regionStats.nodataFraction * 100)} %.`,
              )}
            </p>
          )}
          <VerdictCard card={cardLanding} stale={staleD} />
          {descent && (
            <p className="m-muted">
              {descent.model}; dt = {descent.dt} {X("с", "s")}; {X(`Δv використано ${r1(descent.usedDeltaV, 0)} з ${r1(descent.idealDeltaV, 0)} м/с ідеальних`, `Δv used ${r1(descent.usedDeltaV, 0)} of ${r1(descent.idealDeltaV, 0)} m/s ideal`)}; T/W = {r1(descent.thrustToWeight, 2)}.
            </p>
          )}
          <VerdictCard card={cardTransfer} stale={staleX} />
          {transfer?.best && (
            <div className="m-muted m-transfer-sum">
              <p>
                {X("Відліт", "Departure")}: <b>{formatUtc(transfer.best.depUtc)}</b> ({formatZone(transfer.best.depUtc, "Europe/Kyiv", lang === "en" ? "en-GB" : "uk-UA")})<br />
                {X("Прибуття", "Arrival")}: <b>{formatUtc(transfer.best.arrUtc)}</b> · {r1(transfer.best.tof / 86400, 2)} {X("діб", "days")}
              </p>
              <p>{dvBreakdown(transfer.best, lang)}</p>
              {transfer.best.vinfArr !== undefined && <p>{X("v∞ прибуття", "arrival v∞")} {r1(transfer.best.vinfArr, 0)} {X("м/с", "m/s")}{transfer.best.c3 !== undefined && body === "mars" ? `; C3 ${r1(transfer.best.c3 / 1e6, 1)} ${X("км²/с²", "km²/s²")}` : ""}</p>}
              {(transfer.best.onBoundary?.tof || transfer.best.onBoundary?.departure) && <p className="m-warn">{X("Оптимум на межі сітки пошуку — розшир вікно/діапазон тривалості.", "Optimum lies on the search-grid boundary — widen the window / flight-time range.")}</p>}
              <p>
                {transfer.model}; {transfer.ephemeris}. {X("Замикання дуги", "Arc closure")}: {r1(transfer.best.arc.closureError_m, 1)} {X("м", "m")}.
              </p>
              {ascentRes?.ok && (
                <p>
                  {X(
                    `Виведення (симуляція): орбіта ${r1(ascentRes.perigeeAlt / 1000, 0)}×${r1(ascentRes.apogeeAlt / 1000, 0)} км за ${r1(ascentRes.t / 60, 1)} хв; втрати — гравітаційні ${r1(ascentRes.gravityLoss, 0)}, аеродинамічні ${r1(ascentRes.dragLoss, 0)}, керування ${r1(ascentRes.steeringLoss, 0)} м/с; обертання Землі +${r1(ascentRes.rotationBonus, 0)} м/с.`,
                    `Ascent (simulated): orbit ${r1(ascentRes.perigeeAlt / 1000, 0)}×${r1(ascentRes.apogeeAlt / 1000, 0)} km in ${r1(ascentRes.t / 60, 1)} min; losses — gravity ${r1(ascentRes.gravityLoss, 0)}, drag ${r1(ascentRes.dragLoss, 0)}, steering ${r1(ascentRes.steeringLoss, 0)} m/s; Earth rotation +${r1(ascentRes.rotationBonus, 0)} m/s.`,
                  )}
                </p>
              )}
              {edlRes && (
                <p>
                  {X(
                    `EDL: вхід ${r1(edlRes.entry.speedRelative, 0)} м/с відносно атмосфери (поправка на обертання ${r1(edlRes.entry.rotationCorrection, 0)} м/с), γ ${edlRes.entry.flightPathAngle_deg}°; пік ${r1(edlRes.peakHeatFlux_Wcm2, 1)} Вт/см² і ${r1(edlRes.peakDecel_g, 1)} g₀; на старті моторного спуску v = ${r1(edlRes.end.v, 1)} м/с на висоті ${r1(edlRes.end.h, 0)} м.`,
                    `EDL: entry at ${r1(edlRes.entry.speedRelative, 0)} m/s relative to the atmosphere (rotation correction ${r1(edlRes.entry.rotationCorrection, 0)} m/s), γ ${edlRes.entry.flightPathAngle_deg}°; peak ${r1(edlRes.peakHeatFlux_Wcm2, 1)} W/cm² and ${r1(edlRes.peakDecel_g, 1)} g₀; at powered-descent start v = ${r1(edlRes.end.v, 1)} m/s at ${r1(edlRes.end.h, 0)} m.`,
                  )}
                </p>
              )}
              {caps?.horizons ? (
                <button className="text-button" onClick={checkHorizons}>
                  {X("Звірити ефемериду цілі з JPL Horizons", "Check the target ephemeris against JPL Horizons")}
                </button>
              ) : (
                <p>{X("Звірка з JPL Horizons доступна лише в Node-версії.", "The JPL Horizons check is available in the Node version only.")}</p>
              )}
              {hzCheck?.diff_km !== undefined && (
                <p>
                  Horizons ({hzCheck.utc}): {X("різниця положення цілі", "target position difference")} {r1(hzCheck.diff_km, 0)} {X("км", "km")}.
                </p>
              )}
              {hzCheck?.error && <p className="m-error">{pick(hzCheck.error, lang)}</p>}
            </div>
          )}
          <p className="m-muted">
            {X("«Перешкоди навколо» перевіряються лише як рельєф DEM і поверхня тіла. Космічне сміття, супутники та інші апарати не моделюються.", "“Obstacles” are checked only as DEM terrain and the body surface. Space debris, satellites and other spacecraft are not modelled.")}
          </p>
        </aside>
      </div>

      {/* ------------------------------------------------ BOTTOM: timeline + charts */}
      <section className="m-bottom">
        <div className="m-timeline">
          <button onClick={() => setPlay((p) => ({ ...p, playing: !p.playing }))} disabled={!phases.length} aria-label={play.playing ? X("Пауза", "Pause") : X("Відтворити", "Play")}>
            {play.playing ? "⏸" : "▶"}
          </button>
          <button onClick={() => setPlay((p) => ({ ...p, phase: 0, local: 0, playing: false }))} disabled={!phases.length} aria-label={X("Скинути", "Reset")}>
            ⏮
          </button>
          <input type="range" min="0" max="1000" value={sliderValue} onChange={(e) => seekSlider(+e.target.value)} disabled={!phases.length} aria-label={X("Перемотування (шкала нелінійна за фазами)", "Scrub (scale is non-linear across phases)")} />
          <select value={play.speed} onChange={(e) => setPlay((p) => ({ ...p, speed: +e.target.value }))} aria-label={X("Швидкість перегляду", "Playback speed")}>
            {[0.25, 1, 4, 16].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
          <ol className="m-phases">
            {phases.map((p, i) => (
              <li key={p.id} className={(i === play.phase ? "active " : "") + "m-kind-" + p.kind}>
                <button onClick={() => setPlay((x) => ({ ...x, phase: i, local: 0 }))} title={p.model}>
                  {p.label} <small>({(lang === "en" ? { computed: "computed", estimated: "estimate", assumed: "assumption" } : { computed: "розраховано", estimated: "оцінка", assumed: "припущення" })[p.kind]})</small>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="m-tabs" role="tablist">
          {[
            ["profiles", X("Профілі", "Profiles")],
            ["descent", X("Спуск", "Descent")],
            ["window", X("Вікно старту", "Launch window")],
            ["ascent", X("Виведення й EDL", "Ascent & EDL")],
            ["analogs", X("Земні аналоги", "Earth analogs")],
          ].map(([id, l]) => (
            <button key={id} role="tab" aria-selected={bottomTab === id} className={bottomTab === id ? "active" : ""} onClick={() => setBottomTab(id)}>
              {l}
            </button>
          ))}
        </div>
        {bottomTab === "profiles" && (
          <div className="m-charts">
            {profiles ? (
              <>
                {["along", "across", "poly"].map(
                  (w) =>
                    profiles[w] && (
                      <div key={w}>
                        <ProfileChart
                          profile={profiles[w]}
                          title={{ along: X(`Поздовжній (азимут ${approach}°)`, `Along-track (azimuth ${approach}°)`), across: X(`Поперечний (азимут ${(approach + 90) % 360}°)`, `Cross-track (azimuth ${(approach + 90) % 360}°)`), poly: X("Довільна полілінія", "Custom polyline") }[w]}
                          datum={meta?.datum?.kind === "sphere" ? X(`сфера ${meta.datum.radius_m / 1000} км`, `sphere ${meta.datum.radius_m / 1000} km`) : meta?.datum?.model || meta?.datum?.kind}
                          hoverIndex={hoverProfile.which === w ? hoverProfile.i : null}
                          onHover={(i) => setHoverProfile({ which: w, i })}
                        />
                        <button className="text-button" onClick={() => exportProfile(w)}>
                          ⇩ CSV
                        </button>
                      </div>
                    ),
                )}
                {staleT && <p className="m-stale-note">{X("Профілі застарілі — перерахуй.", "Profiles are stale — recompute.")}</p>}
              </>
            ) : (
              <p className="m-muted">{X("Профілі з'являться після розрахунку. Режим «полілінія» додає довільний профіль.", "Profiles appear after computing. “Polyline” mode adds a custom profile.")}</p>
            )}
          </div>
        )}
        {bottomTab === "descent" && (
          <div className="m-charts">
            {descent ? (
              <>
                <SeriesChart
                  samples={descent.samples}
                  title={X("Висота й запас над рельєфом", "Altitude and clearance above terrain")}
                  t={current?.phase?.id === "descent" ? current.local : NaN}
                  onSeek={(t) => setPlay((p) => ({ ...p, phase: phases.findIndex((x) => x.id === "descent"), local: t }))}
                  series={[
                    { key: "z", label: X("висота відн. цілі", "height rel. target"), color: "#60a5fa", unit: X("м", "m") },
                    { key: "clearance", label: "clearance", color: "#34d399", unit: X("м", "m"), dash: "4 3" },
                  ]}
                />
                <SeriesChart
                  samples={descent.samples}
                  title={X("Швидкість, паливо й тяга", "Speed, propellant and thrust")}
                  t={current?.phase?.id === "descent" ? current.local : NaN}
                  series={[
                    { key: "vz", label: X("v верт.", "v vert."), color: "#f472b6", unit: X("м/с", "m/s") },
                    { key: "fuel", label: X("паливо", "propellant"), color: "#fbbf24", unit: X("кг", "kg"), zero: true },
                    { key: "thrust", label: X("тяга", "thrust"), color: "#a78bfa", unit: X("Н", "N"), dash: "3 3", zero: true },
                  ]}
                />
                {staleD && <p className="m-stale-note">{X("Симуляція застаріла — перерахуй.", "Simulation is stale — recompute.")}</p>}
              </>
            ) : (
              <p className="m-muted">{X("Немає симуляції.", "No simulation.")}</p>
            )}
          </div>
        )}
        {bottomTab === "ascent" && (
          <div className="m-charts">
            {ascentRes?.ok ? (
              <SeriesChart
                samples={ascentRes.samples}
                title={X("Виведення на НОО (симуляція)", "Ascent to LEO (simulation)")}
                t={current?.phase?.id === "ascent" ? current.local : NaN}
                series={[
                  { key: "h", label: X("висота", "altitude"), color: "#60a5fa", unit: X("м", "m"), zero: true },
                  { key: "v", label: X("швидкість (інерц.)", "speed (inertial)"), color: "#fbbf24", unit: X("м/с", "m/s"), zero: true },
                  { key: "q", label: X("динамічний тиск", "dynamic pressure"), color: "#f472b6", unit: X("Па", "Pa"), dash: "3 3", zero: true },
                ]}
              />
            ) : (
              <p className="m-muted">{ascentRes ? X("Виведення не вдалося: ", "Ascent failed: ") + JSON.stringify(ascentRes.reasons) : X("Немає результату виведення (лише для Місяця й Марса).", "No ascent result (Moon and Mars only).")}</p>
            )}
            {edlRes ? (
              <SeriesChart
                samples={edlRes.samples}
                title={X("EDL Марса до старту моторного спуску", "Mars EDL to powered-descent start")}
                t={current?.phase?.id === "arrival" ? current.local : NaN}
                series={[
                  { key: "h", label: X("висота над місцевістю", "height above ground"), color: "#60a5fa", unit: X("м", "m"), zero: true },
                  { key: "v", label: X("швидкість відн. атмосфери", "airspeed"), color: "#fbbf24", unit: X("м/с", "m/s"), zero: true },
                  { key: "q_Wcm2", label: X("тепловий потік", "heat flux"), color: "#f87171", unit: X("Вт/см²", "W/cm²"), zero: true },
                  { key: "decel_g", label: X("перевантаження", "deceleration"), color: "#a78bfa", unit: "g₀", dash: "3 3", zero: true },
                ]}
              />
            ) : (
              body === "mars" && <p className="m-muted">{X("EDL розраховується в режимі «прямий вхід».", "EDL is computed in “direct entry” mode.")}</p>
            )}
          </div>
        )}
        {bottomTab === "window" && (
          <div className="m-charts">{transfer?.best ? <Porkchop transfer={transfer} /> : <p className="m-muted">{body === "earth" ? X("Ціль — Земля: переліт не застосовується.", "Target is Earth: no transfer.") : X("Пошук вікна ще не виконано.", "Launch-window search not run yet.")}</p>}</div>
        )}
        {bottomTab === "analogs" && (
          <div className="m-charts m-analogs">
            <p>
              {X(
                `Порівняння морфометрії всієї вирізки ${meta?.name} з ${body === "earth" ? "місячними/марсіанськими" : "земними"} ділянками. Масштаби узгоджуються блочним усередненням до спільного пікселя, ділянки обрізаються до однакової площі. Подібність ≠ ймовірність безпечної посадки і ≠ геологічна тотожність.`,
                `Morphometric comparison of the whole ${meta?.name} cut-out with ${body === "earth" ? "lunar/Martian" : "Earth"} sites. Scales are matched by block averaging to a common pixel and sites are cropped to the same area. Similarity ≠ probability of a safe landing and ≠ geological identity.`,
              )}
            </p>
            <button className="action secondary" onClick={runAnalogs} disabled={!!busy || !meta}>
              ⇄ {X("Порівняти", "Compare")}
            </button>
            {staleA && <p className="m-stale-note">{X("Застаріло — інша ділянка.", "Stale — different site.")}</p>}
            {layers?.hist && (
              <div className="m-hist-wrap">
                <span>{X("Розподіл ухилів цілі (°, Horn 3×3)", "Target slope distribution (°, Horn 3×3)")}</span>
                <SlopeHistogram hist={layers.hist} maxSlope={L.maxSlope} label={X("Гістограма ухилів цільової ділянки", "Slope histogram of the target site")} />
              </div>
            )}
            {res.analogs && (
              <div className="m-table-wrap">
                <table className="m-table">
                  <thead>
                    <tr>
                      <th>{X("Кандидат", "Candidate")}</th>
                      <th>{X("Подібність", "Similarity")}</th>
                      <th>{X("Покриття метрик", "Metric coverage")}</th>
                      <th>{X("Спільний масштаб", "Common scale")}</th>
                      <th>{X("Δ ухили (EMD)", "Δ slopes (EMD)")}</th>
                      <th>Δ P90</th>
                      <th>{X("Δ шорсткість", "Δ roughness")}</th>
                      <th>{X("Δ перепад", "Δ relief")}</th>
                      <th>{X("Ознаки з каталогу", "Catalogue traits")}</th>
                      <th>{X("Примітки", "Notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...res.analogs]
                      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                      .map((a) => {
                        const cat = earthSites.find((s) => s.id === a.meta?.catalogId);
                        const row = (id) => a.rows?.find((r) => r.id === id);
                        const cell = (id) => {
                          const r = row(id);
                          return r?.available ? r.difference.toFixed(2) : X("немає", "n/a");
                        };
                        return (
                          <tr key={a.id}>
                            <td>
                              {a.meta?.name}
                              <br />
                              <small>{a.meta?.source?.productId}</small>
                            </td>
                            <td>{a.score === null || a.score === undefined ? X("недостатньо даних", "insufficient data") : a.score.toFixed(2)}</td>
                            <td>{a.coverage !== undefined ? Math.round(a.coverage * 100) + " %" : "—"}</td>
                            <td>{a.commonPixel_m ? `${r1(a.commonPixel_m, 0)} ${X("м/пікс.", "m/px")}, ${r1(a.extent_m / 1000, 1)} ${X("км", "km")}` : "—"}</td>
                            <td>{cell("slopeHist")}</td>
                            <td>{cell("slopeP90")}</td>
                            <td>{cell("roughness")}</td>
                            <td>{cell("relief")}</td>
                            <td>{cat?.science ? cat.science.traits.map((id) => tr(criteria.find((c) => c.id === id)?.label || id)).join(", ") || "—" : X("кандидат (ознаки не задокументовані)", "candidate (traits not documented)")}</td>
                            <td>{(a.flags || []).map((f) => flagText(f)).join("; ") || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="m-muted">
                  {X(
                    "Нормування: EMD/10°, |ΔP90|/10°, |log10 відношення| для шорсткості й перепаду (1 = декада); кожну різницю обмежено 1. Ваги: розподіл 0.4, P90 0.2, шорсткість 0.2, перепад 0.2. Відсутні метрики не вважаються нульовою різницею: вони зменшують покриття, і при покритті нижче 60 % рейтинг не показується.",
                    "Normalisation: EMD/10°, |ΔP90|/10°, |log10 ratio| for roughness and relief (1 = one decade); each difference is capped at 1. Weights: distribution 0.4, P90 0.2, roughness 0.2, relief 0.2. Missing metrics are not counted as zero difference: they reduce coverage, and below 60 % coverage no rating is shown.",
                  )}
                </p>
                <p className="m-muted">
                  {X(
                    "Придатний для: тестів навігації, мобільності й датчиків небезпек на масштабі спільного пікселя, якщо розподіли ухилів близькі. Не відтворює",
                    "Suitable for: navigation, mobility and hazard-sensor tests at the common pixel scale when slope distributions are close. Does not reproduce",
                  )}{" "}
                  ({BODY_NAME[lang === "en" ? "en" : "uk"][body === "earth" ? "moon" : body]}{body === "earth" ? "/" + BODY_NAME[lang === "en" ? "en" : "uk"].mars : ""}):{" "}
                  {(() => {
                    const lim = ANALOG_LIMITS_I18N[lang === "en" ? "en" : "uk"];
                    return (lim[body] || [...lim.moon, ...lim.mars]).join("; ");
                  })()}.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </dialog>
  );
}

