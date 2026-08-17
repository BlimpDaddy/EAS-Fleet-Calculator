/**
 * ROTATING WORLD-ROUTES GLOBE (Toby idea + go, 2026-08-17): every
 * ~1 s the trip arc re-draws between a NEW ocean-clean city pair
 * whose great-circle distance ≈ the trip-distance slider — the user
 * sees real international crossings at THEIR chosen distance, and
 * the pink line never crosses major landmass (route-data.js carries
 * the mask rules).
 *
 * REPLACEMENT VISUAL, NOT A PATCH: V1's globe hardcodes Sydney/LA
 * inside the bundle, so its canvas is hidden and this replica renders
 * in its place. The bundle is untouched and keeps computing; only the
 * picture is ours (the viewer3d.js precedent — parameter-for-
 * parameter copy of Frazer's renderer). Replica constants read
 * directly from the bundle's globe class (2026-08-17):
 *   sphere(1, 30×20) · material colour 0x888888 × earth.jpg ·
 *   city markers r=0.04 spheres 0xC628A5 at radius 1.02 ·
 *   labels 512×64 sprites, scale .512×.064, at radius 1.2 ·
 *   arc: QuadraticBezierCurve3 (mid = normalize(a+b)×1.5), 100 pts,
 *   fat Line2 linewidth 8, 0xC628A5 ·
 *   rotation +0.0025/frame · camera FOV 50 at z=3 · orbit 2–6, no
 *   pan · transparent clear.
 * Label PNGs (Sydney/LA) are berry #C628A5 text on transparent —
 * generated city labels render canvas textures in the same style.
 *
 * Distance match: pairs within ±8% (floor ±400 km) of the slider's
 * displayed km; the window widens automatically until it holds ≥2
 * pairs. The FULL arc always draws — the pair IS the distance
 * (better than V1's fraction-trim, which needed a fixed route).
 * Cycling pauses while the Fleet page is hidden.
 *
 * REGENERATING route-data.js: run the mask sweep in the browser
 * console against /assets/charts/average-distance-chart/earth.jpg —
 * ocean = blue channel > red+20; 200 samples/arc; skip 3% each end;
 * reject any land run > 2 samples; haversine distances. (The
 * generation script lives in the session record 2026-08-17.)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { ROUTE_CITIES, ROUTE_PAIRS } from '/v2/route-data.js';

const BERRY = 0xC628A5;
const CYCLE_MS = 1000;          // Toby: "every ~1 second"
const TOL_FRAC = 0.08, TOL_MIN = 400; // distance-match window (km)

const v1Canvas = document.querySelector('.fleet-distance-canvas');
const figure = v1Canvas && v1Canvas.closest('.fleet-graph-container');
if (v1Canvas && figure) {
  v1Canvas.style.display = 'none'; // V1 keeps computing; picture is ours

  const canvas = document.createElement('canvas');
  canvas.className = 'fleet-distance-canvas fleet-routes-canvas'; // inherit V1's sizing CSS
  figure.appendChild(canvas);

  // ---- replica scene (constants from the bundle, see header) ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setClearColor(0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 2;
  controls.maxDistance = 6;
  controls.enablePan = false;
  camera.position.set(0, 0, 3);

  const globe = new THREE.Group();
  scene.add(globe);
  const tex = new THREE.TextureLoader().load('/assets/charts/average-distance-chart/earth.jpg', () => resize());
  tex.colorSpace = THREE.SRGBColorSpace;
  globe.add(new THREE.Mesh(
    new THREE.SphereGeometry(1, 30, 20),
    new THREE.MeshBasicMaterial({ color: 0x888888, map: tex })
  ));

  // lat/lon -> vec3, the bundle's own mapping.
  const toVec = (lat, lon, r) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  };

  // City labels: canvas textures in the PNG style (berry on transparent).
  const labelTexture = (name) => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#C628A5';
    ctx.font = '700 44px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), 256, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const markerGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const markerMat = new THREE.MeshBasicMaterial({ color: BERRY });
  const lineMat = new LineMaterial({ color: BERRY, linewidth: 8 });
  let routeGroup = null;

  const showPair = (pair) => {
    if (routeGroup) {
      routeGroup.traverse((o) => { if (o.geometry && o.geometry !== markerGeo) o.geometry.dispose(); if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } });
      globe.remove(routeGroup);
    }
    routeGroup = new THREE.Group();
    const [ia, ib] = pair;
    for (const idx of [ia, ib]) {
      const [name, lat, lon] = ROUTE_CITIES[idx];
      const v = toVec(lat, lon, 1.02);
      const m = new THREE.Mesh(markerGeo, markerMat);
      m.position.copy(v);
      routeGroup.add(m);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name), depthTest: true, transparent: true }));
      sprite.scale.set(0.512, 0.064, 1);
      sprite.position.copy(v).multiplyScalar(1.2 / 1.02);
      routeGroup.add(sprite);
    }
    const a = toVec(ROUTE_CITIES[ia][1], ROUTE_CITIES[ia][2], 1.02);
    const b = toVec(ROUTE_CITIES[ib][1], ROUTE_CITIES[ib][2], 1.02);
    const mid = a.clone().add(b).normalize().multiplyScalar(1.5);
    const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(100);
    const pos = [];
    for (const p of pts) pos.push(p.x, p.y, p.z);
    const geo = new LineGeometry();
    geo.setPositions(pos);
    routeGroup.add(new Line2(geo, lineMat));
    globe.add(routeGroup);
    // Console handle (verification/probing; no UI):
    window.__fleetRoute = { from: ROUTE_CITIES[ia][0], to: ROUTE_CITIES[ib][0], km: pair[2] };
  };

  // ---- distance-matched cycling ----
  const distOut = document.querySelector('[data-fleet="averagetripdistance-output"]');
  const targetKm = () => {
    const n = Number(String(distOut?.textContent ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 9000;
  };
  let deck = [], deckKey = '';
  const candidates = (km) => {
    let tol = Math.max(TOL_MIN, km * TOL_FRAC);
    let c = [];
    while (c.length < 2 && tol < 26000) { // widen until liveable
      c = ROUTE_PAIRS.filter((p) => Math.abs(p[2] - km) <= tol);
      tol *= 2;
    }
    return c.length ? c : ROUTE_PAIRS.slice(-2);
  };
  const nextPair = () => {
    const km = targetKm();
    const key = String(Math.round(km / 100));
    if (key !== deckKey || deck.length === 0) {
      deckKey = key;
      deck = candidates(km).slice();
      for (let i = deck.length - 1; i > 0; i--) { // shuffle
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop();
  };
  setInterval(() => {
    if (canvas.clientWidth > 0) showPair(nextPair()); // paused while hidden
  }, CYCLE_MS);
  showPair(nextPair()); // first route immediately (draws once visible)

  // ---- sizing + loop (the one-shot-observer bug fixed by design:
  // size is checked every frame against the CSS box) ----
  let w = 0, h = 0;
  const resize = () => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === w && ch === h) return;
    w = cw; h = ch;
    if (!cw || !ch) return;
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch, false);
    lineMat.resolution.set(cw, ch);
  };
  renderer.setAnimationLoop(() => {
    resize();
    controls.update();
    globe.rotation.y += 0.0025;
    renderer.render(scene, camera);
  });
}
