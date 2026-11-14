import * as THREE from "three";
export function createAvatar(canvas, isSpeaking) {
  let frame = 0,
    disposed = false;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 1.6, 5.3);
  camera.lookAt(0, 1.2, 0);
  scene.add(new THREE.HemisphereLight(0xe6f9ff, 0x28354e, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-3, 5, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0x80fbd6, 3);
  rim.position.set(3, 2, -2);
  scene.add(rim);
  const model = new THREE.Group();
  scene.add(model);
  const suit = new THREE.MeshStandardMaterial({
    color: 0xd5e4e9,
    roughness: 0.55,
    metalness: 0.15,
  });
  const joint = new THREE.MeshStandardMaterial({
    color: 0x183a48,
    roughness: 0.7,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xe5ab87,
    roughness: 0.8,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x17272d,
    roughness: 0.6,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x79e8c4,
    emissive: 0x1b7257,
    emissiveIntensity: 0.4,
  });
  function sphere(parent, material, position, scale) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }
  function box(parent, material, position, scale) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...scale), material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }
  // Articulated astronaut, with a visible human face and animated mouth.
  sphere(model, suit, [0, 1.12, 0], [0.38, 0.53, 0.26]);
  box(model, joint, [0, 1.25, 0.245], [0.36, 0.28, 0.07]);
  box(model, accent, [0, 1.28, 0.29], [0.23, 0.06, 0.025]);
  box(model, suit, [0, 1.18, -0.28], [0.47, 0.6, 0.2]);
  sphere(model, joint, [0, 0.68, 0], [0.32, 0.14, 0.24]);
  [-1, 1].forEach((side) => {
    sphere(model, suit, [side * 0.19, 0.38, 0], [0.16, 0.35, 0.18]);
    sphere(model, joint, [side * 0.19, 0.19, 0.02], [0.16, 0.08, 0.18]);
    sphere(model, suit, [side * 0.19, 0.08, 0.08], [0.18, 0.12, 0.27]);
  });
  const head = new THREE.Group();
  head.position.set(0, 1.95, 0);
  model.add(head);
  sphere(head, suit, [0, 0, -0.02], [0.49, 0.52, 0.43]);
  sphere(head, joint, [0, -0.03, 0.245], [0.4, 0.42, 0.16]);
  sphere(head, skin, [0, -0.015, 0.35], [0.3, 0.35, 0.2]);
  sphere(head, dark, [0, 0.23, 0.31], [0.3, 0.14, 0.18]);
  [-1, 1].forEach((side) => {
    sphere(head, suit, [side * 0.46, -0.01, 0], [0.09, 0.17, 0.15]);
    sphere(head, accent, [side * 0.495, 0, 0.04], [0.025, 0.06, 0.08]);
    sphere(head, dark, [side * 0.11, 0.02, 0.535], [0.032, 0.043, 0.02]);
    sphere(head, suit, [side * 0.1, 0.035, 0.55], [0.009, 0.013, 0.008]);
  });
  sphere(head, skin, [0, -0.06, 0.55], [0.047, 0.07, 0.052]);
  const mouth = sphere(
    head,
    new THREE.MeshStandardMaterial({ color: 0x753f3c }),
    [0, -0.18, 0.525],
    [0.074, 0.014, 0.015],
  );
  const arms = [-1, 1].map((side) => {
    const group = new THREE.Group();
    group.position.set(side * 0.4, 1.42, 0);
    model.add(group);
    group.rotation.z = side * 0.18;
    sphere(group, suit, [side * 0.05, -0.24, 0], [0.145, 0.3, 0.16]);
    sphere(group, joint, [side * 0.06, -0.49, 0.01], [0.13, 0.08, 0.14]);
    sphere(group, suit, [side * 0.06, -0.65, 0.05], [0.12, 0.2, 0.14]);
    sphere(group, joint, [side * 0.06, -0.83, 0.09], [0.13, 0.13, 0.14]);
    return group;
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.65, 0.015, 12, 80),
    accent,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.06;
  model.add(ring);
  function resize() {
    const bounds = canvas.parentElement.getBoundingClientRect();
    if (bounds.width && bounds.height) {
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    model.rotation.y = Math.sin(t * 0.5) * 0.12;
    if (!reduced) {
      model.position.y = Math.sin(t * 1.5) * 0.025;
      head.rotation.z = Math.sin(t * 0.8) * 0.025;
      arms[1].rotation.z = 0.18 + (isSpeaking() ? Math.sin(t * 3) * 0.18 : 0);
    }
    mouth.scale.y = isSpeaking()
      ? 0.018 + Math.abs(Math.sin(t * 13)) * 0.06
      : 0.014;
    renderer.render(scene, camera);
  }
  animate();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    const geometries = new Set(),
      materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    renderer.dispose();
  };
}
