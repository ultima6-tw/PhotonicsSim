// Element Drag Along Z-axis
// Depends on: Three.js (window.THREE)
//
// createElementDragger(renderer, camera, controls, onDragZ)
//   onDragZ(opticIndex, newZ, isDragging)
//     isDragging=true  → live drag  (move mesh for visual preview, no physics)
//     isDragging=false → drag ended (commit: update element list + recompute beam)
//
// Returns: { setGroups(groups), destroy() }
//   setGroups([ {group: THREE.Group, opticIndex: number}, ... ])
//     Call after every renderBeam() because new meshes are built each time.
//   destroy()
//     Remove all event listeners (call when tearing down the app).
//
// Drag mechanics:
//   Click element → project onto y=0 plane → track z as mouse moves.
//   OrbitControls disabled during drag, cursor = 'ew-resize'.
//   Hover (no drag): cursor = 'grab' when over any element mesh.

function createElementDragger(renderer, camera, controls, onDragZ) {
  const THREE  = window.THREE;
  const canvas = renderer.domElement;

  let groups = [];   // [{group, opticIndex, meshes:[]}]
  let active = null; // {opticIndex, originZ, offsetZ} during drag

  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();
  const hitPt     = new THREE.Vector3();
  const dragPlane = new THREE.Plane();
  const _up       = new THREE.Vector3(0, 1, 0);

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _meshes(group) {
    const out = [];
    group.traverse(o => { if (o.isMesh) out.push(o); });
    return out;
  }

  function _ndc(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x:  ((e.clientX - r.left) / r.width)  * 2 - 1,
      y: -((e.clientY - r.top)  / r.height) * 2 + 1,
    };
  }

  // Project NDC mouse position onto dragPlane; returns z coordinate or null.
  function _zAt(ndcX, ndcY) {
    mouse.set(ndcX, ndcY);
    raycaster.setFromCamera(mouse, camera);
    return raycaster.ray.intersectPlane(dragPlane, hitPt) ? hitPt.z : null;
  }

  function _hitGroup(ndcX, ndcY) {
    mouse.set(ndcX, ndcY);
    raycaster.setFromCamera(mouse, camera);
    const allMeshes = groups.flatMap(g => g.meshes);
    const hits = raycaster.intersectObjects(allMeshes, false);
    if (!hits.length) return null;
    return groups.find(g => g.meshes.includes(hits[0].object)) || null;
  }

  // ── Pointer event handlers ────────────────────────────────────────────────

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const { x, y } = _ndc(e);
    const hg = _hitGroup(x, y);
    if (!hg) return;

    // Drag plane passes through element center, normal = world +Y.
    // Since all elements sit at y=0 this is effectively the y=0 plane,
    // but using the actual position handles future off-axis elements.
    dragPlane.setFromNormalAndCoplanarPoint(_up, hg.group.position);

    const z = _zAt(x, y);
    if (z === null) return;

    active = {
      opticIndex: hg.opticIndex,
      originZ:    hg.group.position.z,
      offsetZ:    z - hg.group.position.z,  // cursor offset within element
    };

    controls.enabled = false;
    canvas.style.cursor = 'ew-resize';
    e.stopPropagation();
  }

  function onPointerMove(e) {
    const { x, y } = _ndc(e);

    if (!active) {
      // Hover: show grab cursor when over any element mesh
      canvas.style.cursor = _hitGroup(x, y) ? 'grab' : '';
      return;
    }

    const z = _zAt(x, y);
    if (z === null) return;
    onDragZ(active.opticIndex, z - active.offsetZ, true);
  }

  function onPointerUp(e) {
    if (!active) return;
    const { x, y } = _ndc(e);
    const z = _zAt(x, y);
    const newZ = (z !== null) ? z - active.offsetZ : active.originZ;

    onDragZ(active.opticIndex, newZ, false);

    active = null;
    controls.enabled = true;
    canvas.style.cursor = '';
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);

  // ── Public API ────────────────────────────────────────────────────────────

  function setGroups(newGroups) {
    groups = newGroups.map(g => ({
      group:      g.group,
      opticIndex: g.opticIndex,
      meshes:     _meshes(g.group),
    }));
  }

  function destroy() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
  }

  return { setGroups, destroy };
}

if (typeof module !== 'undefined') module.exports = { createElementDragger };
