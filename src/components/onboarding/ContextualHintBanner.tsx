import { useEffect, useRef } from 'react';
import { AlertTriangle, BellOff, Compass, Lightbulb, Wrench, X } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n.ts';
import { tourSelector } from '../../onboarding/targets.ts';
import type { ContextualHintView, HintCtaPanel, TourTargetId } from '../../onboarding/types.ts';

function resolveVisibleTargetElement(
  primaryId: TourTargetId,
  fallbackId?: TourTargetId
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const candidates = [primaryId, ...(fallbackId ? [fallbackId] : [])];
  for (const id of candidates) {
    const el = document.querySelector<HTMLElement>(tourSelector(id));
    if (el && el.getClientRects().length > 0) {
      return el;
    }
  }
  return null;
}

export function ContextualHintBanner({
  hint,
  sol,
  reducedMotion,
  lastRecordedSol,
  lastRecordedSeverity,
  onRecordShown,
  onOpenPanel,
  onSnoozeSol,
  onDismissForever,
  onDisableHints,
}: {
  hint: ContextualHintView;
  sol: number;
  reducedMotion: boolean;
  lastRecordedSol?: number;
  lastRecordedSeverity?: string;
  onRecordShown: (hintId: string, sol: number, severityKey: string) => void;
  onOpenPanel: (panel: HintCtaPanel) => void;
  onSnoozeSol: (hintId: string, sol: number, severityKey: string) => void;
  onDismissForever: (hintId: string) => void;
  onDisableHints: () => void;
}) {
  const { t } = useI18n();
  const recordedRef = useRef<string>('');

  useEffect(() => {
    const key = `${hint.id}:${sol}:${hint.severityKey}`;
    if (recordedRef.current === key) return;
    if (lastRecordedSol === sol && lastRecordedSeverity === hint.severityKey) {
      recordedRef.current = key;
      return;
    }
    recordedRef.current = key;
    onRecordShown(hint.id, sol, hint.severityKey);
  }, [hint.id, hint.severityKey, sol, lastRecordedSol, lastRecordedSeverity, onRecordShown]);

  const handleOpenCta = () => {
    const targetEl = resolveVisibleTargetElement(hint.ctaTargetId, hint.fallbackTargetId);
    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
    onOpenPanel(hint.ctaPanel);
  };

  const Icon =
    hint.category === 'critical-safety'
      ? AlertTriangle
      : hint.category === 'debrief-followup'
        ? Wrench
        : hint.category === 'workflow'
          ? Compass
          : Lightbulb;

  const badgeKey = `hints.badge.${hint.category}`;

  return (
    <aside
      className={`phf-hint-banner phf-hint-banner--${hint.category} ${reducedMotion ? 'is-reduced-motion' : ''}`.trim()}
      aria-label={t('hints.regionAria')}
      data-hint-id={hint.id}
    >
      <div className="phf-hint-head">
        <span className="phf-hint-badge">
          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{t(badgeKey)}</span>
        </span>
        <button
          type="button"
          className="phf-hint-close"
          onClick={() => onSnoozeSol(hint.id, sol, hint.severityKey)}
          aria-label={t('hints.snoozeAria')}
          title={t('hints.snoozeSol')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="phf-hint-copy" role="status" aria-live="polite" aria-atomic="true">
        <strong>{t(hint.titleKey, hint.params)}</strong>
        <p>{t(hint.bodyKey, hint.params)}</p>
        {hint.escalatedFromPrior && hint.reasonKey && (
          <p className="phf-hint-escalation">
            {t('hints.escalatedPrefix')} {t(hint.reasonKey, hint.params)}
          </p>
        )}
      </div>

      <div className="phf-hint-actions">
        <button
          type="button"
          className="hail-btn hail-btn--accent phf-hint-cta"
          onClick={handleOpenCta}
        >
          {t(hint.ctaLabelKey)}
        </button>

        <button
          type="button"
          className="phf-hint-link"
          onClick={() => onSnoozeSol(hint.id, sol, hint.severityKey)}
        >
          {t('hints.snoozeSol')}
        </button>

        {hint.allowNeverRemindAgain ? (
          <button
            type="button"
            className="phf-hint-link"
            onClick={() => onDismissForever(hint.id)}
          >
            {t('hints.neverRemind')}
          </button>
        ) : (
          <button
            type="button"
            className="phf-hint-link phf-hint-link--muted"
            onClick={onDisableHints}
            title={t('hints.disableAll')}
          >
            <BellOff className="w-3 h-3" aria-hidden="true" />
            <span>{t('hints.disableAll')}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
