import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// 3D-гід ОРІ: деталізований астронавт зі скляним візором, обличчям усередині
// шолома, ранцем життєзабезпечення й шлангами. Модель можна крутити на 360°
// (OrbitControls). getLevel() повертає гучність мовлення 0…1 для рота й жестів.
export function createAvatar(canvas, getLevel = () => 0, { onInteract } = {}) {
  let frame = 0,
    disposed = false;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envTexture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0.8, 1.5, 6.1);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.12, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9;
  controls.minDistance = 3.2;
  controls.maxDistance = 7.5;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 1.2;
  let idleSince = performance.now();
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    onInteract?.();
  });
  controls.addEventListener("end", () => (idleSince = performance.now()));
  controls.update();

  scene.add(new THREE.HemisphereLight(0xdff6ff, 0x1d2a3e, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x80fbd6, 2.6);
  rim.position.set(3, 2.5, -3);
  scene.add(rim);
  const fill = new THREE.PointLight(0x9fd8ff, 6, 6);
  fill.position.set(0, 0.4, 2);
  scene.add(fill);

  // ---- матеріали ----
  const M = {
    suit: new THREE.MeshPhysicalMaterial({ color: 0xe9eff2, roughness: 0.62, metalness: 0.02, sheen: 0.6, sheenColor: 0xbfe9ff, sheenRoughness: 0.6 }),
    suitShade: new THREE.MeshPhysicalMaterial({ color: 0xc9d6dd, roughness: 0.7, sheen: 0.4, sheenColor: 0xa9d9ef }),
    panel: new THREE.MeshStandardMaterial({ color: 0x1c3445, roughness: 0.45, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x121c24, roughness: 0.55, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.28, metalness: 0.95 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9b46a, roughness: 0.25, metalness: 1 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x79e8c4, emissive: 0x2bbf91, emissiveIntensity: 0.55, roughness: 0.35 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf0a77d, emissive: 0x7a3414, emissiveIntensity: 0.35, roughness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0b2a2a, emissive: 0x58f0c8, emissiveIntensity: 0.9, roughness: 0.2 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.9 }),
    skin: new THREE.MeshPhysicalMaterial({ color: 0xe7b08c, roughness: 0.55, sheen: 0.3, sheenColor: 0xffc9a8 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2b211d, roughness: 0.7 }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1 }),
    iris: new THREE.MeshPhysicalMaterial({ color: 0x24445a, roughness: 0.2, clearcoat: 1 }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x050708 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lip: new THREE.MeshStandardMaterial({ color: 0x7c3a37, roughness: 0.5 }),
    blush: new THREE.MeshBasicMaterial({ color: 0xff8a7a, transparent: true, opacity: 0.22, depthWrite: false }),
    padding: new THREE.MeshStandardMaterial({ color: 0x24394a, roughness: 0.9, side: THREE.BackSide }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbfe8ff,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 2.2,
      depthWrite: false,
    }),
  };

  const model = new THREE.Group();
  scene.add(model);
  const add = (parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  };
  const sphere = (r, w = 48, h = 36) => new THREE.SphereGeometry(r, w, h);
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 12, 32);
  const ring = (r, tube) => new THREE.TorusGeometry(r, tube, 20, 72);
  const cyl = (rt, rb, h, seg = 40) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const rbox = (w, h, d, rad = 0.03) => new RoundedBoxGeometry(w, h, d, 5, rad);

  // ---- ноги й чоботи ----
  [-1, 1].forEach((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.17, 0, 0);
    model.add(leg);
    add(leg, rbox(0.23, 0.14, 0.38, 0.06), M.suitShade, [0, 0.09, 0.05]);
    add(leg, rbox(0.25, 0.045, 0.41, 0.02), M.sole, [0, 0.022, 0.05]);
    add(leg, rbox(0.12, 0.03, 0.02, 0.01), M.accent, [0, 0.12, 0.245]);
    add(leg, ring(0.118, 0.02), M.metal, [0, 0.19, 0], [Math.PI / 2, 0, 0]);
    add(leg, capsule(0.112, 0.26), M.suit, [0, 0.38, 0]);
    add(leg, ring(0.118, 0.02), M.panel, [0, 0.56, 0.005], [Math.PI / 2, 0, 0]);
    add(leg, sphere(0.085), M.suitShade, [0, 0.565, 0.085], [0, 0, 0], [1, 0.9, 0.6]); // наколінник
    add(leg, capsule(0.128, 0.24), M.suit, [0, 0.79, 0]);
    add(leg, rbox(0.11, 0.13, 0.04, 0.015), M.panel, [s * 0.11, 0.8, 0.03], [0, s * 0.6, 0]); // кишеня
  });
  // ---- таз, пояс, торс ----
  add(model, sphere(1), M.suitShade, [0, 1.0, 0], [0, 0, 0], [0.31, 0.16, 0.22]);
  add(model, ring(0.3, 0.035), M.panel, [0, 1.06, 0], [Math.PI / 2, 0, 0], [1, 0.74, 1]);
  add(model, rbox(0.1, 0.07, 0.03, 0.012), M.metal, [0, 1.06, 0.225]);
  const torsoProfile = [
    [0.0, 0], [0.26, 0], [0.3, 0.06], [0.31, 0.2], [0.33, 0.36], [0.35, 0.48], [0.33, 0.56], [0.24, 0.62], [0.0, 0.63],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torso = add(model, new THREE.LatheGeometry(torsoProfile, 72), M.suit, [0, 1.05, 0], [0, 0, 0], [1, 1, 0.74]);
  // нагрудна панель керування
  const chest = new THREE.Group();
  chest.position.set(0, 1.36, 0.245);
  model.add(chest);
  add(chest, rbox(0.34, 0.22, 0.07, 0.025), M.panel);
  const screen = add(chest, rbox(0.17, 0.08, 0.02, 0.008), M.screen, [-0.055, 0.04, 0.038]);
  [0.06, 0.1, 0.14].forEach((x, i) =>
    add(chest, cyl(0.016, 0.016, 0.02, 24), [M.accent, M.orange, M.metal][i], [x - 0.02, 0.045, 0.04], [Math.PI / 2, 0, 0]),
  );
  for (let i = 0; i < 4; i++) add(chest, rbox(0.05, 0.018, 0.012, 0.004), M.dark, [-0.11 + i * 0.065, -0.05, 0.037]);
  add(chest, cyl(0.03, 0.03, 0.03, 32), M.metal, [0.11, -0.045, 0.04], [Math.PI / 2, 0, 0]); // регулятор
  // шийне кільце
  add(model, ring(0.205, 0.04), M.metal, [0, 1.69, 0], [Math.PI / 2, 0, 0]);
  add(model, cyl(0.2, 0.24, 0.07, 64), M.panel, [0, 1.655, 0]);
  // ---- ранець життєзабезпечення ----
  const pack = new THREE.Group();
  pack.position.set(0, 1.37, -0.33);
  model.add(pack);
  add(pack, rbox(0.56, 0.66, 0.24, 0.06), M.suitShade);
  add(pack, rbox(0.46, 0.5, 0.03, 0.02), M.panel, [0, 0.02, -0.125]);
  for (let i = 0; i < 5; i++) add(pack, rbox(0.34, 0.018, 0.012, 0.005), M.dark, [0, -0.14 + i * 0.06, -0.142]);
  [-1, 1].forEach((s) => {
    add(pack, cyl(0.06, 0.06, 0.5, 40), M.metal, [s * 0.25, 0.04, -0.02]);
    add(pack, sphere(0.06), M.metal, [s * 0.25, 0.29, -0.02]);
    add(pack, cyl(0.02, 0.02, 0.06), M.orange, [s * 0.25, 0.33, -0.02]);
  });
  add(pack, cyl(0.008, 0.008, 0.28, 12), M.metal, [0.17, 0.46, 0.0]); // антена
  const beacon = add(pack, sphere(0.022, 20, 14), M.accent, [0.17, 0.6, 0.0]);
  // шланги від ранця до панелі
  [-1, 1].forEach((s) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.27, 1.2, -0.25),
      new THREE.Vector3(s * 0.31, 1.12, 0.0),
      new THREE.Vector3(s * 0.26, 1.2, 0.24),
      new THREE.Vector3(s * 0.17, 1.3, 0.29),
    ]);
    add(model, new THREE.TubeGeometry(curve, 48, 0.022, 16, false), s < 0 ? M.panel : M.accent);
    add(model, cyl(0.032, 0.032, 0.04, 24), M.metal, [s * 0.17, 1.3, 0.29], [0, 0, Math.PI / 2]);
  });

  // ---- руки ----
  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.37, 1.56, 0);
    model.add(shoulder);
    add(shoulder, sphere(0.14), M.suit, [0, 0, 0]);
    add(shoulder, rbox(0.09, 0.09, 0.02, 0.01), M.accent, [s * 0.1, -0.02, 0.06], [0, s * 1.1, 0]); // нашивка
    const upper = new THREE.Group();
    upper.rotation.z = s * 0.2;
    shoulder.add(upper);
    add(upper, capsule(0.1, 0.22), M.suit, [0, -0.2, 0]);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.4, 0);
    upper.add(elbow);
    add(elbow, ring(0.097, 0.019), M.panel, [0, 0.005, 0], [Math.PI / 2, 0, 0]);
    add(elbow, capsule(0.092, 0.2), M.suit, [0, -0.17, 0]);
    add(elbow, ring(0.09, 0.018), M.accent, [0, -0.33, 0], [Math.PI / 2, 0, 0]);
    const hand = new THREE.Group();
    hand.position.set(0, -0.42, 0);
    elbow.add(hand);
    add(hand, rbox(0.12, 0.13, 0.08, 0.035), M.suitShade, [0, 0, 0]);
    add(hand, rbox(0.11, 0.07, 0.07, 0.03), M.suitShade, [0, -0.09, 0.01]);
    add(hand, capsule(0.026, 0.05), M.suitShade, [-s * 0.07, -0.02, 0.03], [0, 0, -s * 0.5]);
    return { shoulder, upper, elbow, hand, s };
  });

  // ---- шолом і обличчя ----
  const head = new THREE.Group();
  head.position.set(0, 1.99, 0);
  model.add(head);
  const R = 0.37;
  const opening = new THREE.Vector3(0, 0.06, 1).normalize();
  const COS = Math.cos(THREE.MathUtils.degToRad(52));
  // Ділимо сферу на оболонку й візор за кутом до напрямку «вперед».
  function splitSphere(radius, keepFront) {
    const g = new THREE.SphereGeometry(radius, 96, 72).toNonIndexed();
    const pos = g.attributes.position,
      nrm = g.attributes.normal,
      uv = g.attributes.uv;
    const P = [],
      N = [],
      U = [];
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
      c.normalize();
      if (c.dot(opening) > COS === keepFront)
        for (let k = 0; k < 3; k++) {
          P.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
          N.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k));
          U.push(uv.getX(i + k), uv.getY(i + k));
        }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    return out;
  }
  const shellMat = M.suit.clone();
  shellMat.side = THREE.DoubleSide;
  add(head, splitSphere(R, false), shellMat);
  add(head, sphere(R - 0.015, 64, 48), M.padding);
  const visor = add(head, splitSphere(R + 0.006, true), M.glass);
  visor.renderOrder = 2;
  const rimR = R * Math.sin(Math.acos(COS));
  const rimRing = add(head, ring(rimR, 0.026), M.gold);
  rimRing.position.copy(opening.clone().multiplyScalar(R * COS));
  rimRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), opening);
  [-1, 1].forEach((s) => {
    add(head, cyl(0.075, 0.075, 0.05, 40), M.panel, [s * (R - 0.005), -0.01, 0], [0, 0, Math.PI / 2]);
    add(head, cyl(0.045, 0.045, 0.054, 40), M.accent, [s * (R + 0.002), -0.01, 0], [0, 0, Math.PI / 2]);
  });
  add(head, rbox(0.1, 0.05, 0.07, 0.015), M.panel, [0.2, 0.27, 0.1], [0.3, 0.5, -0.4]); // ліхтар
  const lamp = add(head, cyl(0.018, 0.018, 0.012, 20), M.screen, [0.215, 0.275, 0.14], [Math.PI / 2 - 0.3, 0.5, 0]);

  const face = new THREE.Group();
  face.position.set(0, -0.02, 0.03);
  head.add(face);
  add(face, sphere(0.235, 64, 48), M.skin, [0, 0, 0], [0, 0, 0], [1, 1.08, 0.98]);
  // волосся: шапочка зверху й ззаду
  add(face, new THREE.SphereGeometry(0.245, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.42), M.hair, [0, 0.03, -0.015], [-0.35, 0, 0]);
  add(face, sphere(0.06, 24, 16), M.hair, [-0.09, 0.19, 0.12], [0, 0, 0.6], [1.4, 0.55, 0.9]);
  // вуха
  [-1, 1].forEach((s) => add(face, sphere(0.04, 20, 14), M.skin, [s * 0.232, -0.01, 0], [0, 0, 0], [0.5, 1, 0.7]));
  const eyes = [-1, 1].map((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.083, 0.035, 0.205);
    face.add(eye);
    add(eye, sphere(0.04, 32, 24), M.eye, [0, 0, 0], [0, 0, 0], [1, 1.12, 0.6]);
    add(eye, sphere(0.024, 24, 16), M.iris, [0, -0.002, 0.018], [0, 0, 0], [1, 1, 0.5]);
    add(eye, sphere(0.012, 16, 12), M.pupil, [0, -0.002, 0.028], [0, 0, 0], [1, 1, 0.4]);
    add(eye, sphere(0.006, 10, 8), M.glint, [s * -0.008, 0.01, 0.032]);
    add(face, capsule(0.008, 0.05), M.hair, [s * 0.085, 0.105, 0.2], [0, 0, Math.PI / 2 + s * 0.12]); // брова
    return eye;
  });
  add(face, sphere(0.032, 24, 16), M.skin, [0, -0.035, 0.24], [0, 0, 0], [0.9, 1.1, 1]); // ніс
  [-1, 1].forEach((s) => add(face, new THREE.CircleGeometry(0.035, 24), M.blush, [s * 0.13, -0.055, 0.206], [0, s * 0.55, 0]));
  const mouth = add(face, sphere(0.05, 32, 16), M.lip, [0, -0.115, 0.2], [0.15, 0, 0], [1, 0.22, 0.45]);

  // ---- платформа ----
  const base = new THREE.Group();
  scene.add(base);
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(140,234,201,0.55)");
    grad.addColorStop(0.55, "rgba(60,150,140,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = add(base, new THREE.CircleGeometry(0.95, 64), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }), [0, 0.002, 0], [-Math.PI / 2, 0, 0]);
  const ringA = add(base, ring(0.72, 0.012), M.accent, [0, 0.004, 0], [Math.PI / 2, 0, 0]);
  add(base, ring(0.56, 0.005), M.accent, [0, 0.004, 0], [Math.PI / 2, 0, 0]);

  // ---- розмір і анімація ----
  function resize() {
    const bounds = canvas.parentElement.getBoundingClientRect();
    if (bounds.width && bounds.height) {
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      // вузьке полотно: відсуваємо камеру, щоб астронавт поміщався повністю
      camera.fov = camera.aspect < 0.7 ? 36 : 30;
      camera.updateProjectionMatrix();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let blinkAt = performance.now() + 2500;
  let speech = 0;
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const now = performance.now();
    const t = now * 0.001;
    const level = Math.max(0, Math.min(1, Number(getLevel()) || 0));
    speech += ((level > 0.02 ? 1 : 0) - speech) * 0.06;
    if (!reduced) {
      if (!controls.autoRotate && now - idleSince > 6000) controls.autoRotate = true;
      model.position.y = Math.sin(t * 1.4) * 0.018;
      torso.scale.x = 1 + Math.sin(t * 1.4) * 0.008;
      head.rotation.y = Math.sin(t * 0.45) * 0.12;
      head.rotation.x = Math.sin(t * 0.7) * 0.03 - 0.02;
      head.rotation.z = Math.sin(t * 0.8) * 0.02;
      // ліва рука розслаблена, права махає/жестикулює під час мовлення
      arms[0].shoulder.rotation.z = -0.05 + Math.sin(t * 1.4) * 0.02;
      arms[0].elbow.rotation.x = -0.25;
      const wave = speech * (0.5 + 0.5 * Math.sin(t * 4.2));
      arms[1].shoulder.rotation.z = 0.05 + speech * 1.9 - Math.sin(t * 1.4) * 0.02;
      arms[1].shoulder.rotation.x = -speech * 0.25;
      arms[1].elbow.rotation.z = speech * (0.9 + wave * 0.5);
      arms[1].elbow.rotation.x = -0.25 * (1 - speech);
      beacon.material.emissiveIntensity = 0.3 + (Math.sin(t * 3) > 0.6 ? 1.2 : 0);
      ringA.scale.setScalar(1 + Math.sin(t * 2) * 0.02);
      glow.material.opacity = 0.75 + Math.sin(t * 2) * 0.2 + level * 0.3;
    }
    screen.material.emissiveIntensity = 0.7 + level * 0.9;
    lamp.material.emissiveIntensity = 0.7 + level * 0.9;
    if (now > blinkAt) {
      const k = (now - blinkAt) / 140;
      const s = k < 1 ? 1 - Math.sin(k * Math.PI) * 0.92 : 1;
      eyes.forEach((e) => (e.scale.y = s));
      if (k >= 1) blinkAt = now + 2500 + Math.random() * 3500;
    }
    mouth.scale.y = 0.22 + level * 0.75;
    mouth.scale.x = 1 - level * 0.18;
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    controls.dispose();
    const geometries = new Set(),
      materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    glowTex.dispose();
    envTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
