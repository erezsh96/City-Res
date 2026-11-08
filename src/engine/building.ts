/**
 * Procedural buildings. A project becomes:
 *  - one storey per floor (floor i = module i from the content file),
 *  - a footprint that grows with team size,
 *  - a style by height: house (pitched mossy roof), block (roof garden), tower (setbacks + antenna),
 *  - a neon sign and a district-coloured accent band.
 * The same id always yields the same building (seeded randomness).
 */
import * as THREE from 'three';
import { LAYOUT, type PlacedProject } from '../data/model';
import { rngFor } from './rng';
import { signTexture, windowTextures, WINDOW_VARIANTS } from './textures';

const WALLS = ['#8c6f5c', '#5f7594', '#6d5f80', '#7b8a68', '#9b7b63', '#56707a', '#84698a', '#a08a6e'];
const MOSS = '#6c9a52';
export const HIGHLIGHT = new THREE.Color('#38e8ff');

export interface BuildingHandle {
  id: string;
  /** Positioned and rotated in the city. */
  group: THREE.Group;
  /** Child that is scaled (intro) and lifted (hover). */
  body: THREE.Group;
  /** Invisible box used for picking. */
  pick: THREE.Mesh;
  floors: THREE.Mesh[];
  height: number;
  windowMats: THREE.MeshStandardMaterial[];
  neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  blinkers: THREE.Mesh[];
  setHighlight(on: boolean): void;
  highlightFloor(index: number | null): void;
  dispose(): void;
}

