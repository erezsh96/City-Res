/**
 * Turns content data into a city: building sizes and positions.
 * Pure functions with no three.js or DOM, so they are easy to test.
 *
 * Layout: the plaza sits at the centre, ringed by a canal and a ring road.
 * Each district gets a wedge (sector) of the disc, sized by how much it holds.
 * Inside a wedge, buildings fill rings from the inside out, smallest first,
 * so tall towers stand at the edge and never hide the smaller ones.
 */
import type { CityData, District, Project } from '../types';

export const LAYOUT = {
  plazaR: 5.2,
  canalIn: 5.6,
  canalOut: 6.9,
  ringRoadR: 8.0,
  ringRoadW: 1.3,
  firstRing: 9.8,
  street: 1.4,
  spacing: 1.0,
  edgePad: 0.9,
  floorH: 1.0,
} as const;

const TIER_BASE: Record<Project['tier'], number> = { featured: 5, more: 3, optional: 1.4 };
/** Buildings can face any direction, so reserve their diagonal. */
const DIAG = 1.42;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface PlacedProject {
  project: Project;
  district: District;
  districtIndex: number;
  score: number;
  floors: number;
  footprint: number;
  x: number;
  z: number;
  /** Angle of the position around the plaza, in radians. */
  angle: number;
  radius: number;
  pinned: boolean;
}

export interface Sector {
  district: District;
  index: number;
  start: number;
  end: number;
  mid: number;
}

export interface CityModel {
  data: CityData;
  sectors: Sector[];
  projects: PlacedProject[];
  byId: Map<string, PlacedProject>;
  /** Radius of the island disc. */
  radius: number;
  maxFloors: number;
}

/** How "big" a project is: tier, then code size, tests, duration and number of modules. */
export function scoreProject(p: Project): number {
  let s = TIER_BASE[p.tier];
  const z = p.size ?? {};
  if (z.linesOfCode) s += clamp(Math.log10(z.linesOfCode) - 2.5, 0, 2);
  if (z.tests) s += Math.min(1.5, z.tests / 40);
  if (z.months) s += Math.min(2, z.months / 3);
  s += Math.min(2, (p.floors?.length ?? 0) * 0.25);
  return s;
}

/** Number of floors: the score, at least one floor per listed module, unless overridden. */
export function floorsFor(p: Project): number {
  if (p.heightOverride) return p.heightOverride;
  return clamp(Math.max(Math.round(scoreProject(p)), p.floors?.length ?? 0), 1, 12);
}

/** Base width: grows with team size. */
export function footprintFor(p: Project): number {
  const team = p.size?.teamSize ?? 1;
  let f = 2.1 + Math.min(Math.max(team, 1) - 1, 4) * 0.35;
  if (p.tier === 'optional') f *= 0.75;
  return Math.round(f * 100) / 100;
}

interface Meta {
  project: Project;
  score: number;
  floors: number;
  footprint: number;
}

export function buildCityModel(data: CityData): CityModel {
  const metas: Meta[] = data.projects.map((p) => ({
    project: p,
    score: scoreProject(p),
    floors: floorsFor(p),
    footprint: footprintFor(p),
  }));
  const byDistrict = data.districts.map((d) => metas.filter((m) => m.project.district === d.id));

  // Wedge sizes, proportional to the width of what each district holds.
  const weights = byDistrict.map((items) =>
    Math.max(
      2.5,
      items.filter((m) => !m.project.place).reduce((s, m) => s + m.footprint * DIAG + LAYOUT.spacing, 0),
    ),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const MIN_SPAN = 0.5;
  let spans = weights.map((w) => Math.max(MIN_SPAN, (w / total) * Math.PI * 2));
  const spanSum = spans.reduce((a, b) => a + b, 0);
  spans = spans.map((s) => (s / spanSum) * Math.PI * 2);

  const sectors: Sector[] = [];
  let a = -Math.PI / 2 - spans[0] / 2;
  data.districts.forEach((d, i) => {
    sectors.push({ district: d, index: i, start: a, end: a + spans[i], mid: a + spans[i] / 2 });
    a += spans[i];
  });

  const placed: PlacedProject[] = [];
  const make = (m: Meta, sec: Sector, angle: number, radius: number, pinned: boolean): PlacedProject => ({
    project: m.project,
    district: sec.district,
    districtIndex: sec.index,
    score: m.score,
    floors: m.floors,
    footprint: m.footprint,
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    angle,
    radius,
    pinned,
  });

  for (const sec of sectors) {
    const items = byDistrict[sec.index];
    const auto = items
      .filter((m) => !m.project.place)
      .sort((x, y) => x.score - y.score || x.project.id.localeCompare(y.project.id));
    const span = sec.end - sec.start;
    let r: number = LAYOUT.firstRing;
    let q = 0;
    while (q < auto.length) {
      const ring: Meta[] = [];
      let width = 0;
      let ringMax = 0;
      while (q < auto.length) {
        const m = auto[q];
        const w = m.footprint * DIAG + LAYOUT.spacing;
        const nextMax = Math.max(ringMax, m.footprint * DIAG);
        const avail = span * (r + nextMax / 2) - 2 * LAYOUT.edgePad;
        if (ring.length > 0 && width + w > avail) break;
        ring.push(m);
        width += w;
        ringMax = nextMax;
        q++;
      }
      const rc = r + ringMax / 2;
      const avail = span * rc - 2 * LAYOUT.edgePad;
      const gap = Math.max(0, avail - width) / ring.length;
      // If one building is wider than the wedge, centre it on the wedge.
      let s = avail >= width ? sec.start + LAYOUT.edgePad / rc : sec.mid - width / (2 * rc);
      for (const m of ring) {
        const w = m.footprint * DIAG + LAYOUT.spacing;
        const ang = s + (gap / 2 + w / 2) / rc;
        s += (w + gap) / rc;
        placed.push(make(m, sec, ang, rc, false));
      }
      r = rc + ringMax / 2 + LAYOUT.street;
    }

    for (const m of items.filter((it) => it.project.place)) {
      const pl = m.project.place!;
      const ang = pl.angle !== undefined ? (pl.angle * Math.PI) / 180 : sec.mid;
      placed.push(make(m, sec, ang, pl.radius ?? LAYOUT.firstRing + 1, true));
    }
  }

  // Keep the original content order (stable for lists and tests).
  const order = new Map(data.projects.map((p, i) => [p.id, i]));
  placed.sort((x, y) => order.get(x.project.id)! - order.get(y.project.id)!);

  const radius = Math.max(16, ...placed.map((p) => p.radius + p.footprint * 0.8 + 2.2));
  const maxFloors = Math.max(1, ...placed.map((p) => p.floors));
  return {
    data,
    sectors,
    projects: placed,
    byId: new Map(placed.map((p) => [p.project.id, p])),
    radius,
    maxFloors,
  };
}
