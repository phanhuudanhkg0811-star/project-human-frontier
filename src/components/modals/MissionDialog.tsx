import { useEffect, useRef, type ReactNode } from 'react';
import { HAIL_SVG } from '../cabin/hailAssets.ts';
import { useI18n } from '../../i18n/useI18n.ts';

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
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);

  if (tactileFrame) {
    return (
      <dialog
        ref={ref}
        className={`mission-dialog hail-dialog hail-dialog--tactile mission-dialog--${panelType}`}
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

  return (
    <dialog
      ref={ref}
      className={`mission-dialog hail-dialog hail-dialog--dock-${dockSide} mission-dialog--${panelType}`}
      aria-labelledby="mission-dialog-title"
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="mission-dialog-frame hail-dialog-frame">
        <header className="mission-dialog-header hail-dialog-header">
          {art && (
            <div className="mission-dialog-art-wrap hail-dialog-art-wrap">
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
              alt="✕"
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
