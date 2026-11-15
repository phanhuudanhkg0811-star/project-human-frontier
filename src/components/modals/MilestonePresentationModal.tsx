import { useEffect, useRef } from 'react';
import { AlertTriangle, Compass, Moon, Sun } from 'lucide-react';
import { playSfx as playSynthSfx } from '../../audio/soundEngine.ts';
import type { PendingMilestonePresentation } from '../../domain/narrativeSelectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { HAIL_ENV, HAIL_EQUIPMENT, HAIL_ROVER, HAIL_SVG } from '../cabin/hailAssets.ts';
import { SafeImage } from '../common/SafeImage.tsx';

function MilestoneArtwork({ kind }: { kind: PendingMilestonePresentation['kind'] }) {
  switch (kind) {
    case 'arrival':
      return (
        <div className="phf-milestone-art" aria-hidden="true">
          <SafeImage src={HAIL_ENV.cockpitShell} alt="" className="phf-milestone-art-bg" draggable={false} />
          <img src={HAIL_SVG.badgeNasaStem} alt="" className="phf-milestone-art-badge" draggable={false} />
        </div>
      );
    case 'golden-crisis':
      return (
        <div className="phf-milestone-art" aria-hidden="true">
          <SafeImage src={HAIL_ENV.regolithField} alt="" className="phf-milestone-art-bg" draggable={false} />
          <SafeImage src={HAIL_ROVER.active} alt="" className="phf-milestone-art-prop" draggable={false} />
          <SafeImage src={HAIL_EQUIPMENT.waterBase} alt="" className="phf-milestone-art-prop-alt" draggable={false} />
        </div>
      );
    case 'lunar-sunset':
      return (
        <div className="phf-milestone-art is-night" aria-hidden="true">
          <SafeImage src={HAIL_ENV.spaceDeep} alt="" className="phf-milestone-art-bg" draggable={false} />
          <SafeImage src={HAIL_ENV.lunarNight} alt="" className="phf-milestone-art-mid" draggable={false} />
        </div>
      );
    case 'lunar-sunrise':
      return (
        <div className="phf-milestone-art" aria-hidden="true">
          <SafeImage src={HAIL_ENV.spaceDeep} alt="" className="phf-milestone-art-bg" draggable={false} />
          <SafeImage src={HAIL_ENV.lunarDay} alt="" className="phf-milestone-art-mid" draggable={false} />
        </div>
      );
  }
}

function MilestoneIcon({ kind }: { kind: PendingMilestonePresentation['kind'] }) {
  switch (kind) {
    case 'arrival':
      return <Compass className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />;
    case 'golden-crisis':
      return <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />;
    case 'lunar-sunset':
      return <Moon className="w-4 h-4 text-indigo-300 shrink-0" aria-hidden="true" />;
    case 'lunar-sunrise':
      return <Sun className="w-4 h-4 text-amber-200 shrink-0" aria-hidden="true" />;
  }
}

export function MilestonePresentationModal({
  milestone,
  onDismiss,
}: {
  milestone: PendingMilestonePresentation;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const uiReducedMotion = useUiStore((s) => s.reducedMotion);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const prefersReduced =
    uiReducedMotion ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const dialog = dialogRef.current;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    const raf = window.requestAnimationFrame(() => {
      if (!dialog) return;
      const primary = dialog.querySelector<HTMLElement>('.phf-milestone-continue');
      if (primary) {
        primary.focus();
      } else {
        dialog.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (dialog?.open) {
        dialog.close();
      }
      const prev = previousFocusRef.current;
      if (prev?.isConnected) {
        prev.focus();
      }
    };
  }, [milestone.id]);

  const handleClose = (sound: 'confirm' | 'click') => {
    playSynthSfx(sound);
    onDismiss();
  };

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby="phf-milestone-title"
      data-milestone-id={milestone.id}
      className={`phf-milestone-dialog is-${milestone.kind} ${prefersReduced ? 'is-reduced-motion' : ''}`.trim()}
      onCancel={(e) => {
        e.preventDefault();
        handleClose('click');
      }}
    >
      <div className="phf-milestone-card">
        <MilestoneArtwork kind={milestone.kind} />

        <div className="phf-milestone-body">
          <div className="phf-milestone-meta">
            <span className="phf-milestone-kicker">
              <MilestoneIcon kind={milestone.kind} />
              <span>{t('milestone.kicker', { sol: milestone.sol })}</span>
            </span>
            <span className="hail-evidence-badge">
              {t(`stem.evidence.${milestone.provenance}`)}
            </span>
          </div>

          <h2 id="phf-milestone-title" className="phf-milestone-title">
            {t(milestone.titleKey)}
          </h2>
          <p className="phf-milestone-subtitle">{t(milestone.subtitleKey)}</p>
          <p className="phf-milestone-copy">{t(milestone.bodyKey)}</p>

          <dl className="phf-milestone-chips">
            {milestone.chips.map((chip) => (
              <div key={chip.labelKey} className="phf-milestone-chip">
                <dt>{t(chip.labelKey)}</dt>
                <dd>{chip.value}</dd>
              </div>
            ))}
          </dl>

          <aside className="phf-milestone-science">
            <p>{t(milestone.scienceNoteKey)}</p>
            <small>{t('milestone.sourceLabel', { source: milestone.sourceRef })}</small>
          </aside>

          <div className="phf-milestone-actions">
            <button
              type="button"
              className="hail-btn phf-milestone-skip"
              onClick={() => handleClose('click')}
            >
              {t('milestone.skip')}
            </button>
            <button
              type="button"
              className="hail-btn hail-btn--accent phf-milestone-continue"
              onClick={() => handleClose('confirm')}
            >
              {t('milestone.continue')}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
