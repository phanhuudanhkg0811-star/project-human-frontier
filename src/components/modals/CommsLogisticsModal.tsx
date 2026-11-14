import { CommsLogisticsPanel } from '../CommsLogisticsPanel.tsx';
import { HAIL_EQUIPMENT } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface CommsLogisticsModalProps {
  onClose: () => void;
}

export function CommsLogisticsModal({ onClose }: CommsLogisticsModalProps) {
  return (
    <MissionDialog
      title="Trung tâm Liên lạc CAPCOM & Tiếp tế 80 kg"
      eyebrow="PHA 3 · EARTH–MOON LINK"
      art={HAIL_EQUIPMENT.comms}
      panelType="comms"
      dockSide="right"
      onClose={onClose}
    >
      <CommsLogisticsPanel />
    </MissionDialog>
  );
}
