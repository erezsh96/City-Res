/**
 * Small 3D view of one building for the project page. It slowly turns;
 * hovering a floor highlights it and reports which module it is.
 */
import * as THREE from 'three';
import type { PlacedProject } from '../data/model';
import { createBuilding, type BuildingHandle } from '../engine/building';
import type { Theme } from '../engine/daylight';

export class BuildingViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  private handle: BuildingHandle;
  private raf = 0;
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovering = false;
  private hoverFloor: number | null = null;
  private pinnedFloor: number | null = null;
  private last = performance.now();
  private spin = 0.5;

  constructor(
    private container: HTMLElement,
    pp: PlacedProject,
    theme: Theme,
    private onFloorHover: (index: number | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity + 0.3));
    const key = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity * 0.9 + 0.4);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    this.handle = createBuilding({ ...pp, x: 0, z: 0 }, { shadows: false });
    this.handle.group.rotation.y = 0;
    this.handle.windowMats.forEach((m) => (m.emissiveIntensity = theme.windowGlow));
    this.handle.neon.forEach((n) => n.mat.color.copy(n.base).multiplyScalar(Math.max(1, theme.neon)));
    this.scene.add(this.handle.group);

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(pp.footprint * 1.25, pp.footprint * 1.3, 0.25, 48),
      new THREE.MeshStandardMaterial({ color: theme.grass, roughness: 1 }),
    );
    ground.position.y = -0.125;
    this.scene.add(ground);

    const H = this.handle.height;
    const dist = Math.max(H * 0.62, pp.footprint * 1.6) / Math.tan(THREE.MathUtils.degToRad(14)) + 1;
    this.camera.position.set(0, H * 0.5 + dist * 0.22, dist);
    this.camera.lookAt(0, H * 0.48, 0);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', () => {
      this.hovering = false;
      this.setHover(null);
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  /** Highlight a floor from outside (hovering the floor list). */
  pinFloor(index: number | null): void {
    this.pinnedFloor = index;
    this.handle.highlightFloor(index ?? this.hoverFloor);
  }

  private onMove = (e: PointerEvent) => {
    this.hovering = true;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.handle.floors, false)[0];
    this.setHover(hit ? (hit.object.userData.floorIndex as number) : null);
  };

  private setHover(index: number | null) {
    if (index === this.hoverFloor) return;
    this.hoverFloor = index;
    this.handle.highlightFloor(index ?? this.pinnedFloor);
    this.onFloorHover(index);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const target = this.hovering || this.pinnedFloor !== null ? 0 : 0.35;
    this.spin += (target - this.spin) * Math.min(1, dt * 3);
    this.handle.group.rotation.y += dt * this.spin;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.handle.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !this.handle.group.getObjectById(o.id)) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
