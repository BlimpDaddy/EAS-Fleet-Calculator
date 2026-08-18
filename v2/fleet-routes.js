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
import { ROUTE_CITIES, ROUTE_PAIRS as ROUTE_DIRECT, ROUTE_GATES, ROUTE_GATED } from '/v2/route-data.js?v=1.9';

/* SEA GATES (v4, 2026-08-18): the direct pairs and the gated ones are one
 * pool, re-sorted by km because nextPair() reads ROUTE_PAIRS[0] and
 * [length-1] as the range ends. A gated entry carries a 4th element — the
 * waypoint chain — and is otherwise identical, so everything downstream
 * (distance matching, the debt steering, recent-pair memory) is unchanged. */
const ROUTE_PAIRS = [...ROUTE_DIRECT, ...ROUTE_GATED].sort((a, b) => a[2] - b[2]);

const BERRY = 0xC628A5;
const CYCLE_MS = 2000;          // Toby 2026-08-17: 2s to savour each trip ("might even go 3")
const SPIN_MS = 450;            // the flick — quick, like spinning a real globe
let spin = null;                // active flick: {from, to, start, dur}

const v1Canvas = document.querySelector('.fleet-distance-canvas');
const figure = v1Canvas && v1Canvas.closest('.fleet-graph-container');
if (v1Canvas && figure) {
  v1Canvas.style.display = 'none'; // V1 keeps computing; picture is ours

  const canvas = document.createElement('canvas');
  canvas.className = 'fleet-distance-canvas fleet-routes-canvas'; // inherit V1's sizing CSS
  figure.appendChild(canvas);

  // CAPTION (Toby 2026-08-18): the figure stopped being a distance readout
  // the moment it became a route tour — it shows real city pairs now, and
  // the slider directly above it already carries the words "Average Trip
  // Distance". Retitled here rather than in the bundle (V1 untouched); the
  // SLIDER keeps its own label, which is the one that still means distance.
  const caption = figure.querySelector('.fleet-graph-caption');
  if (caption) caption.textContent = 'Example Routes';

  /* TRIP-DISTANCE SLIDER TOP: 12,000 -> 13,000 km (Toby 2026-08-18, after
   * the route ceiling went to 14,900). V1's bundle maps this control as
   * km = 1000 + 110 * view over a default 0-100 range, so 100 was 12,000.
   * The MAPPING is the bundle's and is untouched; only the input's own
   * max/step are widened here, which is why the top lands on exactly
   * 13,000 (view 12000/110) and each notch is a round 100 km (step
   * 100/110) — finer than V1's 110 km and on whole hundreds, verified
   * reading "13000" at the top with no float dust. WISH_MAX in the picker
   * is deliberately NOT raised: simulated at the new top the mean still
   * lands on 12,997 either way, so the debt steering already covers it.
   *
   * MEASURED GOTCHA: the bundle's own control render runs AFTER this
   * module and CLEARS the step attribute (it leaves max alone, which is
   * why max stuck on the first attempt while the slider still topped out
   * at 12,990 = view 109 under the default step of 1). Re-asserted a
   * macrotask later — the same ownership pattern dynamic-page.js already
   * uses to re-declare airspeed after the bundle's preset button. */
  const distSlider = document.querySelector('[data-fleet="averagedistance"]');
  if (distSlider) {
    const widen = () => {
      distSlider.max = String(12000 / 110);
      distSlider.step = String(100 / 110);
    };
    widen();
    setTimeout(widen, 0);
  }

  // Pause button (Toby 2026-08-17) — same look as the SHAPE page's ⏸
  // (V1's .shape-viewer-button class reused so the styling is
  // literally the same button). Pausing holds the current trip;
  // any in-flight flick finishes; ▶ resumes the 2s cycle.
  let paused = false;
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'shape-viewer-button fleet-globe-pause';
  pauseBtn.textContent = '⏸';
  pauseBtn.title = 'Pause the route tour';
  const btnStyle = document.createElement('style');
  // Same square as page 1's button: 48x51 at bottom:16/right:16
  // (measured off the live SHAPE page; the bare class stretched to the
  // figure's full height here — explicit box pins it).
  btnStyle.textContent = '.fleet-graph-container { position: relative; } .fleet-globe-pause { position: absolute; top: auto; bottom: 16px; right: 16px; width: 48px; height: 51px; z-index: 5; }';
  document.head.appendChild(btnStyle);
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Resume the route tour' : 'Pause the route tour';
  });
  figure.appendChild(pauseBtn);

  // ---- replica scene (constants from the bundle, see header) ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setClearColor(0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.minDistance = 2;
  controls.maxDistance = 6;
  controls.enablePan = false;
  // z=2.7, closer than V1's 3 (Toby 2026-08-17: globe edges near the
  // frame) — arcs to 1.5R still clear the top at this distance.
  camera.position.set(0, 0, 2.7);

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
    ctx.font = '700 58px Arial, sans-serif'; // bumped 44→58 (Toby: hard to see)
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
      sprite.scale.set(0.64, 0.08, 1); // V1's .512×.064 grown 25% (Toby: labels hard to see)
      sprite.position.copy(v).multiplyScalar(1.2 / 1.02);
      routeGroup.add(sprite);
    }
    const a = toVec(ROUTE_CITIES[ia][1], ROUTE_CITIES[ia][2], 1.02);
    const b = toVec(ROUTE_CITIES[ib][1], ROUTE_CITIES[ib][2], 1.02);
    // A DIRECT pair keeps V1's exact curve — same QuadraticBezierCurve3,
    // same 1.5R midpoint, same 100 points, byte-for-byte the old picture.
    // A GATED pair (4th element) instead follows its waypoint chain along
    // the surface and then gets the SAME lift profile applied, so the
    // silhouette matches: up to 1.5R at mid-route, back down at both ends.
    let pts;
    if (pair[3] && pair[3].length) {
      const chain = [a, ...pair[3].map((k) => toVec(ROUTE_GATES[k][1], ROUTE_GATES[k][2], 1.02)), b];
      const ground = [];
      for (let s = 0; s < chain.length - 1; s++) {
        const p = chain[s], q = chain[s + 1];
        const om = Math.acos(Math.min(1, Math.max(-1, p.clone().normalize().dot(q.clone().normalize()))));
        const steps = Math.max(2, Math.round(100 * (om / Math.PI)) + 8);
        for (let i = 0; i < steps; i++) {
          // slerp along the great circle of THIS leg (a straight lerp would
          // cut through the sphere and read as a chord, not a track)
          const t = i / steps;
          const v = om < 1e-6
            ? p.clone()
            : p.clone().multiplyScalar(Math.sin((1 - t) * om) / Math.sin(om))
               .add(q.clone().multiplyScalar(Math.sin(t * om) / Math.sin(om)));
          ground.push(v);
        }
      }
      ground.push(b.clone());
      /* ARC HEIGHT (Toby 2026-08-18: "extending too high from the surface").
       * A quadratic Bezier NEVER REACHES ITS CONTROL POINT, so V1's 1.5R
       * midpoint is not the height its arcs actually fly: measured, they
       * apex at 1.258R for a short hop, falling to 1.02R (hugging the ball)
       * once the endpoints pass ~120 deg apart. Lifting a gated route to a
       * literal 1.5R therefore drew it 1.19x-1.47x too tall — worst exactly
       * where the gated routes live, the long ones. The closed form below
       * reproduces V1's own apex from the ENDPOINT separation, so a gated
       * route now stands exactly as tall as a direct route between the same
       * two ports, which is the consistency that was wanted all along.
       *   apex = 0.75 + 0.5*1.02*cos(theta/2), floored at the 1.02 surface
       * (matches the measured Bezier to 3dp; see the numeric sweep). */
      const sep = Math.acos(Math.min(1, Math.max(-1, a.clone().normalize().dot(b.clone().normalize()))));
      const apex = Math.max(1.02, 0.75 + 0.5 * 1.02 * Math.cos(sep / 2));
      pts = ground.map((v, i) => {
        const t = i / (ground.length - 1);
        return v.clone().normalize().multiplyScalar(1.02 + (apex - 1.02) * Math.sin(Math.PI * t));
      });
    } else {
      const mid = a.clone().add(b).normalize().multiplyScalar(1.5);
      pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(100);
    }
    const pos = [];
    for (const p of pts) pos.push(p.x, p.y, p.z);
    const geo = new LineGeometry();
    geo.setPositions(pos);
    routeGroup.add(new Line2(geo, lineMat));
    globe.add(routeGroup);
    // SNAP-TO-TRIP (Toby, 2026-08-17: the ambient rotation could leave
    // a route on the far side for its whole second): each new pair
    // FLICKS the globe east or west — shortest way, eased, ~0.45s,
    // like spinning a real globe — so the route faces the camera for
    // most of its second; ambient rotation resumes after the flick.
    // Math: a local vector m faces azimuth α when rotation.y lands at
    // α − atan2(m.x, m.z); α is the CAMERA's current azimuth so the
    // flick honours any drag-orbit the user has done (α = 0 at the
    // default view). Take the route's midpoint for m.
    const m = a.clone().add(b).normalize();
    const targetY = Math.atan2(camera.position.x, camera.position.z) - Math.atan2(m.x, m.z);
    const from = globe.rotation.y;
    const delta = ((targetY - from + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    spin = { from, to: from + delta, start: performance.now(), dur: SPIN_MS };
    // Console handle (verification/probing; no UI):
    window.__fleetRoute = { from: ROUTE_CITIES[ia][0], to: ROUTE_CITIES[ib][0], km: pair[2],
      via: pair[3] ? pair[3].map((k) => ROUTE_GATES[k][0]) : null,
      spinTo: +(from + delta).toFixed(3) };
  };

  // ---- distance-matched cycling ----
  const distOut = document.querySelector('[data-fleet="averagetripdistance-output"]');
  const targetKm = () => {
    const n = Number(String(distOut?.textContent ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 9000;
  };
  /* THE AVERAGING TOUR v2 (Toby re-rulings 2026-08-17; supersedes
   * both the ±8% filter and the target±3,500 spread): every pick
   * draws from the FULL 1,000–12,000 km range — all trip types,
   * always — and the running DEBT correction alone steers the mean
   * onto the slider. The slider changes the FEEL over time: a 3,000
   * average is mostly short hops with the occasional epic crossing;
   * a 12,000 average is the long-haul reel with a few mediums.
   * Tuned by 80-trip simulation (gain 1.0 / cap 12,000: means
   * 3,056 / 8,898 / 11,889 at targets 3/9/12k, full-range variety
   * in all three). Recent-pair memory kills repetition. */
  const WISH_MIN = 1000, WISH_MAX = 12000, DEBT_GAIN = 1.0, DEBT_CAP = 12000;
  /* PORT FAME (v4, Toby 2026-08-18: "the busiest ports on earth should at
   * least show *at all* — although it's v cool to see busy > ultra obscure,
   * that's valuable too"). The weight is applied WITHIN the distance-matched
   * candidate set and never narrows it, so the long tail keeps its airtime;
   * Papeete and Walvis Bay still turn up, just less often than Singapore.
   * FAME_GAIN is the single knob — 0 restores the pre-v4 uniform draw. */
  const FAME_MEGA = new Set(['Shanghai', 'Singapore', 'Shenzhen', 'Busan', 'Hong Kong',
    'Qingdao', 'Tianjin', 'Rotterdam', 'Jebel Ali', 'Port Klang', 'Antwerp', 'Xiamen',
    'Kaohsiung', 'Los Angeles', 'Hamburg', 'New York', 'Yokohama']);
  const FAME_MAJOR = new Set(['Dalian', 'Keelung', 'Manila', 'Ho Chi Minh', 'Laem Chabang',
    'Jakarta', 'Colombo', 'Chennai', 'Mumbai', 'Kolkata', 'Karachi', 'Jeddah', 'Incheon',
    'Kobe', 'Nagoya', 'Alexandria', 'Port Said', 'Durban', 'Cape Town', 'Lagos', 'Santos',
    'Rio de Janeiro', 'Buenos Aires', 'Valparaiso', 'Callao', 'Colon', 'Miami', 'Houston',
    'New Orleans', 'Savannah', 'Charleston', 'Norfolk', 'Oakland', 'Seattle', 'Vancouver',
    'Montreal', 'London Gateway', 'Southampton', 'Le Havre', 'Marseille', 'Barcelona',
    'Valencia', 'Genoa', 'Piraeus', 'Istanbul', 'Bremerhaven', 'Amsterdam', 'Lisbon',
    'Casablanca', 'Sydney', 'Melbourne', 'Auckland', 'Dammam', 'Muscat', 'Bandar Abbas']);
  const FAME_GAIN = 1.0;
  const fame = (i) => {
    const n = ROUTE_CITIES[i][0];
    return FAME_MEGA.has(n) ? 4 : FAME_MAJOR.has(n) ? 2 : 1;
  };
  const weightOf = (p) => (fame(p[0]) * fame(p[1])) ** FAME_GAIN;
  const pickWeighted = (list) => {
    let total = 0;
    for (const p of list) total += weightOf(p);
    let r = Math.random() * total;
    for (const p of list) { r -= weightOf(p); if (r <= 0) return p; }
    return list[list.length - 1];
  };
  let debt = 0, lastTarget = 0;
  const recent = [];
  const nextPair = () => {
    const km = targetKm();
    if (Math.abs(km - lastTarget) > 1) { debt = 0; lastTarget = km; }
    const lo = ROUTE_PAIRS[0][2], hi = ROUTE_PAIRS[ROUTE_PAIRS.length - 1][2];
    const wish = WISH_MIN + Math.random() * (WISH_MAX - WISH_MIN) - DEBT_GAIN * debt;
    const need = Math.min(hi, Math.max(lo, wish));
    let tol = Math.max(250, need * 0.06);
    let c = [];
    while (c.length < 3 && tol < 30000) {
      c = ROUTE_PAIRS.filter((p) => Math.abs(p[2] - need) <= tol && !recent.includes(p));
      tol *= 1.7;
    }
    if (!c.length) c = ROUTE_PAIRS;
    const pick = pickWeighted(c);
    debt = Math.max(-DEBT_CAP, Math.min(DEBT_CAP, debt + (pick[2] - km)));
    recent.push(pick);
    if (recent.length > 8) recent.shift();
    return pick;
  };
  setInterval(() => {
    if (!paused && canvas.clientWidth > 0) showPair(nextPair()); // holds while paused or hidden
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
  // STILL EARTH (Toby final, 2026-08-17: ambient rotation removed —
  // "just have still earth and it spins to catch the trip"): the only
  // globe motion is the eased flick to face each new route; the user
  // can still drag-orbit. V1's +0.0025/frame ambient spin retired.
  renderer.setAnimationLoop(() => {
    resize();
    controls.update();
    if (spin) {
      const t = Math.min(1, (performance.now() - spin.start) / spin.dur);
      const e = 1 - (1 - t) ** 3; // ease-out cubic — fast start, soft landing
      globe.rotation.y = spin.from + (spin.to - spin.from) * e;
      if (t >= 1) spin = null;
    }
    renderer.render(scene, camera);
  });
}
