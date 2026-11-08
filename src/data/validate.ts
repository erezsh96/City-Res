/**
 * Validates content/city.json. Used by the build (vite.config.ts), by
 * `npm run validate` (CI) and at runtime in development.
 * Returns a list of human-readable problems; empty means valid.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isLoc = (v: unknown): boolean =>
  isNonEmpty(v) || (isObj(v) && isNonEmpty(v.en) && (v.he === undefined || typeof v.he === 'string'));
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isLocList = (v: unknown): boolean =>
  isStrArr(v) || (isObj(v) && isStrArr(v.en) && (v.he === undefined || isStrArr(v.he)));
const isUrl = (v: unknown): boolean => typeof v === 'string' && /^(https:\/\/|mailto:)\S+$/.test(v);

const PROJECT_KEYS = new Set([
  'id', 'district', 'tier', 'access', 'title', 'tagline', 'description', 'goals', 'myRole', 'stack',
  'metrics', 'links', 'gallery', 'floors', 'size', 'heightOverride', 'place', 'sign', 'notes',
]);
const SIZE_KEYS = new Set(['linesOfCode', 'tests', 'months', 'teamSize']);
const LINK_KEYS = new Set(['github', 'demo', 'video']);

export function validateCity(raw: unknown): string[] {
  const e: string[] = [];
  if (!isObj(raw)) return ['the root must be an object with owner, districts and projects'];

  if (raw.site !== undefined) {
    if (!isObj(raw.site)) e.push('site must be an object');
    else {
      for (const k of Object.keys(raw.site)) if (k !== 'clarityId') e.push(`site: unknown field "${k}" (typo?)`);
      const id = raw.site.clarityId;
      if (id !== undefined && (typeof id !== 'string' || (id !== '' && !/^[a-z0-9]{6,20}$/i.test(id))))
        e.push('site.clarityId must be empty or a Clarity project ID (letters and digits)');
    }
  }

  const owner = raw.owner;
  if (!isObj(owner)) e.push('owner is missing');
  else {
    if (!isNonEmpty(owner.name)) e.push('owner.name is missing');
    if (!isNonEmpty(owner.initials) || owner.initials.length > 3) e.push('owner.initials must be 1-3 characters');
    if (!isLoc(owner.role)) e.push('owner.role is missing');
    if (!isLoc(owner.bio)) e.push('owner.bio is missing');
    if (!Array.isArray(owner.links)) e.push('owner.links must be a list');
    else owner.links.forEach((l, i) => {
      if (!isObj(l) || !isLoc(l.label) || !isUrl(l.url)) e.push(`owner.links[${i}] needs a label and an https:// or mailto: url`);
    });
  }

  const districtIds = new Set<string>();
  if (!Array.isArray(raw.districts) || raw.districts.length === 0) e.push('districts must be a non-empty list');
  else raw.districts.forEach((d, i) => {
    if (!isObj(d)) return void e.push(`districts[${i}] must be an object`);
    if (!isNonEmpty(d.id) || !ID.test(d.id)) e.push(`districts[${i}].id must be lowercase-with-dashes`);
    else if (districtIds.has(d.id)) e.push(`district id "${d.id}" is used twice`);
    else districtIds.add(d.id);
    if (!isLoc(d.name)) e.push(`districts[${i}].name is missing`);
    if (typeof d.color !== 'string' || !HEX.test(d.color)) e.push(`districts[${i}].color must look like #22d3ee`);
  });

  const projectIds = new Set<string>();
  if (!Array.isArray(raw.projects)) e.push('projects must be a list');
  else raw.projects.forEach((p, i) => {
    if (!isObj(p)) return void e.push(`projects[${i}] must be an object`);
    const where = `projects[${i}]${typeof p.id === 'string' ? ` (${p.id})` : ''}`;
    for (const k of Object.keys(p)) if (!PROJECT_KEYS.has(k)) e.push(`${where}: unknown field "${k}" (typo?)`);

    if (!isNonEmpty(p.id) || !ID.test(p.id)) e.push(`${where}: id must be lowercase-with-dashes`);
    else if (projectIds.has(p.id)) e.push(`${where}: id is used twice`);
    else projectIds.add(p.id);

    if (typeof p.district !== 'string' || !districtIds.has(p.district)) e.push(`${where}: district "${String(p.district)}" does not exist`);
    if (!['featured', 'more', 'optional'].includes(p.tier as string)) e.push(`${where}: tier must be featured, more or optional`);
    if (!['public', 'private'].includes(p.access as string)) e.push(`${where}: access must be public or private`);
    if (!isLoc(p.title)) e.push(`${where}: title is missing`);
    if (!isLoc(p.tagline)) e.push(`${where}: tagline is missing`);
    if (p.description !== undefined && !isLoc(p.description)) e.push(`${where}: description must be text`);
    if (p.goals !== undefined && !isLocList(p.goals)) e.push(`${where}: goals must be a list of text`);
    if (p.myRole !== undefined && !isLoc(p.myRole)) e.push(`${where}: myRole must be text`);
    if (!isStrArr(p.stack)) e.push(`${where}: stack must be a list of strings`);

    if (p.metrics !== undefined) {
      if (!Array.isArray(p.metrics)) e.push(`${where}: metrics must be a list`);
      else p.metrics.forEach((m, j) => {
        if (!isObj(m) || !isNonEmpty(m.value) || !isLoc(m.label)) e.push(`${where}: metrics[${j}] needs value and label`);
      });
    }

    if (p.links !== undefined) {
      if (!isObj(p.links)) e.push(`${where}: links must be an object`);
      else {
        for (const [k, v] of Object.entries(p.links)) {
          if (!LINK_KEYS.has(k)) e.push(`${where}: unknown link "${k}"`);
          else if (!isUrl(v)) e.push(`${where}: links.${k} must be an https:// url`);
        }
        if (p.access === 'private' && p.links.github) e.push(`${where}: private projects must not link to their code`);
      }
    }

    if (p.gallery !== undefined) {
      if (!Array.isArray(p.gallery)) e.push(`${where}: gallery must be a list`);
      else p.gallery.forEach((g, j) => {
        if (!isObj(g) || !isNonEmpty(g.src)) e.push(`${where}: gallery[${j}] needs src`);
        else if (g.caption !== undefined && !isLoc(g.caption)) e.push(`${where}: gallery[${j}].caption must be text`);
      });
    }

    if (p.floors !== undefined) {
      if (!Array.isArray(p.floors)) e.push(`${where}: floors must be a list`);
      else p.floors.forEach((f, j) => {
        if (!isObj(f) || !isLoc(f.name)) e.push(`${where}: floors[${j}] needs a name`);
        else if (f.detail !== undefined && !isLoc(f.detail)) e.push(`${where}: floors[${j}].detail must be text`);
      });
    }

    if (p.size !== undefined) {
      if (!isObj(p.size)) e.push(`${where}: size must be an object`);
      else for (const [k, v] of Object.entries(p.size)) {
        if (!SIZE_KEYS.has(k)) e.push(`${where}: unknown size field "${k}"`);
        else if (typeof v !== 'number' || v < 0 || !Number.isFinite(v)) e.push(`${where}: size.${k} must be a positive number`);
      }
    }

    if (p.heightOverride !== undefined) {
      const h = p.heightOverride;
      if (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 12) e.push(`${where}: heightOverride must be a whole number 1-12`);
    }

    if (p.place !== undefined) {
      if (!isObj(p.place)) e.push(`${where}: place must be an object`);
      else {
        if (p.place.angle !== undefined && typeof p.place.angle !== 'number') e.push(`${where}: place.angle must be a number (degrees)`);
        if (p.place.radius !== undefined && (typeof p.place.radius !== 'number' || p.place.radius < 9)) e.push(`${where}: place.radius must be at least 9`);
      }
    }

    if (p.sign !== undefined && (typeof p.sign !== 'string' || p.sign.length > 14)) e.push(`${where}: sign must be at most 14 characters`);
    if (p.notes !== undefined && typeof p.notes !== 'string') e.push(`${where}: notes must be text`);
  });

  return e;
}
