import type { PlacedProject } from '../data/model';
import { getLang, t } from '../i18n';
import { loc } from '../text';
import { h } from './dom';

export function floorsText(n: number): string {
  return n === 1 ? t('floor1') : t('floors', { n });
}

export function teamText(pp: PlacedProject): string {
  const team = pp.project.size?.teamSize;
  return team && team > 1 ? t('team', { n: team }) : team === 1 ? t('solo') : '';
}

export function districtChip(pp: PlacedProject): HTMLElement {
  return h(
    'span',
    { class: 'district-chip', style: `--d:${pp.district.color}` },
    h('span', { class: 'dot' }),
    loc(pp.district.name, getLang()),
  );
}

export function metricsList(pp: PlacedProject, limit = 99): HTMLElement | null {
  const ms = (pp.project.metrics ?? []).slice(0, limit);
  if (!ms.length) return null;
  return h(
    'ul',
    { class: 'metrics' },
    ms.map((m) => h('li', {}, h('strong', {}, m.value), h('span', {}, loc(m.label, getLang())))),
  );
}

export function stackChips(stack: string[], limit = 99): HTMLElement {
  return h('ul', { class: 'chips' }, stack.slice(0, limit).map((s) => h('li', {}, s)));
}

export function privateBadge(pp: PlacedProject): HTMLElement | null {
  return pp.project.access === 'private' ? h('span', { class: 'badge badge-private' }, '🔒 ', t('privateWork')) : null;
}
