// Three.js view for the mission planner. It only RENDERS precomputed solver
// states (same arrays the charts use); it never integrates physics.
//  • "space"  : transfer arc + body positions (true distances; body spheres may be
//               enlarged for visibility — the enlargement factor is reported).
//  • "surface": DEM mesh in the local ENU frame (x east, y up, z = −north),
//               vertical exaggeration applies to the mesh AND the trajectory
//               consistently, never to the computations.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bi } from "../i18n/bilingual.js";

export function createMissionScene(canvas, callbacks = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch {
    callbacks.onError?.(bi("WebGL недоступний: 3D вимкнено. 2D-карта, профілі й таблиці працюють.", "WebGL unavailable: 3D is disabled. The 2D map, profiles and tables still work."));
    return null;
  }
  const stage = canvas.parentElement;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030712);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5e6);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-1, 0.6, 0.4);
  scene.add(sun);

  const disposables = new Set();
  const track = (o) => (disposables.add(o), o);
  const surface = new THREE.Group();
  const space = new THREE.Group();
  scene.add(surface, space);
  let view = "surface";
  let camMode = "overview";
  let exaggeration = 1;
  let terrainMesh = null,
    trajLine = null,
    lander = null,
    plume = null,
    highlight = null,
    siteMarker = null,
    craft = null;
  const spaceBodies = {};
  let terrainSize = 1000;
  let landerScale = 1;
  let lastLander = new THREE.Vector3();

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse?.((o) => {
        o.geometry?.dispose();
        if (o.material) [].concat(o.material).forEach((m) => m.dispose());
      });
    }
  }

  /**
   * terrain: { nx, ny, x: Float32Array, y: Float32Array (north), z: Float32Array (up, rel. target,
   *            NaN = gap), colors: Uint8Array RGB }
   */
  function setTerrain(t) {
    if (terrainMesh) {
      surface.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      terrainMesh.material.dispose();
    }
    const { nx, ny } = t;
    const pos = new Float32Array(nx * ny * 3);
    const col = new Float32Array(nx * ny * 3);
    let minZ = Infinity;
    for (const z of t.z) if (z === z && z < minZ) minZ = z;
    for (let i = 0; i < nx * ny; i++) {
      const z = t.z[i] === t.z[i] ? t.z[i] : minZ;
      pos[i * 3] = t.x[i];
      pos[i * 3 + 1] = z;
      pos[i * 3 + 2] = -t.y[i];
      const gap = t.z[i] !== t.z[i];
      col[i * 3] = gap ? 0.35 : t.colors[i * 3] / 255;
      col[i * 3 + 1] = gap ? 0.35 : t.colors[i * 3 + 1] / 255;
      col[i * 3 + 2] = gap ? 0.38 : t.colors[i * 3 + 2] / 255;
    }
    const idx = [];
    for (let r = 0; r < ny - 1; r++)
      for (let c = 0; c < nx - 1; c++) {
        const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
        if ([a, b, d, e].some((k) => t.z[k] !== t.z[k])) continue; // never bridge nodata
        idx.push(a, d, b, b, d, e);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    terrainMesh.scale.y = exaggeration;
    surface.add(terrainMesh);
    let ext = 0;
    for (let i = 0; i < t.x.length; i++) ext = Math.max(ext, Math.abs(t.x[i]), Math.abs(t.y[i]));
    terrainSize = ext || 1000;
    landerScale = Math.max(1, terrainSize / 400);
    if (!siteMarker) {
      siteMarker = new THREE.Mesh(track(new THREE.RingGeometry(0.8, 1, 48)), track(new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide })));
      siteMarker.rotation.x = -Math.PI / 2;
      surface.add(siteMarker);
    }
    siteMarker.scale.setScalar(terrainSize / 60);
    siteMarker.position.set(0, 2, 0);
    ensureLander();
    if (camMode === "overview") resetCamera();
  }

  function ensureLander() {
    if (lander) return;
    lander = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.4, roughness: 0.4 }));
    body.position.y = 2.2;
    lander.add(body);
    for (let k = 0; k < 4; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      leg.position.set(Math.cos(a) * 1.5, 1, Math.sin(a) * 1.5);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = -Math.sin(a) * 0.5;
      lander.add(leg);
    }
    plume = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 12), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.8 }));
    plume.rotation.x = Math.PI;
    plume.position.y = -0.5;
    lander.add(plume);
    surface.add(lander);
  }

  /** samples: descent samples (ENU metres). */
  function setTrajectory(samples) {
    if (trajLine) {
      surface.remove(trajLine);
      trajLine.geometry.dispose();
      trajLine.material.dispose();
      trajLine = null;
    }
    if (!samples?.length) return;
    const pts = [];
    const stride = Math.max(1, Math.floor(samples.length / 1500));
    for (let i = 0; i < samples.length; i += stride) pts.push(new THREE.Vector3(samples[i].x, samples[i].z, -samples[i].y));
    const last = samples[samples.length - 1];
    pts.push(new THREE.Vector3(last.x, last.z, -last.y));
    trajLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x60a5fa }));
    trajLine.scale.y = exaggeration;
    surface.add(trajLine);
  }

  function setHighlight(p) {
    if (!highlight) {
      highlight = new THREE.Mesh(track(new THREE.SphereGeometry(1, 16, 12)), track(new THREE.MeshBasicMaterial({ color: 0xf472b6 })));
      surface.add(highlight);
    }
    highlight.visible = !!p;
    if (p) {
      highlight.position.set(p.x, p.z * exaggeration, -p.y);
      highlight.scale.setScalar(terrainSize / 120);
    }
  }

  function setExaggeration(k) {
    exaggeration = k;
    if (terrainMesh) terrainMesh.scale.y = k;
    if (trajLine) trajLine.scale.y = k;
  }

  /** arc: { states:[{r, earth, target}], center }, radii in metres. */
  function setTransfer(arc, info) {
    clearGroup(space);
    Object.keys(spaceBodies).forEach((k) => delete spaceBodies[k]);
    if (!arc) return;
    const unit = info.unit; // metres per scene unit
    const toV = (r) => new THREE.Vector3(r[0] / unit, r[2] / unit, -r[1] / unit);
    const line = (points, color, dashed) => {
      const g = new THREE.BufferGeometry().setFromPoints(points.map(toV));
      const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.2 }) : new THREE.LineBasicMaterial({ color });
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      space.add(l);
    };
    line(arc.states.map((s) => s.r), 0x60a5fa);
    if (info.earthOrbit) line(info.earthOrbit, 0x3b82f6, true);
    if (info.targetOrbit) line(info.targetOrbit, info.targetColor, true);
    const sphere = (radius_m, color, minUnits) => {
      const r = Math.max(radius_m / unit, minUnits);
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      space.add(m);
      return { mesh: m, enlargement: r / (radius_m / unit) };
    };
    spaceBodies.center = sphere(info.centerRadius, info.centerColor, info.minBody);
    spaceBodies.earth = info.center === "sun" ? sphere(6.371e6, 0x3b82f6, info.minBody * 0.6) : null;
    spaceBodies.target = sphere(info.targetRadius, info.targetColor, info.minBody * 0.6);
    craft = new THREE.Mesh(new THREE.OctahedronGeometry(info.minBody * 0.35), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    space.add(craft);
    spaceBodies.toV = toV;
    callbacks.onScale?.({
      center: spaceBodies.center.enlargement,
      earth: spaceBodies.earth?.enlargement ?? spaceBodies.center.enlargement,
      target: spaceBodies.target.enlargement,
      craft: "маркер апарата — символ, не в масштабі",
    });
    if (view === "space") resetCamera();
  }

  function setView(v) {
    view = v;
    surface.visible = v === "surface";
    space.visible = v === "space";
    resetCamera();
  }

  function resetCamera() {
    if (view === "space") {
      camera.near = 0.01;
      camera.far = 1e4;
      camera.position.set(0, 25, 18);
      controls.target.set(0, 0, 0);
    } else {
      camera.near = Math.max(0.5, terrainSize / 2000);
      camera.far = terrainSize * 50;
      camera.position.set(terrainSize * 0.9, terrainSize * 0.7, terrainSize * 1.1);
      controls.target.set(0, 0, 0);
    }
    camera.updateProjectionMatrix();
  }

  function setCameraMode(m) {
    camMode = m;
    if (m === "overview") resetCamera();
  }

  /** state: { space: {r, earth, target} | null, descent: sample | null } */
  function setState(state) {
    if (state.space && spaceBodies.toV) {
      const { toV } = spaceBodies;
      craft.position.copy(toV(state.space.r));
      if (spaceBodies.target) spaceBodies.target.mesh.position.copy(toV(state.space.target));
      if (spaceBodies.earth) spaceBodies.earth.mesh.position.copy(toV(state.space.earth));
      if (view === "space" && camMode === "follow") {
        controls.target.copy(craft.position);
      }
    }
    const d = state.descent;
    if (d && lander) {
      lander.visible = true;
      lander.scale.setScalar(landerScale);
      lander.position.set(d.x, d.z * exaggeration, -d.y);
      const tmag = Math.hypot(d.tx, d.ty, d.tz);
      if (tmag > 0) {
        const dir = new THREE.Vector3(d.tx, d.tz, -d.ty).normalize();
        lander.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      plume.visible = d.thrust > 0;
      plume.scale.set(1, Math.max(0.2, d.thrust / (state.thrustMax || d.thrust || 1)) * 1.6, 1);
      if (view === "surface") {
        if (camMode === "follow") {
          const delta = lander.position.clone().sub(lastLander);
          camera.position.add(delta);
          controls.target.copy(lander.position);
        } else if (camMode === "landing") {
          camera.position.set(terrainSize * 0.08, Math.max(lander.position.y, 0) + terrainSize * 0.05, terrainSize * 0.12);
          controls.target.copy(lander.position);
        }
      }
      lastLander.copy(lander.position);
    }
  }

  function resize() {
    const w = stage.clientWidth || 1,
      h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  setView("surface");
  let raf = 0;
  let disposed = false;
  function loop() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  return {
    setTerrain,
    setTrajectory,
    setHighlight,
    setExaggeration,
    setTransfer,
    setView,
    setCameraMode,
    setState,
    snapshot: () => canvas.toDataURL("image/png"),
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      clearGroup(surface);
      clearGroup(space);
      disposables.forEach((o) => o.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
