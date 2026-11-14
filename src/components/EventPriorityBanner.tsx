import type { ActiveEventView } from '../domain/eventSelectors.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { eventDeadlineText, getEventCategoryLabel } from './eventPresentation.ts';

export function EventPriorityBanner({ view, currentSol, onOpen }: {
  view: ActiveEventView | null;
  currentSol: number;
  onOpen: () => void;
}) {
  const { locale, t, pickText } = useI18n();
  if (!view) return null;
  return (
    <aside
      className={`hail-event-priority hail-event-priority--${view.event.category} ${view.priority >= 90 ? 'is-high-priority' : ''}`}
      aria-label={t('events.bannerAria')}
    >
      <div className="hail-event-priority-copy" role="status" aria-live="polite" aria-atomic="true">
        <span className="hail-event-priority-meta">
          {getEventCategoryLabel(view.event.category, locale)} ·{' '}
          {view.mandatory ? t('events.mandatoryShort') : t('events.optionalShort')} ·{' '}
          {t('events.priorityLabel', { priority: view.priority })}
        </span>
        <strong>{pickText(view.event.title, view.event.titleEn)}</strong>
        <span className="hail-event-deadline">{eventDeadlineText(view, currentSol, locale)}</span>
      </div>
      <button type="button" className="hail-btn" onClick={onOpen}>{t('events.viewButton')}</button>
    </aside>
  );
}