export function createBuilding(pp: PlacedProject, opts: { shadows: boolean }): BuildingHandle {
  const rng = rngFor(pp.project.id);
  const accent = new THREE.Color(pp.district.color);
  const wallColor = new THREE.Color(WALLS[Math.floor(rng() * WALLS.length)]).lerp(accent, 0.12);
  const n = pp.floors;
  const fh = LAYOUT.floorH;
  const w0 = pp.footprint;
  const depthRatio = 0.8 + rng() * 0.15;
  const style = n <= 2 ? 'house' : n <= 5 ? 'block' : 'tower';

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const floors: THREE.Mesh[] = [];
  const edges: THREE.LineSegments[] = [];
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const neon: BuildingHandle['neon'] = [];
  const blinkers: THREE.Mesh[] = [];

  const plainMat = own(new THREE.MeshStandardMaterial({ color: wallColor.clone().multiplyScalar(0.8), roughness: 0.9 }));
  const darkMat = own(new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.8 }));
  const mossMat = own(new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }));
  const edgeMat = own(new THREE.LineBasicMaterial({ color: HIGHLIGHT }));
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const wallMat = (variant: number, repeat: number) => {
    const key = `${variant}-${repeat}`;
    let m = matCache.get(key);
    if (!m) {
      const tex = windowTextures(variant, repeat);
      m = own(
        new THREE.MeshStandardMaterial({
          color: wallColor,
          map: tex.map,
          emissive: new THREE.Color('#ffc46b'),
          emissiveMap: tex.emissive,
          emissiveIntensity: 0,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      matCache.set(key, m);
      windowMats.push(m);
    }
    return m;
  };
  const neonMat = (color: THREE.Color, map?: THREE.Texture) => {
    const mat = own(new THREE.MeshBasicMaterial({ color: color.clone(), map, toneMapped: false, transparent: !!map }));
    neon.push({ mat, base: color.clone() });
    return mat;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) => {
    own(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.shadows;
    m.receiveShadow = opts.shadows;
    body.add(m);
    return m;
  };

  // Storeys.
  let y = 0;
  let w = w0;
  const depths: number[] = [];
  for (let i = 0; i < n; i++) {
    if (style === 'tower' && i > 0 && i % 3 === 0) w *= 0.88;
    const d = w * depthRatio;
    depths.push(d);
    const mat = wallMat(Math.floor(rng() * WINDOW_VARIANTS), Math.max(1, Math.round(w / 1.7)));
    // Box face order: +x, -x, +y, -y, +z, -z. No windows on top/bottom.
    const floor = mesh(new THREE.BoxGeometry(w, fh, d), [mat, mat, plainMat, plainMat, mat, mat]);
    floor.position.y = y + fh / 2;
    floor.userData.floorIndex = i;
    floors.push(floor);
    const e = new THREE.LineSegments(own(new THREE.EdgesGeometry(floor.geometry)), edgeMat);
    e.position.copy(floor.position);
    e.visible = false;
    body.add(e);
    edges.push(e);
    if (style === 'tower' && i % 3 === 2 && i < n - 1) {
      const ledge = mesh(new THREE.BoxGeometry(w + 0.12, 0.08, d + 0.12), plainMat);
      ledge.position.y = y + fh;
    }
    y += fh;
  }
  const top = y;
  const d0 = depths[0];

  // Ground floor: door, awning in district colour, accent band.
  const door = mesh(new THREE.PlaneGeometry(0.34, 0.56), darkMat);
  door.position.set(0, 0.28, d0 / 2 + 0.006);
  const awning = mesh(new THREE.BoxGeometry(Math.min(w0 * 0.55, 1.1), 0.05, 0.3), neonMat(accent.clone().multiplyScalar(0.6)));
  awning.position.set(0, 0.62, d0 / 2 + 0.15);
  if (n > 1) {
    const band = mesh(new THREE.BoxGeometry(w0 + 0.03, 0.05, d0 + 0.03), neonMat(accent));
    band.position.y = fh;
  }

  // Neon sign on the front.
  const signFloor = Math.min(1, n - 1);
  const signW = Math.min(depthWidth(floors[signFloor]) * 0.85, 1.6);
  const signText = pp.project.sign ?? defaultSign(pp);
  const sign = mesh(new THREE.PlaneGeometry(signW, signW / 4), neonMat(new THREE.Color('#ffffff'), signTexture(signText, pp.district.color)));
  sign.castShadow = false;
  sign.position.set(0, n === 1 ? fh - signW / 8 - 0.04 : signFloor * fh + fh * 0.55, depths[signFloor] / 2 + 0.02);

  // Roof by style.
  const topW = depthWidth(floors[n - 1]);
  const topD = depths[n - 1];
  if (style === 'house') {
    const roof = mesh(new THREE.ConeGeometry(topW * 0.74, 0.8, 4), mossMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = depthRatio;
    roof.position.y = top + 0.4;
  } else {
    const slab = mesh(new THREE.BoxGeometry(topW + 0.12, 0.12, topD + 0.12), plainMat);
    slab.position.y = top + 0.06;
    const garden = mesh(new THREE.BoxGeometry(topW * 0.6, 0.16, topD * 0.5), mossMat);
    garden.position.set(-topW * 0.12, top + 0.2, -topD * 0.1);
    if (style === 'block') {
      const tank = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10), darkMat);
      tank.position.set(topW * 0.3, top + 0.33, topD * 0.25);
    } else {
      const cap = mesh(new THREE.BoxGeometry(topW * 0.45, 0.55, topD * 0.45), plainMat);
      cap.position.y = top + 0.39;
      const antenna = mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 6), darkMat);
      antenna.position.y = top + 1.4;
      const light = mesh(new THREE.SphereGeometry(0.07, 8, 6), neonMat(new THREE.Color('#ff4d5e')));
      light.position.y = top + 2.17;
      light.castShadow = false;
      blinkers.push(light);
      if (pp.project.tier === 'featured') {
        const flag = mesh(new THREE.PlaneGeometry(0.42, 0.24), neonMat(accent));
        (flag.material as THREE.Material).side = THREE.DoubleSide;
        flag.position.set(0.22, top + 1.95, 0);
      }
    }
  }
  const height = style === 'house' ? top + 0.8 : style === 'tower' ? top + 2.2 : top + 0.45;

  // Picking volume.
  const pick = new THREE.Mesh(
    own(new THREE.BoxGeometry(w0 * 1.05, height, d0 * 1.05)),
    own(new THREE.MeshBasicMaterial({ visible: false })),
  );
  pick.position.y = height / 2;
  pick.userData = { kind: 'building', id: pp.project.id };
  body.add(pick);

  group.position.set(pp.x, 0, pp.z);
  // Front (+z) faces the plaza.
  group.rotation.y = Math.atan2(-Math.cos(pp.angle), -Math.sin(pp.angle));
  group.userData = { kind: 'building', id: pp.project.id };

  return {
    id: pp.project.id,
    group,
    body,
    pick,
    floors,
    height,
    windowMats,
    neon,
    blinkers,
    setHighlight(on) {
      edges.forEach((e) => (e.visible = on));
    },
    highlightFloor(index) {
      edges.forEach((e, i) => (e.visible = i === index));
    },
    dispose() {
      disposables.forEach((x) => x.dispose());
    },
  };
}

function depthWidth(floor: THREE.Mesh): number {
  return (floor.geometry as THREE.BoxGeometry).parameters.width;
}

function defaultSign(pp: PlacedProject): string {
  const t = typeof pp.project.title === 'string' ? pp.project.title : pp.project.title.en;
  return t.split(/\s+/)[0].slice(0, 10).toUpperCase();
}
