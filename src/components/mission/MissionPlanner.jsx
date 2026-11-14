import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./mission.css";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { loadDemIndex, loadDemData, loadCapabilities, loadLiveEarthDem, horizonsState } from "../../lib/dem.js";
import { createMissionClient } from "../../lib/missionWorker.js";
import { makeGrid, offsetToPixel } from "../../../shared/terrain/analysis.js";
import { latLonToPixel, pixelToLatLon, haversine } from "../../../shared/terrain/georef.js";
import { ANALOG_LIMITS } from "../../../shared/terrain/analogs.js";
import { localFrame } from "../../../shared/mission/descent.js";
import { VEHICLE_PRESETS, STACK_DEFAULTS, DEFAULT_PRESET_BY_BODY, DEFAULT_START_BY_BODY, presetById, values, validateLander } from "../../../shared/mission/vehicles.js";
import { zonedToUtc, formatUtc, formatZone, formatDuration } from "../../../shared/mission/time.js";
import { bodyState, moonState } from "../../../shared/mission/ephemeris.js";
import { buildPhases, stateAt } from "../../../shared/mission/timeline.js";
import { buildScenario, parseScenario, profileCSV } from "../../../shared/mission/scenario.js";
import { BODIES } from "../../../shared/mission/bodies.js";
import { criteria } from "../../../shared/catalog.js";
import DemMap from "./DemMap.jsx";
import { LAYERS, layerColors } from "./layers.js";
import VerdictCard from "./VerdictCard.jsx";
import { ProfileChart, SeriesChart, Porkchop, SlopeHistogram } from "./charts.jsx";
import { createMissionScene } from "../../scene/landing.js";

