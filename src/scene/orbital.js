import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { worlds as data } from "../../shared/worlds.js";
import {
  createMapLoader,
  createEarth,
  createSun,
  createAtmosphere,
  texturePath,
} from "./celestial.js";

export function createOrbitalScene(canvas, callbacks = {}) {
  let disposed = false;
  const stage = canvas.parentElement;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  } catch {
    callbacks.onError?.(
      "WebGL недоступний. Зараз показано фотокарту поверхні.",
    );
    return {
      selectWorld() {},
      focusPlace() {},
      setMarkers() {},
      setPaused() {},
      setSpeed() {},
      setCinematic() {},
      overview() {},
      zoom() {},
      destroy() {},
    };
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020611);
  const camera = new THREE.PerspectiveCamera(
    42,
    stage.clientWidth / stage.clientHeight,
    0.1,
    600,
  );
  camera.position.set(0, 1.4, 8.8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 0.9;
  controls.maxDistance = 300;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.25;
  scene.add(new THREE.AmbientLight(0xa5bcd5, 0.55));
  const fillLight = new THREE.DirectionalLight(0xaecce2, 0.5);
  fillLight.position.set(-8, 4, 8);
  scene.add(fillLight);
  const loadingManager = new THREE.LoadingManager();

  loadingManager.onProgress = (_url, loaded, total) => {
    !disposed && callbacks.onLoad?.(`Текстури ${loaded} / ${total}`);
  };
  let failedTexture = false;
  loadingManager.onError = () => {
    failedTexture = true;
    callbacks.onLoad?.("Частина текстур недоступна");
  };
  loadingManager.onLoad = () =>
    !disposed &&
    callbacks.onLoad?.(
      failedTexture ? "Частина текстур недоступна" : "Текстури завантажено",
    );
  const sg = new THREE.BufferGeometry(),
    starsN = 7500,
    sp = new Float32Array(starsN * 3);
  for (let i = 0; i < starsN; i++) {
    let r = 55 + Math.random() * 140,
      a = Math.random() * 6.28,
      b = Math.acos(2 * Math.random() - 1);
    sp.set(
      [
        r * Math.sin(b) * Math.cos(a),
        r * Math.cos(b),
        r * Math.sin(b) * Math.sin(a),
      ],
      i * 3,
    );
  }
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(
    sg,
    new THREE.PointsMaterial({
      color: 0xc5dcff,
      size: 0.13,
      transparent: true,
      opacity: 0.9,
    }),
  );
  scene.add(stars);
  const tex = new THREE.TextureLoader(loadingManager);
  tex.setCrossOrigin("anonymous");
  const objects = [],
    markers = [],
    ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  let current = 0,
    tween = null,
    overviewMode = false,
    selectedPlace = null;
  let showMarkers = true;
  let cinematic = false;
  // OS "reduce motion" only affects the idle spinning; camera transitions are core UI feedback.
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loadMap = createMapLoader(tex, renderer);
  const worldSurfaces = [];
  let earthVisual = null;
  const markerRings = [];
  const system = new THREE.Group();
  scene.add(system);
  const solarCenter = new THREE.Vector3(0, 0, 0);
  const positions = data.map(() => new THREE.Vector3());
  const orbitalClock = { seconds: 0, speed: 0.25, paused: false };
  const orbitDefinitions = {
    mercury: { r: 8.5, period: 22, phase: 1.1, inclination: 0.05 },
    venus: { r: 14, period: 35, phase: 3.6, inclination: 0.02 },
    earth: { r: 22, period: 48, phase: 0.6, inclination: 0 },
    mars: { r: 31, period: 75, phase: 2.3, inclination: 0.035 },
    jupiter: { r: 44, period: 130, phase: 4.2, inclination: 0.025 },
    saturn: { r: 57, period: 175, phase: 1.9, inclination: 0.04 },
    uranus: { r: 69, period: 225, phase: 5.0, inclination: 0.02 },
    neptune: { r: 81, period: 270, phase: 3.2, inclination: 0.025 },
  };
  function orbitalPosition(id, time) {
    let o = orbitDefinitions[id],
      a = o.phase + (time * 2 * Math.PI) / o.period;
    return new THREE.Vector3(
      o.r * Math.cos(a),
      o.r * Math.sin(a) * o.inclination,
      o.r * Math.sin(a),
    );
  }
  function makeOrbit(radius, color, opacity = 0.24) {
    let vertices = [];
    for (let k = 0; k <= 256; k++) {
      let a = (k * Math.PI * 2) / 256;
      vertices.push(
        new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)),
      );
    }
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(vertices),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    scene.add(orbit);
    return orbit;
  }
  Object.values(orbitDefinitions).forEach((o) =>
    makeOrbit(o.r, 0x6c9fcb, 0.25),
  );
  const solarVisual = renderer ? createSun(data[3].radius, loadMap) : null;
  const sunLight = new THREE.PointLight(0xfff1de, 150, 300, 1.35);
  scene.add(sunLight);
  // The six extra planets remain visual-only, while all eight planets orbit the Sun.
  const decorativePlanets = [
    { name: "Меркурій", id: "mercury", radius: 0.46, texture: "mercury" },
    { name: "Венера", id: "venus", radius: 0.79, texture: "venus" },
    { name: "Юпітер", id: "jupiter", radius: 2.3, texture: "jupiter" },
    {
      name: "Сатурн",
      id: "saturn",
      radius: 1.95,
      texture: "saturn",
      rings: true,
    },
    { name: "Уран", id: "uranus", radius: 1.22, texture: "uranus" },
    { name: "Нептун", id: "neptune", radius: 1.19, texture: "neptune" },
  ];
  const planetLabels = [];
  const orbitalBodies = {};
  // Use authentic equirectangular planetary maps. Local files win; online sources are fallback.
  function setTexture(material, url, fallback, id) {
    if (!renderer) return;
    tex.load(
      texturePath(id),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        material.map = t;
        material.needsUpdate = true;
      },
      undefined,
      () => console.warn("Texture unavailable", id),
    );
  }
  decorativePlanets.forEach((p) => {
    const group = new THREE.Group();
    scene.add(group);
    orbitalBodies[p.id] = group;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
    });
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, 80, 64),
      material,
    );
    group.add(sphere);
    setTexture(material, null, null, p.id);
    if (p.rings) {
      const rings = new THREE.Mesh(
        new THREE.RingGeometry(p.radius * 1.32, p.radius * 2.25, 128),
        new THREE.MeshStandardMaterial({
          color: 0xd9c5a3,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
          roughness: 1,
        }),
      );
      rings.rotation.x = Math.PI * 0.37;
      rings.rotation.y = 0.22;
      group.add(rings);
    }
    planetLabels.push({ name: p.name, mesh: sphere });
  });
  // Earth, Moon and Mars use the same reliable local-first texture pipeline.
  function surfacePoint(lat, lon, r) {
    let p = (lat * Math.PI) / 180,
      l = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.cos(p) * Math.cos(l),
      r * Math.sin(p),
      r * Math.cos(p) * Math.sin(l),
    );
  }
  data.forEach((d, i) => {
    const group = new THREE.Group();
    system.add(group);
    orbitalBodies[d.id] = group;
    const surface = new THREE.Group();
    group.add(surface);
    worldSurfaces.push(surface);
    if (d.id === "earth") surface.rotation.y = Math.PI;
    let mesh;
    if (d.id === "sun") {
      mesh =
        solarVisual?.surface ||
        new THREE.Mesh(
          new THREE.SphereGeometry(d.radius, 64, 48),
          new THREE.MeshBasicMaterial({ color: 0xffb75c }),
        );
      surface.add(solarVisual?.group || mesh);
    } else {
      let material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
      });
      if (d.id === "earth" && renderer) {
        earthVisual = createEarth(d.radius, loadMap);
        material = earthVisual.material;
      } else setTexture(material, null, null, d.id);
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(d.radius, 128, 96),
        material,
      );
      surface.add(mesh);
      if (earthVisual && d.id === "earth") {
        surface.add(earthVisual.clouds);
        group.add(earthVisual.atmosphere);
      } else if (d.id === "mars")
        group.add(createAtmosphere(d.radius * 1.025, 0xdd7851, 0.2));
    }
    mesh.userData = { kind: "planet", i };
    objects.push(mesh);
    d.places.forEach((place, j) => {
      const point = surfacePoint(place.lat, place.lon, d.radius * 1.018);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(d.radius * 0.018, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x9cf0d5 }),
      );
      marker.position.copy(point);
      marker.userData = { kind: "site", world: i, site: j };
      surface.add(marker);
      markers.push(marker);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(d.radius * 0.029, d.radius * 0.037, 28),
        new THREE.MeshBasicMaterial({
          color: 0x9cf0d5,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.copy(point);
      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        point.clone().normalize(),
      );
      ring.userData = { world: i };
      surface.add(ring);
      markerRings.push(ring);
    });
  });
  // The Moon has its own inclined orbit centered on the moving Earth.
  const moonOrbit = makeOrbit(3.5, 0xc3d5f0, 0.48);
  function updateOrbits(time) {
    for (const id of Object.keys(orbitDefinitions))
      orbitalBodies[id].position.copy(orbitalPosition(id, time));
    const earth = orbitalBodies.earth.position;
    const a = (time * 2 * Math.PI) / 9 + 0.8;
    orbitalBodies.moon.position.set(
      earth.x + 3.5 * Math.cos(a),
      earth.y + 0.42 * Math.sin(a),
      earth.z + 3.5 * Math.sin(a),
    );
    moonOrbit.position.copy(earth);
    positions[0].copy(earth);
    positions[1].copy(orbitalBodies.moon.position);
    positions[2].copy(orbitalBodies.mars.position);
  }
  updateOrbits(0);
  let frame = 0;
  let lastLabels = 0;
  function updateMarkers() {
    markers.forEach(
      (marker) =>
        (marker.visible =
          showMarkers && !overviewMode && marker.userData.world === current),
    );
    markerRings.forEach(
      (ring) =>
        (ring.visible =
          showMarkers && !overviewMode && ring.userData.world === current),
    );
  }
  function flyTo(offset) {
    overviewMode = false;
    updateMarkers();
    const from = camera.position.clone(),
      look = controls.target.clone(),
      start = performance.now();
    cancelAnimationFrame(tween);
    function move(now) {
      const t = Math.min(1, Math.max(0, (now - start) / 900)),
        ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(
        from,
        positions[current].clone().add(offset),
        ease,
      );
      controls.target.lerpVectors(look, positions[current], ease);
      tween = t < 1 ? requestAnimationFrame(move) : null;
    }
    tween = requestAnimationFrame(move);
  }
  function selectWorld(index) {
    current = index;
    selectedPlace = null;
    const radius = data[current].radius;
    controls.minDistance = radius * 1.18;
    const approach =
      current === 3
        ? new THREE.Vector3(0, 0, 1)
        : positions[current]
            .clone()
            .negate()
            .normalize()
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    approach.multiplyScalar(radius * 3.8);
    approach.y += radius * 0.55;
    flyTo(approach);
  }
  // Smooth camera transfer between two points of the same world:
  // the view direction is slerped around the planet centre (the camera never
  // cuts through the planet), the distance is eased and gets a small
  // "pull-back" in the middle of long hops, so it feels like a real fly-over.
  function flyAround(direction, distance) {
    overviewMode = false;
    updateMarkers();
    const center0 = positions[current].clone(),
      startOffset = camera.position.clone().sub(center0),
      startDistance = Math.max(startOffset.length(), 0.001),
      startDir = startOffset.clone().normalize(),
      endDir = direction.clone().normalize(),
      look = controls.target.clone(),
      rotation = new THREE.Quaternion().setFromUnitVectors(startDir, endDir),
      angle = 2 * Math.acos(Math.min(1, Math.abs(rotation.w))),
      identity = new THREE.Quaternion(),
      duration = 750 + (angle / Math.PI) * 1000,
      start = performance.now();
    cancelAnimationFrame(tween);
    function move(now) {
      const t = Math.min(1, Math.max(0, (now - start) / duration)),
        ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        center = positions[current],
        dir = startDir
          .clone()
          .applyQuaternion(identity.clone().slerp(rotation, ease)),
        pull = 1 + 0.35 * Math.sin(Math.PI * ease) * Math.min(1, angle / Math.PI),
        dist = (startDistance + (distance - startDistance) * ease) * pull;
      camera.position.copy(center).addScaledVector(dir, dist);
      controls.target.lerpVectors(look, center, ease);
      tween = t < 1 ? requestAnimationFrame(move) : null;
    }
    tween = requestAnimationFrame(move);
  }
  function focusPlace(index) {
    selectedPlace = index;
    if (index === null) return;
    const world = data[current],
      place = world.places[index];
    if (!place) return;
    const direction = surfacePoint(place.lat, place.lon, 1)
      .normalize()
      .applyQuaternion(worldSurfaces[current].quaternion);
    flyAround(direction, world.radius * 3.5);
  }
  function overview() {
    overviewMode = true;
    selectedPlace = null;
    updateMarkers();
    const from = camera.position.clone(),
      look = controls.target.clone(),
      start = performance.now();
    const destination = new THREE.Vector3(0, 135, 220).multiplyScalar(
      Math.max(1, 1.1 / camera.aspect),
    );
    cancelAnimationFrame(tween);
    function move(now) {
      const t = Math.min(1, Math.max(0, (now - start) / 1000)),
        ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(from, destination, ease);
      controls.target.lerpVectors(look, new THREE.Vector3(), ease);
      tween = t < 1 ? requestAnimationFrame(move) : null;
    }
    tween = requestAnimationFrame(move);
  }
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(mouse, camera);
    return ray.intersectObjects([
      ...objects,
      ...markers.filter((marker) => marker.visible),
    ])[0];
  }
  let pointerStart = null;
  function pointerDown(event) {
    pointerStart = { x: event.clientX, y: event.clientY };
  }
  function pointerUp(event) {
    const start = pointerStart;
    pointerStart = null;
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
    )
      return;
    const hit = pick(event);
    if (!hit) return;
    callbacks.onHover?.(null);
    const info = hit.object.userData;
    if (info.kind === "planet") callbacks.onSelectWorld?.(info.i);
    if (info.kind === "site") callbacks.onSelectPlace?.(info.site);
  }
  function pointerMove(event) {
    const hit = pick(event);
    canvas.style.cursor = hit ? "pointer" : "grab";
    if (hit?.object.userData.kind === "site") {
      const { world, site } = hit.object.userData,
        place = data[world].places[site];
      callbacks.onHover?.({
        x: event.clientX,
        y: event.clientY,
        title: place.name,
        subtitle: place.type,
      });
    } else callbacks.onHover?.(null);
  }
  function pointerLeave() {
    pointerStart = null;
    callbacks.onHover?.(null);
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerleave", pointerLeave);
  controls.addEventListener("start", () => {
    cancelAnimationFrame(tween);
    tween = null;
  });
  const resize = new ResizeObserver(() => {
    if (!stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  });
  resize.observe(stage);
  const clock = new THREE.Clock();
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.06);
    if (!orbitalClock.paused)
      orbitalClock.seconds += delta * orbitalClock.speed;
    if (!orbitalClock.paused && !reducedMotion) {
      worldSurfaces.forEach((surface, i) => {
        if (selectedPlace === null || i !== current)
          surface.rotation.y +=
            delta * (i === 1 ? 0.003 : i === 3 ? 0.012 : 0.022);
      });
      if (earthVisual) earthVisual.clouds.rotation.y += delta * 0.008;
    }
    if (solarVisual)
      solarVisual.material.uniforms.time.value = orbitalClock.seconds;
    const previous = positions[current].clone();
    updateOrbits(orbitalClock.seconds);
    if (tween === null && !overviewMode) {
      const shift = positions[current].clone().sub(previous);
      camera.position.add(shift);
      controls.target.add(shift);
    }
    controls.autoRotate =
      cinematic && !overviewMode && selectedPlace === null && !reducedMotion;
    controls.update();
    renderer.render(scene, camera);
    if (performance.now() - lastLabels > 180) {
      lastLabels = performance.now();
      callbacks.onLabels?.(
        data.flatMap((world, index) => {
          const point = positions[index].clone().project(camera);
          const visible =
            (overviewMode || index !== current) &&
            point.z < 1 &&
            point.z > -1 &&
            Math.abs(point.x) < 0.93 &&
            Math.abs(point.y) < 0.88;
          return visible
            ? [
                {
                  index,
                  name: world.name,
                  x: ((point.x + 1) * stage.clientWidth) / 2,
                  y: ((1 - point.y) * stage.clientHeight) / 2 + 12,
                },
              ]
            : [];
        }),
      );
    }
  }
  selectWorld(0);
  animate();
  return {
    selectWorld,
    focusPlace,
    overview,
    setMarkers(value) {
      showMarkers = value;
      updateMarkers();
    },
    setPaused(value) {
      orbitalClock.paused = value;
    },
    setSpeed(value) {
      orbitalClock.speed = value;
    },
    setCinematic(value) {
      cinematic = value;
    },
    zoom(direction) {
      const distance = camera.position.distanceTo(controls.target);
      if (direction > 0 && distance > data[current].radius * 1.3)
        camera.position.lerp(controls.target, 0.14);
      if (direction < 0 && distance < controls.maxDistance * 0.85)
        camera.position.lerp(controls.target, -0.16);
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(tween);
      resize.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerleave", pointerLeave);
      const textures = new Set(),
        geometries = new Set(),
        materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          if (!material) continue;
          materials.add(material);
          if (material.map) textures.add(material.map);
          for (const uniform of Object.values(material.uniforms || {}))
            if (uniform.value?.isTexture) textures.add(uniform.value);
        }
      });
      textures.forEach((texture) => texture.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    },
  };
}