import type { ActiveEventView } from '../domain/eventSelectors.ts';
import { EVENT_CATEGORY_LABELS, eventDeadlineText } from './eventPresentation.ts';

export function EventPriorityBanner({ view, currentSol, onOpen }: {
  view: ActiveEventView | null;
  currentSol: number;
  onOpen: () => void;
}) {
  if (!view) return null;
  return (
    <aside
      className={`hail-event-priority hail-event-priority--${view.event.category} ${view.priority >= 90 ? 'is-high-priority' : ''}`}
      aria-label="Sự kiện đang chờ"
    >
      <div className="hail-event-priority-copy" role="status" aria-live="polite" aria-atomic="true">
        <span className="hail-event-priority-meta">
          {EVENT_CATEGORY_LABELS[view.event.category]} · {view.mandatory ? 'Bắt buộc' : 'Tùy chọn'} · Ưu tiên {view.priority}
        </span>
        <strong>{view.event.title}</strong>
        <span className="hail-event-deadline">{eventDeadlineText(view, currentSol)}</span>
      </div>
      <button type="button" className="hail-btn" onClick={onOpen}>Xem sự kiện</button>
    </aside>
  );
}
