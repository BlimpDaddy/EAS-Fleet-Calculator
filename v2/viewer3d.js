/**
 * Replica of the V1 wireframe viewer, for shapes that don't ship as .glb files
 * (i.e. uploaded .obj geometry). Construction copied parameter-for-parameter from
 * the V1 bundle's viewer class so the two are visually indistinguishable:
 *
 *   camera   PerspectiveCamera(50, 1, 0.1, 1000), z = 3
 *   controls OrbitControls — minDistance 2, maxDistance 4, no pan (drag spins, wheel zooms)
 *   sphere   WireframeGeometry(SphereGeometry(1, 20, 10)), white @ 25% — static, radius 1
 *   shape    LineSegments2 + LineMaterial({ color: 0xff9900, linewidth: 3 }) — fat orange
 *   spin     shapesParent.rotation.y += 0.005 (the shape spins; the sphere never does)
 *
 * The one deliberate difference: V1 displays pre-normalised .glb models inside its
 * radius-1 sphere. Here the shape is normalised by the miniball the pipeline computed,
 * so the sphere on screen IS the measuring sphere VE was divided by.
 */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Vector2,
  SphereGeometry, WireframeGeometry, LineBasicMaterial, LineSegments,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { contourLoops } from './wireframe.js';

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
    this.material = new LineMaterial({
      color: 0xff9900,
      linewidth: 3,
      resolution: new Vector2(window.innerWidth, window.innerHeight),
    });

    this.line = null;
    this._resize = () => this.resize();
    this._running = false;
  }

  /**
   * @param {number[][]} points  hull vertices
   * @param {number[][]} edges   [a,b] index pairs into points
   * @param {number[]} centre    miniball centre
   * @param {number} radius      miniball radius
   */
  setShape(points, edges, centre, radius) {
    // Normalise into the unit measuring sphere.
    const p = points.map((v) => [
      (v[0] - centre[0]) / radius,
      (v[1] - centre[1]) / radius,
      (v[2] - centre[2]) / radius,
    ]);
    // Sparse contour curves (meridians + parallels) instead of the raw hull edge set —
    // ~6,000 triangulation segments read as a blob; a handful of smooth surface curves
    // match the look of the preset models' baked wireframes.
    const flat = [];
    for (const loop of contourLoops(p, edges)) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        flat.push(...a, ...b);
      }
    }

    if (this.line) {
      this.shapesParent.remove(this.line);
      this.line.geometry.dispose();
    }
    const geom = new LineSegmentsGeometry();
    geom.setPositions(flat);
    this.line = new LineSegments2(geom, this.material);
    this.shapesParent.rotation.set(0, 0, 0);
    this.shapesParent.add(this.line);
  }

  resize() {
    const { canvas, camera, renderer, material } = this;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    material.resolution.set(window.innerWidth, window.innerHeight);
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
