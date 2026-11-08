/**
 * Isometric (orthographic) camera that orbits the plaza.
 * Everything is driven by "target" values that the current values ease towards,
 * so wheel input, buttons and fly-to animations all feel the same.
 */
import * as THREE from 'three';

export interface View {
  azimuth: number;
  zoom: number;
  target: THREE.Vector3;
  offsetX: number;
  offsetY: number;
}

const ELEVATION = THREE.MathUtils.degToRad(33);
const DIST = 120;

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  azimuth = Math.PI / 4;
  zoom = 1;
  readonly target = new THREE.Vector3();
  /** Screen-space shift (fraction of half the view), to make room for side cards. */
  offsetX = 0;
  offsetY = 0;

  goal: View;
  minZoom = 0.8;
  maxZoom = 4;
  private aspect = 1;
  /** Half-height of the view at zoom 1 that fits the whole island. */
  fitHalfH = 10;

  constructor(private radius: number, private maxHeight: number) {
    this.goal = { azimuth: this.azimuth, zoom: 1, target: new THREE.Vector3(), offsetX: 0, offsetY: 0 };
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    // The disc is 2R wide on screen and about R*sin(el)*2 + building height tall.
    const needW = this.radius * 1.04;
    const needH = this.radius * Math.sin(ELEVATION) * 1.02 + this.maxHeight * Math.cos(ELEVATION) * 0.3 + 0.5;
    this.fitHalfH = Math.max(needH, needW / aspect);
  }

  get halfH(): number {
    return this.fitHalfH / this.zoom;
  }

  rotateBy(delta: number): void {
    this.goal.azimuth += delta;
  }

  zoomBy(factor: number): void {
    this.goal.zoom = THREE.MathUtils.clamp(this.goal.zoom * factor, this.minZoom, this.maxZoom);
  }

  snapshot(): View {
    return { ...this.goal, target: this.goal.target.clone() };
  }

  /** Ease towards a view. Azimuth takes the shortest way round. */
  flyTo(view: Partial<View>): void {
    if (view.azimuth !== undefined) {
      const cur = this.goal.azimuth;
      let d = (view.azimuth - cur) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.goal.azimuth = cur + d;
    }
    if (view.zoom !== undefined) this.goal.zoom = THREE.MathUtils.clamp(view.zoom, this.minZoom, this.maxZoom);
    if (view.target) this.goal.target.copy(view.target);
    if (view.offsetX !== undefined) this.goal.offsetX = view.offsetX;
    if (view.offsetY !== undefined) this.goal.offsetY = view.offsetY;
  }

  /** Called every frame. Returns true while still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 7);
    const before = this.azimuth + this.zoom + this.target.x + this.target.z + this.offsetX;
    this.azimuth += (this.goal.azimuth - this.azimuth) * k;
    this.zoom += (this.goal.zoom - this.zoom) * k;
    this.target.lerp(this.goal.target, k);
    this.offsetX += (this.goal.offsetX - this.offsetX) * k;
    this.offsetY += (this.goal.offsetY - this.offsetY) * k;
    this.apply();
    const after = this.azimuth + this.zoom + this.target.x + this.target.z + this.offsetX;
    return Math.abs(after - before) > 1e-5;
  }

  apply(): void {
    const halfH = this.halfH;
    const halfW = halfH * this.aspect;
    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    const dir = new THREE.Vector3(
      Math.cos(this.azimuth) * Math.cos(ELEVATION),
      Math.sin(ELEVATION),
      Math.sin(this.azimuth) * Math.cos(ELEVATION),
    );
    cam.position.copy(this.target).addScaledVector(dir, DIST);
    cam.lookAt(this.target);
    // Shift the view sideways/up so a selected building sits beside an open card.
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, this.offsetX * halfW).addScaledVector(up, this.offsetY * halfH);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
