/** The HUD card shown beside a selected building (as in the inspiration image). */
import type { PlacedProject } from '../data/model';
import { getLang, t } from '../i18n';
import { loc } from '../text';
import { assetUrl, h, nodes } from './dom';
import { districtChip, floorsText, metricsList, privateBadge, stackChips, teamText } from './common';

export class SideCard {
  private current: PlacedProject | null = null;

  constructor(private el: HTMLElement, private handlers: { onEnter(id: string): void; onClose(): void }) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  show(pp: PlacedProject): void {
    this.current = pp;
    this.render();
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-open'));
  }

  hide(): void {
    this.current = null;
    this.el.classList.remove('is-open');
    this.el.hidden = true;
  }

  refresh(): void {
    if (this.current) this.render();
  }

  private render(): void {
    const pp = this.current!;
    const p = pp.project;
    const lang = getLang();
    const cover = p.gallery?.[0];
    const meta = [floorsText(pp.floors), teamText(pp)].filter(Boolean).join(' · ');
    this.el.replaceChildren(...nodes(
      h('span', { class: 'hud-corner hud-tl' }),
      h('span', { class: 'hud-corner hud-br' }),
      h('button', { class: 'icon-btn card-close', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: () => this.handlers.onClose() }, '✕'),
      cover ? h('img', { class: 'card-cover', src: assetUrl(cover.src), alt: loc(cover.caption, lang) || loc(p.title, lang) }) : null,
      h('div', { class: 'card-top' }, districtChip(pp), privateBadge(pp)),
      h('h2', { class: 'card-title' }, loc(p.title, lang)),
      h('p', { class: 'card-meta' }, meta),
      h('p', { class: 'card-tagline' }, loc(p.tagline, lang)),
      metricsList(pp, 2),
      stackChips(p.stack, 6),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.handlers.onEnter(p.id) }, t('enter'), ' →'),
      ),
    ));
  }
}
