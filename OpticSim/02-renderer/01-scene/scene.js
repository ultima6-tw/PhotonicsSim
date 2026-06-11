// Three.js Scene Setup
// Exports: { scene, camera, renderer, controls, animate, addToScene, setSystemLength }
//
// Coordinate convention (matches physics engine):
//   +Z  = optical axis (beam travels in +Z direction)
//   +Y  = vertical (up)
//   +X  = horizontal
//
// Three.js default is right-handed with +Y up, which matches.
// Physics z-axis maps directly to Three.js z-axis.

function createScene(container) {
  const THREE    = window.THREE;
  const OrbitControls = window.THREE_OrbitControls;

  // ── Renderer ────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0d1117, 1);
  container.appendChild(renderer.domElement);

  // ── Scene ───────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();

  // ── Camera ──────────────────────────────────────────────────────────────────
  // Start with a side view: camera at (x>0, y>0, z=midZ), looking at midZ on axis
  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.001,
    100
  );
  camera.position.set(0.05, 0.04, 0.65);  // will be repositioned by setSystemLength
  camera.up.set(0, 1, 0);

  // ── OrbitControls ───────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance   = 0.005;
  controls.maxDistance   = 10;
  controls.target.set(0, 0, 0.65);        // will be updated by setSystemLength

  // ── Lighting ────────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0.1, 0.3, 0.5);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x7ec8e3, 0.3);
  rimLight.position.set(-0.2, -0.1, -0.5);
  scene.add(rimLight);

  // ── Optical axis line (dashed appearance via thin cylinder) ─────────────────
  const axisGroup = new THREE.Group();
  scene.add(axisGroup);

  function buildAxis(length) {
    axisGroup.clear();
    const mat  = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.6 });
    const pts  = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length)];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    axisGroup.add(new THREE.Line(geom, mat));

    // Small tick marks every 10 cm
    const tickMat = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.4 });
    const tickSize = Math.min(0.002, length * 0.008);
    for (let z = 0; z <= length + 1e-9; z += 0.1) {
      const z_ = Math.min(z, length);
      const tPts = [new THREE.Vector3(-tickSize, 0, z_), new THREE.Vector3(tickSize, 0, z_)];
      const tGeom = new THREE.BufferGeometry().setFromPoints(tPts);
      axisGroup.add(new THREE.Line(tGeom, tickMat));
    }
  }

  // ── Resize handler ───────────────────────────────────────────────────────────
  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ── Animation loop ───────────────────────────────────────────────────────────
  let _animFrameId = null;
  function animate() {
    _animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  function stopAnimate() {
    if (_animFrameId) cancelAnimationFrame(_animFrameId);
  }

  // ── setSystemLength: reposition camera and axis for a given system length ────
  function setSystemLength(L) {
    buildAxis(L);
    const midZ = L / 2;
    const dist = L * 0.8;
    // Place camera far enough that full z-range [0,L] fits in the 45° FOV.
    // Need perpendicular distance ≥ (L/2) / tan(36.4°) ≈ 0.68L → use 0.76L.
    camera.position.set(dist * 0.75, dist * 0.6, midZ);
    camera.lookAt(0, 0, midZ);
    controls.target.set(0, 0, midZ);
    controls.update();
  }

  // ── addToScene / clearGroup helpers ─────────────────────────────────────────
  function addToScene(object) {
    scene.add(object);
  }

  function makeGroup() {
    const g = new THREE.Group();
    scene.add(g);
    return g;
  }

  return {
    scene, camera, renderer, controls,
    animate, stopAnimate,
    addToScene, makeGroup,
    setSystemLength,
    THREE,
  };
}
