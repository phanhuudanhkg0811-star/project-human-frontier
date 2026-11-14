import { CommsLogisticsPanel } from '../CommsLogisticsPanel.tsx';
import { HAIL_EQUIPMENT } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';
import { useI18n } from '../../i18n/useI18n.ts';

interface CommsLogisticsModalProps {
  onClose: () => void;
}

export function CommsLogisticsModal({ onClose }: CommsLogisticsModalProps) {
  const { t } = useI18n();
  return (
    <MissionDialog
      title={t('modal.commsTitle')}
      eyebrow={t('modal.commsEyebrow')}
      art={HAIL_EQUIPMENT.comms}
      panelType="comms"
      dockSide="right"
      onClose={onClose}
    >
      <CommsLogisticsPanel />
    </MissionDialog>
  );
}