const BODY_NAME = { moon: "Місяць", mars: "Марс", earth: "Земля" };
const LAUNCH_SITES = [
  { id: "ksc", name: "Космічний центр Кеннеді (США)", lat: 28.573, lon: -80.649 },
  { id: "kourou", name: "Куру (Французька Гвіана)", lat: 5.236, lon: -52.775 },
  { id: "tanegashima", name: "Танеґасіма (Японія)", lat: 30.4, lon: 130.97 },
  { id: "sriharikota", name: "Шріхаріхота (Індія)", lat: 13.72, lon: 80.23 },
  { id: "custom", name: "Інша точка (вкажи широту)", lat: 45, lon: 30 },
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
  ["dryMass", "Суха маса", "кг"],
  ["propellant", "Паливо", "кг"],
  ["thrustMax", "Тяга макс.", "Н"],
  ["throttleMin", "Мін. дросель", "частка"],
  ["isp", "Isp", "с"],
  ["footprintDiameter", "Діаметр опор", "м"],
  ["maxSlope", "Допустимий ухил", "°"],
  ["maxLegHeightDiff", "Перепад під опорами", "м"],
  ["maxVerticalTouchdown", "Верт. швидкість торкання", "м/с"],
  ["maxHorizontalTouchdown", "Гориз. швидкість торкання", "м/с"],
  ["maxTilt", "Допустимий нахил", "°"],
  ["reserveFraction", "Резерв палива", "частка"],
  ["maxThrustTilt", "Макс. відхилення тяги", "°"],
  ["dragArea", "Cd·A (атмосфера)", "м²"],
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
  const { tr } = useLang();
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
  const [ellipse, setEllipse] = useState({ ...ELLIPSE_DEFAULTS[initialBody] || ELLIPSE_DEFAULTS.moon, origin: "Припущення користувача (3σ розсіювання навігації); не з аналізу навігації конкретної місії" });
  const [profileLength, setProfileLength] = useState(3000);
  const [polyline, setPolyline] = useState([]);
  const [vehicleId, setVehicleId] = useState(DEFAULT_PRESET_BY_BODY[initialBody] || "edu-robotic");
  const [lander, setLander] = useState(() => structuredClone(presetById(DEFAULT_PRESET_BY_BODY[initialBody] || "edu-robotic").lander));
  const [start, setStart] = useState({ ...(DEFAULT_START_BY_BODY[initialBody] || DEFAULT_START_BY_BODY.moon) });
  const [stack, setStack] = useState(() => structuredClone(STACK_DEFAULTS));
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
        else setError("Для цього тіла немає підготовленого DEM.");
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
  const approachLine = useMemo(() => {
    if (!grid || !site) return null;
    const az = (approach * Math.PI) / 180;
    return [offsetToPixel(grid, site.col, site.row, -Math.sin(az) * start.downrange, -Math.cos(az) * start.downrange), site];
  }, [grid, site, approach, start.downrange]);

  // ---- staleness keys ------------------------------------------------------------
  const terrainKey = key({ datasetId, site, ellipse, approach, profileLength, polyline, L });
  const descentKey = key({ datasetId, site, approach, L, start });
  const transferKey = key({ body, launchUtc, lat: launch.lat, transferOpts, S, m: L.dryMass + L.propellant, hs: start.horizontalSpeed });
  const analogKey = key({ datasetId });

  // ---- computations ------------------------------------------------------------
  const runAll = useCallback(async () => {
    if (!meta || !site || landerErrors.length) return;
    const c = client.current;
    const out = { keys: {} };
    setRes((r) => ({ ...r, error: null }));
    try {
      setBusy({ label: "Аналіз рельєфу…", progress: 0.05 });
      await c.ensureLoaded(dem.meta, dem.buffer);
      out.analysis = await c.call("analyze", { datasetId: meta.id, site, ellipse: { ...ellipse, azimuth_deg: approach }, lander: L, approachAzimuth: approach, profileLength, polyline: polyline.length >= 2 ? polyline : null });
      out.keys.terrain = terrainKey;
      setBusy({ label: "Симуляція спуску…", progress: 0.3 });
      out.descent = await c.call("descent", { datasetId: meta.id, site, bodyId: meta.body, lander: L, start: { ...start, approachAzimuth: approach }, dt: start.dt });
      out.keys.descent = descentKey;
      if (meta.body !== "earth") {
        setBusy({ label: "Пошук вікна старту (Lambert)…", progress: 0.5 });
        if (!Number.isFinite(launchUtc)) throw new Error("Некоректна дата старту");
        out.transfer = await c.call(
          "transfer",
          { target: meta.body, launchUtc, ...transferOpts, launchLat: launch.lat, stack: S, landerMass: L.dryMass + L.propellant, descentStart: { horizontalSpeed: start.horizontalSpeed } },
          { onProgress: (p) => setBusy({ label: "Пошук вікна старту (Lambert)…", progress: 0.5 + 0.35 * p }), timeout: 90000 },
        );
      } else {
        out.transfer = { transfer: { applicable: false, note: "Ціль — Земля: міжтілесний переліт не застосовується." }, card: { id: "transfer", title: "Переліт", status: "na", criteria: [], note: "Ціль — Земля: міжтілесний переліт не застосовується; аналізується лише локальний тестовий спуск." } };
      }
      out.keys.transfer = transferKey;
      out.computedUtc = Date.now();
      setRes((r) => ({ ...r, ...out, keys: { ...r.keys, ...out.keys } }));
      setPlay((p) => ({ ...p, phase: 0, local: 0, playing: false }));
      setHzCheck(null);
    } catch (e) {
      setRes((r) => ({ ...r, error: e.name === "AbortError" ? "Розрахунок скасовано." : e.message }));
    } finally {
      setBusy(null);
    }
  }, [meta, dem, site, ellipse, approach, L, profileLength, polyline, start, launchUtc, transferOpts, launch.lat, S, terrainKey, descentKey, transferKey, landerErrors.length]);

  const runAnalogs = useCallback(async () => {
    if (!meta || !index) return;
    const c = client.current;
    try {
      setBusy({ label: "Порівняння з аналогами…", progress: 0.1 });
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
        setBusy({ label: "Порівняння з аналогами…", progress: 0.1 + (0.8 * ++k) / cands.length });
      }
      await c.ensureLoaded(dem.meta, dem.buffer);
      const list = await c.call("analogs", { targetId: meta.id, candidateIds: cands.map((d) => d.id) });
      setRes((r) => ({ ...r, analogs: list.map((x) => ({ ...x, meta: cands.find((d) => d.id === x.id) })), keys: { ...r.keys, analogs: analogKey } }));
    } catch (e) {
      setRes((r) => ({ ...r, error: e.message }));
    } finally {
      setBusy(null);
    }
  }, [meta, index, dem, analogKey]);

  function cancel() {
    client.current?.cancel();
    setBusy(null);
    setRes((r) => ({ ...r, error: "Розрахунок скасовано." }));
  }

  async function loadLive(scale) {
    const lat = Number(liveLat),
      lon = Number(liveLon);
    try {
      setBusy({ label: "Отримання DEM (" + (liveSource === "nasadem" ? "NASADEM" : "Copernicus GLO-30") + " + маска ESA WorldCover)…", progress: 0.3 });
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
  }
  function editLander(k, v) {
    setLander((l) => ({ ...l, [k]: { ...(l[k] || { unit: "" }), value: Number(v), source: "користувач (змінено)" } }));
  }
  function editStack(k, v) {
    setStack((s) => ({ ...s, [k]: { ...s[k], value: Number(v), source: "користувач (змінено)" } }));
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
  const phases = useMemo(() => buildPhases(transfer, descent, body), [transfer, descent, body]);
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
    return { utc, local, space: sp, descent: ds, phase };
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
      terrain: res.analysis ? { status: res.analysis.card.status, criteria: res.analysis.card.criteria.map(({ id, value, status }) => ({ id, value, status })) } : null,
      landing: res.descent ? { status: res.descent.card.status, outcome: descent.outcome, touchdown: descent.touchdown ? { t: descent.touchdown.t, vVertical: descent.touchdown.vVertical, vHorizontal: descent.touchdown.vHorizontal, miss_m: descent.touchdown.miss_m } : null, propellantRemaining: descent.propellantRemaining } : null,
      transfer: transfer?.best ? { status: res.transfer.card.status, depUtc: new Date(transfer.best.depUtc).toISOString(), arrUtc: new Date(transfer.best.arrUtc).toISOString(), dvStage: transfer.best.dvStage } : res.transfer ? { status: res.transfer.card.status } : null,
      analogs: res.analogs?.map((a) => ({ id: a.id, score: a.score, coverage: a.coverage })) ?? null,
    };
  }
  function exportScenario() {
    const sc = buildScenario({
      inputs,
      dataset: meta,
      results: summary(),
      limitations: ["Навчальна модель; не для планування реальних польотів.", "Див. docs/MODELS_AND_LIMITATIONS.md"],
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
      if (!index.some((d) => d.id === i.datasetId)) throw new Error("Набір даних " + i.datasetId + " недоступний у цій версії");
      const ds = index.find((d) => d.id === i.datasetId);
      if (sc.data?.sha256 && ds.sha256 !== sc.data.sha256) throw new Error("Контрольна сума DEM відрізняється — це інші дані");
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
      setImportNote("Сценарій імпортовано. Натисни «Розрахувати», щоб відтворити й звірити результати.");
      if (dem?.meta.id === i.datasetId) {
        setSite(i.site);
        setPolyline(i.polyline || []);
      }
    } catch (e) {
      setError("Імпорт: " + e.message);
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
    setImportNote(checks.length ? (checks.every(Boolean) ? "✓ Імпортований сценарій відтворено: ключові результати збігаються." : "✕ Результати відрізняються від збережених у файлі.") : "");
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
          <div className="eyebrow">{tr("АНАЛІЗ РЕЛЬЄФУ · ПОСАДКА · ПЕРЕЛІТ")} · {BODY_NAME[body]}</div>
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
          {error || res.error}
        </p>
      )}
      {importNote && <p className="m-info" role="status">{importNote}</p>}

      </div>

      <div className="m-layout">
        {/* ------------------------------------------------ LEFT: parameters */}
        <aside className="m-left" aria-label={tr("Параметри")}>
          <details open>
            <summary>1. {tr("Ділянка й дані")}</summary>
            <label>
              DEM
              <select value={datasetId || ""} onChange={(e) => setDatasetId(e.target.value)}>
                {bodyDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.resolution_m} м/пікс.
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
                  Статус: <b>{meta.status}</b> ({meta.statusNote}) · {meta.width}×{meta.height} пікс. · {meta.resolution_m} м/пікс.
                </p>
                <p>Датум: {meta.datum.description}</p>
                <p>
                  CRS: {meta.crs.projection}; широта {meta.crs.latitude}; довгота {meta.crs.longitude}
                </p>
                <p>Верт. точність: {meta.verticalAccuracy}</p>
                {meta.mask && (
                  <p>
                    Маска води ({meta.mask.status}): {meta.mask.rule}; замасковано {(meta.mask.maskedFraction * 100).toFixed(1)} %
                    {meta.mask.unknownFraction > 0 && `, маска невідома для ${(meta.mask.unknownFraction * 100).toFixed(1)} %`}
                    {meta.mask.license && ` · ${meta.mask.license}`}
                  </p>
                )}
                <p>
                  Ліцензія: {meta.source.license}{" "}
                  <a href={meta.source.label || meta.source.url} target="_blank" rel="noopener noreferrer">
                    джерело ↗
                  </a>
                </p>
                {dem?.checksumOk && <p>SHA-256 перевірено ✓</p>}
                <p className="m-muted">
                  Геометрія знімання (висота камери, off-nadir/emission, сонячні кути) для DEM-продуктів не застосовна: це грід висот, а не окремий знімок. Метадані знімків тут не показуються — «недоступно».
                </p>
              </div>
            )}
            {siteLL && (
              <p className="m-muted">
                Точка: {siteLL.lat.toFixed(4)}°, {siteLL.lon.toFixed(4)}° (пікс. {site.col},{site.row})
                {catalogDist !== null && ` · від опорної точки каталогу ${(catalogDist / 1000).toFixed(1)} км${catalogDist > 5000 ? " — вирізка лише поблизу, не саме місце каталогу" : ""}`}
              </p>
            )}
            {body === "earth" && (
              <fieldset className="m-live">
                <legend>Інша точка на Землі (live DEM)</legend>
                <div className="m-row">
                  <input aria-label="Широта" value={liveLat} onChange={(e) => setLiveLat(e.target.value)} placeholder="lat" />
                  <input aria-label="Довгота" value={liveLon} onChange={(e) => setLiveLon(e.target.value)} placeholder="lon" />
                </div>
                <label>
                  Джерело
                  <select value={liveSource} onChange={(e) => setLiveSource(e.target.value)}>
                    <option value="copernicus">Copernicus DEM GLO-30 (DSM, EGM2008)</option>
                    <option value="nasadem">NASADEM (SRTM 2000, EGM96; 56°S–60°N)</option>
                  </select>
                </label>
                <div className="m-row">
                  <button className="text-button" disabled={!caps?.demEarthOnDemand || !!busy} onClick={() => loadLive("fine")}>
                    ~30 м
                  </button>
                  <button className="text-button" disabled={!caps?.demEarthOnDemand || !!busy} onClick={() => loadLive("coarse")}>
                    ~450 м
                  </button>
                </div>
                <p className="m-muted">Маска води: ESA WorldCover 2021 (клас 80). Висоти нижче рівня моря не відкидаються.</p>
                {!caps?.demEarthOnDemand && <p className="m-muted">{caps?.reason || "Потрібен Node-сервер."}</p>}
              </fieldset>
            )}
          </details>
          <details open>
            <summary>2. {tr("Майданчик і захід")}</summary>
            <div className="m-seg" role="radiogroup" aria-label="Режим карти">
              <button role="radio" aria-checked={mapMode === "site"} className={mapMode === "site" ? "active" : ""} onClick={() => setMapMode("site")}>
                ⌖ точка
              </button>
              <button role="radio" aria-checked={mapMode === "polyline"} className={mapMode === "polyline" ? "active" : ""} onClick={() => setMapMode("polyline")}>
                ⟋ полілінія
              </button>
              <button onClick={() => setPolyline([])} disabled={!polyline.length}>
                очистити
              </button>
            </div>
            <label>
              Напрям заходу (азимут руху), °
              <input type="number" min="0" max="359" value={approach} onChange={(e) => setApproach(((Number(e.target.value) % 360) + 360) % 360)} />
            </label>
            <div className="m-row">
              <label>
                Еліпс: велика піввісь, м
                <input type="number" min="1" value={ellipse.a_m} onChange={(e) => setEllipse((x) => ({ ...x, a_m: Math.max(1, +e.target.value) }))} />
              </label>
              <label>
                мала, м
                <input type="number" min="1" value={ellipse.b_m} onChange={(e) => setEllipse((x) => ({ ...x, b_m: Math.max(1, +e.target.value) }))} />
              </label>
            </div>
            <p className="m-muted">Походження еліпса: {ellipse.origin}. Велика вісь орієнтована вздовж заходу.</p>
            <label>
              Довжина профілів, м
              <input type="number" min="50" value={profileLength} onChange={(e) => setProfileLength(Math.max(50, +e.target.value))} />
            </label>
          </details>
          <details>
            <summary>3. {tr("Апарат")}</summary>
            <select value={vehicleId} onChange={(e) => choosePreset(e.target.value)} aria-label="Preset апарата">
              {VEHICLE_PRESETS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <p className="m-muted">{presetById(vehicleId).note}</p>
            <div className="m-params">
              {LANDER_FIELDS.filter(([k]) => lander[k] !== undefined || k === "dragArea").map(([k, label, unit]) => (
                <label key={k} title={"Джерело: " + (lander[k]?.source || "немає")}>
                  {label}, {unit}
                  <input type="number" step="any" value={lander[k]?.value ?? 0} onChange={(e) => editLander(k, e.target.value)} />
                  <small className={lander[k]?.source === "assumed" ? "m-src-assumed" : "m-src"}>{lander[k]?.source === "assumed" ? "припущення" : lander[k]?.source?.startsWith("користувач") ? "користувач" : lander[k] ? "джерело ⓘ" : "0 (немає)"}</small>
                </label>
              ))}
            </div>
            {landerErrors.length > 0 && <p className="m-error">{landerErrors.join("; ")}</p>}
            <p className="m-muted">
              Ідеальна Δv спуску: {r1(L.isp * 9.80665 * Math.log((L.dryMass + L.propellant) / L.dryMass), 0)} м/с (Isp·g0·ln(m0/mf) — не повна вартість)
            </p>
          </details>
          <details>
            <summary>4. {tr("Початок спуску")}</summary>
            <div className="m-params">
              {[
                ["altitude", "Висота над ціллю, м"],
                ["downrange", "Відстань до цілі, м"],
                ["horizontalSpeed", "Гориз. швидкість, м/с"],
                ["verticalSpeed", "Верт. швидкість, м/с"],
                ["dt", "Крок інтегрування, с"],
              ].map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input type="number" step="any" value={start[k]} onChange={(e) => setStart((s) => ({ ...s, [k]: Number(e.target.value) }))} />
                </label>
              ))}
            </div>
            <p className="m-muted">Крок фізики фіксований і не залежить від FPS чи швидкості перегляду.</p>
          </details>
          {body !== "earth" && (
            <details>
              <summary>5. {tr("Старт із Землі й переліт")}</summary>
              <div className="m-row">
                <label>
                  Дата й час
                  <input type="datetime-local" value={launch.local} onChange={(e) => setLaunch((l) => ({ ...l, local: e.target.value }))} />
                </label>
                <label>
                  Пояс
                  <select value={launch.timeZone} onChange={(e) => setLaunch((l) => ({ ...l, timeZone: e.target.value }))}>
                    <option value="Europe/Kyiv">Europe/Kyiv</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </label>
              </div>
              <p className="m-muted">{Number.isFinite(launchUtc) ? `= ${formatUtc(launchUtc)} · ${formatZone(launchUtc, "Europe/Kyiv")}` : "Некоректна дата"} — початок вікна пошуку.</p>
              <label>
                Космодром
                <select
                  value={launch.siteId}
                  onChange={(e) => {
                    const s = LAUNCH_SITES.find((x) => x.id === e.target.value);
                    setLaunch((l) => ({ ...l, siteId: s.id, lat: s.lat }));
                  }}
                >
                  {LAUNCH_SITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {launch.siteId === "custom" && (
                <label>
                  Широта старту, °
                  <input type="number" min="-90" max="90" value={launch.lat} onChange={(e) => setLaunch((l) => ({ ...l, lat: +e.target.value }))} />
                </label>
              )}
              <div className="m-params">
                {[
                  ["windowDays", "Вікно пошуку, діб"],
                  ["depStepDays", "Крок дати, діб"],
                  ["tofMinDays", "Тривалість від, діб"],
                  ["tofMaxDays", "до, діб"],
                  ["tofStepDays", "Крок тривалості, діб"],
                ].map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input type="number" step="any" value={transferOpts[k]} onChange={(e) => setTransferOpts((o) => ({ ...o, [k]: Number(e.target.value) }))} />
                  </label>
                ))}
              </div>
              {body === "mars" && (
                <label>
                  Прибуття
                  <select value={transferOpts.arrivalMode} onChange={(e) => setTransferOpts((o) => ({ ...o, arrivalMode: e.target.value }))}>
                    <option value="entry">Прямий вхід в атмосферу (EDL не моделюється)</option>
                    <option value="capture">Захоплення на орбіту (MOI)</option>
                  </select>
                </label>
              )}
              <div className="m-params">
                {[
                  ["transferDryMass", "Суха маса перелітного ступеня, кг"],
                  ["transferPropellant", "Паливо ступеня, кг"],
                  ["transferIsp", "Isp ступеня, с"],
                  ["launcherLeoCapacity", "Можливість носія на НОО, кг"],
                  ["parkingAltitude", "Висота паркувальної орбіти, м"],
                  ["ascentLosses", "Втрати на виведенні, м/с"],
                  ["arrivalOrbitAltitude", "Висота орбіти прибуття, м"],
                ].map(([k, l]) => (
                  <label key={k} title={"Джерело: " + stack[k].source}>
                    {l}
                    <input type="number" step="any" value={stack[k].value} onChange={(e) => editStack(k, e.target.value)} />
                    <small className="m-src-assumed">{stack[k].source.startsWith("користувач") ? "користувач" : "припущення"}</small>
                  </label>
                ))}
              </div>
            </details>
          )}
        </aside>

        {/* ------------------------------------------------ CENTER */}
        <section className="m-center">
          <div className="m-tabs" role="tablist">
            <button role="tab" aria-selected={centerTab === "map"} className={centerTab === "map" ? "active" : ""} onClick={() => setCenterTab("map")}>
              2D-карта
            </button>
            <button role="tab" aria-selected={centerTab === "3d"} className={centerTab === "3d" ? "active" : ""} onClick={() => setCenterTab("3d")}>
              3D
            </button>
            <span className="m-sep" />
            <select aria-label="Шар" value={layer} onChange={(e) => setLayer(e.target.value)}>
              {LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <label className="m-check">
              <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} /> горизонталі
            </label>
            {centerTab === "3d" && (
              <label className="m-check">
                верт. ×
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
                <p className="m-error">{webglError}</p>
              ) : (
                <canvas ref={sceneCanvas} aria-label="3D-перегляд рельєфу й траєкторії" />
              )}
              <div className="m-hud" aria-live="off">
                <b>{current?.phase?.label || "—"}</b>
                {current?.utc && (
                  <span>
                    {formatUtc(current.utc)} · {formatZone(current.utc, "Europe/Kyiv")}
                  </span>
                )}
                {current?.utc && phases[0] && <span>T+ {formatDuration((current.utc - phases[0].start) / 1000)}</span>}
                {cd && (
                  <>
                    <span>висота над рельєфом {r1(cd.clearance, 1)} м</span>
                    <span>швидкість {r1(Math.hypot(cd.vx, cd.vy, cd.vz), 1)} м/с</span>
                    <span>паливо {r1(cd.fuel, 0)} кг</span>
                    <span>тяга {r1(cd.thrust / 1000, 2)} кН</span>
                  </>
                )}
                {scaleInfo && current?.phase?.id !== "descent" && <span className="m-muted">Відстані в масштабі; тіла збільшено: центр ×{r1(scaleInfo.center, 0)}, ціль ×{r1(scaleInfo.target, 0)}; {scaleInfo.craft}</span>}
                {current?.phase?.id === "descent" && <span className="m-muted">Апарат збільшено для видимості; верт. перебільшення ×{exaggeration} (лише відображення)</span>}
              </div>
              <div className="m-cam" role="group" aria-label="Камера">
                {["overview", "follow", "landing"].map((m) => (
                  <button key={m} className={cam === m ? "active" : ""} onClick={() => setCam(m)}>
                    {{ overview: "огляд", follow: "супровід", landing: "посадка" }[m]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------ RIGHT: verdicts */}
        <aside className="m-right" aria-label={tr("Висновки")}>
          {!analysis && <p className="m-muted">Обери точку на карті й натисни «Розрахувати». Три картки нижче оцінюються незалежно; відсоток «успіху» не показується, бо немає відкаліброваної ймовірнісної моделі.</p>}
          <VerdictCard card={analysis?.card} stale={staleT} />
          {analysis && (
            <p className="m-muted">
              Еліпс: {analysis.regionStats.count} пікс.; висоти {r1(analysis.regionStats.min)}…{r1(analysis.regionStats.max)} м (сер. {r1(analysis.regionStats.mean)}), перепад {r1(analysis.regionStats.relief)} м; ухил сер. {r1(analysis.regionStats.slopeMean)}°, експозиція сер. {r1(analysis.regionStats.aspectMean, 0)}°; nodata {r1(analysis.regionStats.nodataFraction * 100)} %.
            </p>
          )}
          <VerdictCard card={res.descent?.card} stale={staleD} />
          {descent && (
            <p className="m-muted">
              {descent.model}; dt = {descent.dt} с; Δv використано {r1(descent.usedDeltaV, 0)} з {r1(descent.idealDeltaV, 0)} м/с ідеальних; T/W = {r1(descent.thrustToWeight, 2)}.
            </p>
          )}
          <VerdictCard card={res.transfer?.card} stale={staleX} />
          {transfer?.best && (
            <div className="m-muted m-transfer-sum">
              <p>
                Відліт: <b>{formatUtc(transfer.best.depUtc)}</b> ({formatZone(transfer.best.depUtc, "Europe/Kyiv")})<br />
                Прибуття: <b>{formatUtc(transfer.best.arrUtc)}</b> · {r1(transfer.best.tof / 86400, 2)} діб
              </p>
              <p>{transfer.best.dvBreakdown}</p>
              {transfer.best.vinfArr !== undefined && <p>v∞ прибуття {r1(transfer.best.vinfArr, 0)} м/с{transfer.best.c3 !== undefined && body === "mars" ? `; C3 ${r1(transfer.best.c3 / 1e6, 1)} км²/с²` : ""}</p>}
              {(transfer.best.onBoundary?.tof || transfer.best.onBoundary?.departure) && <p className="m-warn">Оптимум на межі сітки пошуку — розшир вікно/діапазон тривалості.</p>}
              <p>
                {transfer.model}; {transfer.ephemeris}. Замикання дуги: {r1(transfer.best.arc.closureError_m, 1)} м.
              </p>
              <p>
                Виведення (оцінка): {r1(transfer.ascent.dv, 0)} м/с = v_круг {r1(transfer.ascent.vCircular, 0)} + втрати {r1(transfer.ascent.losses, 0)} − обертання Землі {r1(transfer.ascent.rotationBonus, 0)}
              </p>
              {caps?.horizons ? (
                <button className="text-button" onClick={checkHorizons}>
                  Звірити ефемериду цілі з JPL Horizons
                </button>
              ) : (
                <p>Звірка з JPL Horizons доступна лише в Node-версії.</p>
              )}
              {hzCheck?.diff_km !== undefined && (
                <p>
                  Horizons ({hzCheck.utc}): різниця положення цілі {r1(hzCheck.diff_km, 0)} км.
                </p>
              )}
              {hzCheck?.error && <p className="m-error">{hzCheck.error}</p>}
            </div>
          )}
          <p className="m-muted">
            «Перешкоди навколо» перевіряються лише як рельєф DEM і поверхня тіла. Космічне сміття, супутники та інші апарати не моделюються.
          </p>
        </aside>
      </div>

      {/* ------------------------------------------------ BOTTOM: timeline + charts */}
      <section className="m-bottom">
        <div className="m-timeline">
          <button onClick={() => setPlay((p) => ({ ...p, playing: !p.playing }))} disabled={!phases.length} aria-label={play.playing ? "Пауза" : "Відтворити"}>
            {play.playing ? "⏸" : "▶"}
          </button>
          <button onClick={() => setPlay((p) => ({ ...p, phase: 0, local: 0, playing: false }))} disabled={!phases.length} aria-label="Скинути">
            ⏮
          </button>
          <input type="range" min="0" max="1000" value={sliderValue} onChange={(e) => seekSlider(+e.target.value)} disabled={!phases.length} aria-label="Перемотування (шкала нелінійна за фазами)" />
          <select value={play.speed} onChange={(e) => setPlay((p) => ({ ...p, speed: +e.target.value }))} aria-label="Швидкість перегляду">
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
                  {p.label} <small>({{ computed: "розраховано", estimated: "оцінка", assumed: "припущення" }[p.kind]})</small>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="m-tabs" role="tablist">
          {[
            ["profiles", "Профілі"],
            ["descent", "Спуск"],
            ["window", "Вікно старту"],
            ["analogs", "Земні аналоги"],
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
                          title={{ along: `Поздовжній (азимут ${approach}°)`, across: `Поперечний (азимут ${(approach + 90) % 360}°)`, poly: "Довільна полілінія" }[w]}
                          datum={meta?.datum?.kind === "sphere" ? `сфера ${meta.datum.radius_m / 1000} км` : meta?.datum?.kind}
                          hoverIndex={hoverProfile.which === w ? hoverProfile.i : null}
                          onHover={(i) => setHoverProfile({ which: w, i })}
                        />
                        <button className="text-button" onClick={() => exportProfile(w)}>
                          ⇩ CSV
                        </button>
                      </div>
                    ),
                )}
                {staleT && <p className="m-stale-note">Профілі застарілі — перерахуй.</p>}
              </>
            ) : (
              <p className="m-muted">Профілі з'являться після розрахунку. Режим «полілінія» додає довільний профіль.</p>
            )}
          </div>
        )}
        {bottomTab === "descent" && (
          <div className="m-charts">
            {descent ? (
              <>
                <SeriesChart
                  samples={descent.samples}
                  title="Висота й запас над рельєфом"
                  t={current?.phase?.id === "descent" ? current.local : NaN}
                  onSeek={(t) => setPlay((p) => ({ ...p, phase: phases.findIndex((x) => x.id === "descent"), local: t }))}
                  series={[
                    { key: "z", label: "висота відн. цілі", color: "#60a5fa", unit: "м" },
                    { key: "clearance", label: "clearance", color: "#34d399", unit: "м", dash: "4 3" },
                  ]}
                />
                <SeriesChart
                  samples={descent.samples}
                  title="Швидкість, паливо й тяга"
                  t={current?.phase?.id === "descent" ? current.local : NaN}
                  series={[
                    { key: "vz", label: "v верт.", color: "#f472b6", unit: "м/с" },
                    { key: "fuel", label: "паливо", color: "#fbbf24", unit: "кг", zero: true },
                    { key: "thrust", label: "тяга", color: "#a78bfa", unit: "Н", dash: "3 3", zero: true },
                  ]}
                />
                {staleD && <p className="m-stale-note">Симуляція застаріла — перерахуй.</p>}
              </>
            ) : (
              <p className="m-muted">Немає симуляції.</p>
            )}
          </div>
        )}
        {bottomTab === "window" && (
          <div className="m-charts">{transfer?.best ? <Porkchop transfer={transfer} /> : <p className="m-muted">{transfer?.note || "Пошук вікна ще не виконано."}</p>}</div>
        )}
        {bottomTab === "analogs" && (
          <div className="m-charts m-analogs">
            <p>
              Порівняння морфометрії всієї вирізки {meta?.name} з {body === "earth" ? "місячними/марсіанськими" : "земними"} ділянками. Масштаби узгоджуються блочним усередненням до спільного пікселя, ділянки обрізаються до однакової площі. Подібність ≠ ймовірність безпечної посадки.
            </p>
            <button className="action secondary" onClick={runAnalogs} disabled={!!busy || !meta}>
              ⇄ Порівняти
            </button>
            {staleA && <p className="m-stale-note">Застаріло — інша ділянка.</p>}
            {layers?.hist && (
              <div className="m-hist-wrap">
                <span>Розподіл ухилів цілі (°, Horn 3×3)</span>
                <SlopeHistogram hist={layers.hist} maxSlope={L.maxSlope} label="Гістограма ухилів цільової ділянки" />
              </div>
            )}
            {res.analogs && (
              <div className="m-table-wrap">
                <table className="m-table">
                  <thead>
                    <tr>
                      <th>Кандидат</th>
                      <th>Подібність</th>
                      <th>Покриття метрик</th>
                      <th>Спільний масштаб</th>
                      <th>Δ ухили (EMD)</th>
                      <th>Δ P90</th>
                      <th>Δ шорсткість</th>
                      <th>Δ перепад</th>
                      <th>Ознаки з каталогу</th>
                      <th>Примітки</th>
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
                          return r?.available ? r.difference.toFixed(2) : "немає";
                        };
                        return (
                          <tr key={a.id}>
                            <td>
                              {a.meta?.name}
                              <br />
                              <small>{a.meta?.source?.productId}</small>
                            </td>
                            <td>{a.score === null || a.score === undefined ? "недостатньо даних" : a.score.toFixed(2)}</td>
                            <td>{a.coverage !== undefined ? Math.round(a.coverage * 100) + " %" : "—"}</td>
                            <td>{a.commonPixel_m ? `${r1(a.commonPixel_m, 0)} м/пікс., ${r1(a.extent_m / 1000, 1)} км` : "—"}</td>
                            <td>{cell("slopeHist")}</td>
                            <td>{cell("slopeP90")}</td>
                            <td>{cell("roughness")}</td>
                            <td>{cell("relief")}</td>
                            <td>{cat?.science ? cat.science.traits.map((id) => tr(criteria.find((c) => c.id === id)?.label || id)).join(", ") || "—" : "кандидат (ознаки не задокументовані)"}</td>
                            <td>{(a.flags || []).join("; ") || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <p className="m-muted">
                  Нормування: EMD/10°, |ΔP90|/10°, |log10 відношення| для шорсткості й перепаду (1 = декада); кожну різницю обмежено 1. Ваги: розподіл 0.4, P90 0.2, шорсткість 0.2, перепад 0.2. Відсутні метрики не вважаються нульовою різницею: вони зменшують покриття, і при покритті нижче 60 % рейтинг не показується.
                </p>
                <p className="m-muted">
                  Придатний для: тестів навігації, мобільності й датчиків небезпек на масштабі спільного пікселя, якщо розподіли ухилів близькі. Не відтворює ({body === "mars" ? "Марс" : body === "moon" ? "Місяць" : "Місяць/Марс"}):{" "}
                  {(ANALOG_LIMITS[body] || [...ANALOG_LIMITS.moon, ...ANALOG_LIMITS.mars]).join("; ")}.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </dialog>
  );
}

