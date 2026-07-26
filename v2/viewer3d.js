/**
 * Replica of the V1 wireframe viewer, for shapes that don't ship as .glb files
 * (i.e. uploaded .obj geometry). Construction copied parameter-for-parameter from
 * the V1 bundle's viewer class so the two are visually indistinguishable:
 *
 *   camera   PerspectiveCamera(50, 1, 0.1, 1000), z = 3
 *   controls OrbitControls — minDistance 2, maxDistance 4, no pan (drag spins, wheel zooms)
 *   sphere   WireframeGeometry(SphereGeometry(1, 20, 10)), white @ 25% — static, radius 1
 *   spin     shapesParent.rotation.y += 0.005 (the shape spins; the sphere never does)
 *
 * What is drawn (display only — the measurement pipeline never touches this):
 *   ORANGE  the ORIGINAL uploaded mesh's own edges (fat lines, most visible) — the
 *           true shape as given. Point-cloud .obj files have no mesh, so the hull
 *           edges stand in.
 *   PINK    the convex hull the pipeline actually measured, as a faint translucent
 *           bubble (V1's magenta token) + whisper-thin hull lines. For convex shapes
 *           it hugs the orange; for a chair it floats around it — the visible gap IS
 *           the explanation of a low VE.
 *
 * Everything is normalised by the measured miniball, so the white sphere on screen
 * IS the measuring sphere VE was divided by.
 */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Vector2,
  SphereGeometry, WireframeGeometry, LineBasicMaterial, LineSegments,
  BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide,
  Points, PointsMaterial,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

const ORANGE = 0xff9900;  // V1's accent-2: the true uploaded shape
const MAGENTA = 0xc628a5; // V1's accent-1: the measured convex hull

export class ReplicaViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.isSpinning = true;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.z = 3;

    this.renderer = new WebGLRenderer({ canvas, alpha: true });
    this.renderer.setClearColor(0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 2;
    this.controls.maxDistance = 4;
    this.controls.enablePan = false;

    // Static unit measuring sphere, exactly as V1 builds it.
    const sphere = new LineSegments(
      new WireframeGeometry(new SphereGeometry(1, 20, 10)),
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
    );
    this.scene.add(sphere);

    this.shapesParent = new Group();
    this.scene.add(this.shapesParent);

    // V1 quirk kept on purpose: LineMaterial resolution comes from the WINDOW size,
    // not the canvas — matching it keeps our line thickness identical to his.
    const res = new Vector2(window.innerWidth, window.innerHeight);
    this.materials = {
      mesh: new LineMaterial({ color: ORANGE, linewidth: 1.5, resolution: res.clone() }),
      // Point-cloud files: the true input data drawn as dots (constant pixel size).
      dots: new PointsMaterial({ color: ORANGE, size: 4, sizeAttenuation: false }),
      hullLine: new LineMaterial({
        color: MAGENTA, linewidth: 1, transparent: true, opacity: 0.35,
        resolution: res.clone(), depthWrite: false,
      }),
      hullSkin: new MeshBasicMaterial({
        color: MAGENTA, transparent: true, opacity: 0.10,
        side: DoubleSide, depthWrite: false,
      }),
    };

    this.parts = { mesh: null, hullLine: null, hullSkin: null };
    this._resize = () => this.resize();
    this._running = false;
  }

  /**
   * @param {Float32Array|null} meshSegments  original-mesh edges, pre-normalised flat
   *                                          [ax,ay,az,bx,by,bz,...]; null = point cloud
   * @param {Float32Array|null} meshPoints    for point-cloud files: the original
   *                                          vertices themselves, pre-normalised —
   *                                          drawn as orange dots so orange is ALWAYS
   *                                          the input data, never the hull
   * @param {number[][]} hullPoints  hull vertices (raw)
   * @param {number[][]} hullEdges   [a,b] pairs into hullPoints
   * @param {number[][]} hullFaces   triangles into hullPoints (for the bubble skin)
   * @param {number[]} centre        miniball centre
   * @param {number} radius          miniball radius
   */
  setShape(meshSegments, meshPoints, hullPoints, hullEdges, hullFaces, centre, radius) {
    // Normalise hull data into the unit measuring sphere (mesh arrives normalised).
    const p = hullPoints.map((v) => [
      (v[0] - centre[0]) / radius,
      (v[1] - centre[1]) / radius,
      (v[2] - centre[2]) / radius,
    ]);

    for (const key of Object.keys(this.parts)) {
      if (this.parts[key]) {
        this.shapesParent.remove(this.parts[key]);
        this.parts[key].geometry.dispose();
        this.parts[key] = null;
      }
    }

    // ORANGE — always the true input: mesh edges when the file has faces, the raw
    // points as dots when it doesn't. Never the hull (that's pink's job — the old
    // hull-edge fallback made point-cloud files look like "distorted" shapes).
    if (meshSegments) {
      const meshGeom = new LineSegmentsGeometry();
      meshGeom.setPositions(meshSegments);
      this.parts.mesh = new LineSegments2(meshGeom, this.materials.mesh);
    } else {
      const dotGeom = new BufferGeometry();
      dotGeom.setAttribute('position', new BufferAttribute(meshPoints ?? new Float32Array(0), 3));
      this.parts.mesh = new Points(dotGeom, this.materials.dots);
    }
    this.parts.mesh.renderOrder = 2; // orange stays most visible: drawn last

    // PINK — the measured hull: translucent bubble skin + whisper-thin lines.
    const skinPos = new Float32Array(hullFaces.length * 9);
    hullFaces.forEach((f, i) => {
      // hull faces from quickhull are triangles; fan any ngon defensively
      skinPos.set([...p[f[0]], ...p[f[1]], ...p[f[2]]], i * 9);
    });
    const skinGeom = new BufferGeometry();
    skinGeom.setAttribute('position', new BufferAttribute(skinPos, 3));
    this.parts.hullSkin = new Mesh(skinGeom, this.materials.hullSkin);
    this.parts.hullSkin.renderOrder = 0;

    const hullFlat = new Float32Array(hullEdges.length * 6);
    hullEdges.forEach(([a, b], i) => {
      hullFlat.set([...p[a], ...p[b]], i * 6);
    });
    const hullGeom = new LineSegmentsGeometry();
    hullGeom.setPositions(hullFlat);
    this.parts.hullLine = new LineSegments2(hullGeom, this.materials.hullLine);
    this.parts.hullLine.renderOrder = 1;

    this.shapesParent.add(this.parts.hullSkin, this.parts.hullLine, this.parts.mesh);
    this.shapesParent.rotation.set(0, 0, 0);
  }

  resize() {
    const { canvas, camera, renderer } = this;
    if (!canvas.clientWidth || !canvas.clientHeight) return; // hidden — keep last size
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    for (const m of Object.values(this.materials)) {
      if (m.resolution) m.resolution.set(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * Freeze-frame of the current shape as a PNG data URL (front-on, transparent
   * background). Rendered synchronously so the WebGL buffer is valid for toDataURL
   * in the same task — no preserveDrawingBuffer needed. Used as the "Previous
   * Properties" icon on the Ship/Fleet pages for uploaded shapes, which V1's own
   * per-preset icon swap knows nothing about.
   */
  snapshot() {
    this.resize();
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.resize();
    window.addEventListener('resize', this._resize);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      if (this.isSpinning) this.shapesParent.rotation.y += 0.005;
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this._running = false;
    window.removeEventListener('resize', this._resize);
    this.renderer.setAnimationLoop(null);
  }
}
