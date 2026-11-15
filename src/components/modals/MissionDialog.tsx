import { useEffect, useRef, type ReactNode } from 'react';
import { HAIL_SVG } from '../cabin/hailAssets.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useUiStore } from '../../store/uiStore.ts';

export type MissionDialogType =
  | 'journal'
  | 'starlog'
  | 'character'
  | 'crafting'
  | 'expedition'
  | 'end'
  | 'comms'
  | 'launch'
  | 'menu'
  | 'tutorial'
  | 'about'
  | 'generic';

interface MissionDialogProps {
  title: string;
  eyebrow: string;
  art?: string;
  panelType?: MissionDialogType;
  dockSide?: 'left' | 'right' | 'center';
  tactileFrame?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MissionDialog({
  title,
  eyebrow,
  art,
  panelType = 'generic',
  dockSide = 'right',
  tactileFrame = false,
  onClose,
  children,
}: MissionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const tourActive = useUiStore((s) => s.onboarding.activeTour !== null);
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.requestAnimationFrame(() => {
      if (!dialog) return;
      const active = document.activeElement;
      if (active && dialog.contains(active) && active !== dialog) {
        return;
      }
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialog.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(focusTimer);
      if (dialog?.open) dialog.close();
      const prev = previousFocusRef.current;
      if (prev?.isConnected) {
        prev.focus();
      }
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (dialog.open) {
      dialog.close();
    }
    if (tourActive) {
      dialog.show();
    } else {
      dialog.showModal();
    }
  }, [tourActive]);

  if (tactileFrame) {
    return (
      <dialog
        ref={ref}
        tabIndex={-1}
        aria-modal="true"
        className={`mission-dialog hail-dialog hail-dialog--tactile mission-dialog--${panelType} ${tourActive ? 'is-tour-modeless' : ''}`.trim()}
        aria-label={title}
        onClick={(e) => {
          if (e.target === ref.current) {
            onClose();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <div className="hail-tactile-dialog-shell">{children}</div>
      </dialog>
    );
  }

  const allowModalInteraction = tourActive && (panelType === 'comms' || panelType === 'expedition');

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-modal="true"
      className={`mission-dialog hail-dialog hail-dialog--dock-${dockSide} mission-dialog--${panelType} ${tourActive ? 'is-tour-modeless' : ''} ${allowModalInteraction ? 'driver-allowed-element' : ''}`.trim()}
      aria-labelledby="mission-dialog-title"
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="mission-dialog-frame hail-dialog-frame"
        data-tour-modal-frame={panelType}
      >
        <header className="mission-dialog-header hail-dialog-header">
          {art && (
            <div className="mission-dialog-art-wrap hail-dialog-art-wrap" aria-hidden="true">
              <img
                src={art}
                alt=""
                className="mission-dialog-art"
                draggable={false}
              />
            </div>
          )}
          <div className="mission-dialog-titles">
            <p className="mission-dialog-eyebrow">{eyebrow}</p>
            <h2 id="mission-dialog-title" className="mission-dialog-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="mission-close-btn hail-close-btn"
            aria-label={t('common.closeDialog')}
            onClick={onClose}
          >
            <img
              src={HAIL_SVG.navClose}
              alt=""
              aria-hidden="true"
              className="w-5 h-5 object-contain pointer-events-none"
            />
          </button>
        </header>

        <div className="mission-dialog-body custom-parsecs-scroll">
          {children}
        </div>
      </div>
    </dialog>
  );
}
