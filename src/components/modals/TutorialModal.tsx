import { useI18n } from '../../i18n/useI18n.ts';
import { MissionDialog } from './MissionDialog.tsx';

export function TutorialModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  return (
    <MissionDialog
      title={t('tutorial.title')}
      eyebrow={t('tutorial.eyebrow')}
      panelType="tutorial"
      dockSide="center"
      onClose={onClose}
    >
      <p className="text-sm text-slate-200">{t('tutorial.placeholder')}</p>
    </MissionDialog>
  );
}
