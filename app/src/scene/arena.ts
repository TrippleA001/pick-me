/**
 * The arena: renderer, camera, lights, the board itself, and the frame loop.
 *
 * Deliberately separate from the game. The arena knows how to be a stage and
 * nothing about tiles, words or rules; the table puts pieces on it and the
 * controller drives the whole thing.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CLOTHS, type Fabric } from "./cloth";

export const BOARD_W = 30;
export const BOARD_D = 13;

export interface Arena {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Everything that shakes lives here, so the camera stays under OrbitControls. */
  world: THREE.Group;
  /** Add tiles to this. It is shaken with the board. */
  board: THREE.Group;
  impactLight: THREE.PointLight;
  shockwave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  cloths: Record<Fabric, THREE.CanvasTexture>;
  readonly fabric: Fabric;
  setFabric(fabric: Fabric): void;
  setShake(value: number): void;
  /** Freeze the simulation. Used when the tab is hidden; the frame still draws. */
  setPaused(value: boolean): void;
  onFrame(callback: (dt: number) => void): void;
  /** Fires on a tap (not a drag), with the pieces under the pointer, nearest first. */
  onTap(callback: (hits: THREE.Object3D[]) => void): void;
}

export function createArena(mount: HTMLElement): Arena {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  const camHome = new THREE.Vector3(0, 8.9, 13.9);
  camera.position.copy(camHome);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.5, -0.3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 11;
  controls.maxDistance = 19;
  // You can lean in to read a word, but not swing down to the table's underside
  // or round to the side where the board simply ends.
  controls.minPolarAngle = Math.PI * 0.12;
  controls.maxPolarAngle = Math.PI * 0.36;
  controls.minAzimuthAngle = -Math.PI * 0.22;
  controls.maxAzimuthAngle = Math.PI * 0.22;
  controls.update();

  /**
   * A fixed vertical field of view narrows the board badly in portrait, where
   * the rack and both words have to fit side by side. Widen it as the viewport
   * gets taller, so the same amount of table stays in frame.
   */
  const BASE_FOV = 42;
  const MIN_HALF_H = THREE.MathUtils.degToRad(22);
  function applyFov(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const halfV = THREE.MathUtils.degToRad(BASE_FOV / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    camera.fov =
      halfH >= MIN_HALF_H
        ? BASE_FOV
        : Math.min(
            64,
            THREE.MathUtils.radToDeg(
              2 * Math.atan(Math.tan(MIN_HALF_H) / aspect),
            ),
          );
    camera.updateProjectionMatrix();
  }
  applyFov();

  /* --------------------------------------------------------------- lights --- */

  scene.add(new THREE.HemisphereLight("#8fa8c0", "#0b0e11", 0.5));

  const key = new THREE.DirectionalLight("#ffffff", 2.0);
  key.position.set(6, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -15;
  key.shadow.camera.right = 15;
  key.shadow.camera.top = 15;
  key.shadow.camera.bottom = -15;
  key.shadow.camera.far = 45;
  scene.add(key);

  const rim = new THREE.DirectionalLight("#d8fd71", 1.15);
  rim.position.set(-9, 5.5, -11);
  scene.add(rim);

  const fill = new THREE.DirectionalLight("#6ea8ff", 0.55);
  fill.position.set(-7, 5, 13);
  scene.add(fill);

  /** Flashes at the moment of impact, then decays away. */
  const impactLight = new THREE.PointLight("#fff6d0", 0, 26, 2);
  impactLight.position.set(0, 0.9, 0);
  scene.add(impactLight);

  /* ---------------------------------------------------------------- world --- */

  const world = new THREE.Group();
  scene.add(world);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W, 0.7, BOARD_D),
    new THREE.MeshStandardMaterial({ color: "#12171d", roughness: 0.92, metalness: 0.06 }),
  );
  platform.position.y = -0.35;
  platform.receiveShadow = true;
  world.add(platform);

  const clothSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W, BOARD_D),
    new THREE.MeshStandardMaterial({
      map: CLOTHS.ankara,
      roughness: 0.86,
      metalness: 0.02,
      color: "#c8ccd2",
    }),
  );
  clothSurface.rotation.x = -Math.PI / 2;
  clothSurface.position.y = 0.004;
  clothSurface.receiveShadow = true;
  world.add(clothSurface);

  /** The far edge, catching the rim light, so the board has a horizon. */
  const farEdge = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: "#d8fd71", transparent: true, opacity: 0.5 }),
  );
  farEdge.position.set(0, 0.06, -BOARD_D / 2 + 0.06);
  world.add(farEdge);

  const board = new THREE.Group();
  world.add(board);

  /** The expanding ring on the floor when the words meet. */
  const shockwave = new THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>(
    new THREE.RingGeometry(0.55, 0.72, 64),
    new THREE.MeshBasicMaterial({
      color: "#fff6d0",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  shockwave.rotation.x = -Math.PI / 2;
  shockwave.position.y = 0.02;
  world.add(shockwave);

  /* ----------------------------------------------------------------- loop --- */

  let fabric: Fabric = "ankara";
  let shake = 0;
  let paused = false;
  let last = performance.now();
  const frameListeners: Array<(dt: number) => void> = [];

  function frame(): void {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!paused) {
      for (const listener of frameListeners) listener(dt);
    }

    if (shake > 0) {
      world.position.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
      );
    } else {
      world.position.set(0, 0, 0);
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    applyFov();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* --------------------------------------------------------------- picking --- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tapListeners: Array<(hits: THREE.Object3D[]) => void> = [];
  let downAt: { x: number; y: number } | null = null;
  /** A drag on the board is an orbit, so only a near-still release counts as a tap. */
  const TAP_SLOP = 8;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved > TAP_SLOP) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(board.children, true);
    if (hits.length === 0) return;
    for (const listener of tapListeners) listener(hits.map((hit) => hit.object));
  });

  requestAnimationFrame(frame);

  return {
    renderer,
    scene,
    camera,
    controls,
    world,
    board,
    impactLight,
    shockwave,
    cloths: CLOTHS,
    get fabric() {
      return fabric;
    },
    setFabric(next: Fabric) {
      fabric = next;
      clothSurface.material.map = CLOTHS[next];
      clothSurface.material.needsUpdate = true;
    },
    setShake(value: number) {
      shake = value;
    },
    setPaused(value: boolean) {
      paused = value;
    },
    onFrame(callback: (dt: number) => void) {
      frameListeners.push(callback);
    },
    onTap(callback: (hits: THREE.Object3D[]) => void) {
      tapListeners.push(callback);
    },
  };
}
