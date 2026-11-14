import { useState } from 'react';
import { CheckCircle2, Rocket, ShieldAlert } from 'lucide-react';
import { selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { EquipmentId, ExpeditionId } from '../../types/index.ts';
import { HAIL_ENV, HAIL_ROVER } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface ExpeditionModalProps {
  onClose: () => void;
}

const SITE_ART: Record<ExpeditionId, string> = {
  'lunar-crater': HAIL_ENV.lunarCrater,
  'regolith-field': HAIL_ENV.regolithField,
  'polar-psr': HAIL_ENV.lunarPsr,
};

export function ExpeditionModal({ onClose }: ExpeditionModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const { selectedEquipmentIds, toggleRoverEquipment, clearRoverEquipment } = useUiStore();
  const [selectedSite, setSelectedSite] = useState<ExpeditionId>('lunar-crater');
  const [feedback, setFeedback] = useState<string | null>(null);

  const inComms = gameState.clock.phase === 'comms';
  const weather = selectWeatherOutlook(gameState, bundle, 'geo');
  const expedition = bundle.campaign.expeditions.find((e) => e.id === selectedSite) ?? bundle.campaign.expeditions[0];
  const threatBlocked = expedition.requiredEquipment.every((req) => selectedEquipmentIds.includes(req));
  const ownedReadyEquipment = Object.values(gameState.equipment).filter(
    (eq) => eq.owned && eq.state !== 'damaged' && !eq.reservedForRover
  );

  const handleLaunch = async () => {
    const res = await dispatch({
      type: 'rover/launch',
      expeditionId: selectedSite,
      equipmentIds: selectedEquipmentIds,
    });
    if (res.ok) {
      clearRoverEquipment();
      setFeedback(res.effects[0]?.message ?? 'Đã phóng Rover!');
    } else {
      setFeedback(res.error.message);
    }
  };

  return (
    <MissionDialog
      title="Thám hiểm Rover Mặt Trăng (3 Sites · BlockThreat)"
      eyebrow="PHA 3 · MAX 3 THIẾT BỊ TỪ LR RACK"
      art={gameState.rover.status === 'idle' ? HAIL_ROVER.base : HAIL_ROVER.active}
      panelType="expedition"
      dockSide="right"
      onClose={onClose}
    >
      <div className="hail-expedition-panel">
        <div className="hail-lunar-map-banner">
          <img src={HAIL_ENV.lunarMap} alt="Lunar Reconnaissance Map" className="hail-lunar-map-img" />
          <div className="hail-lunar-map-overlay">
            <span className="hail-tag-pill">Mẫu thu thập: {gameState.rover.samplesCollected.length} / 3</span>
            <span className="hail-tag-pill">
              Rủi ro bão DONKI hôm nay: {Math.round(weather.roverIncidentProb * 100)}%
            </span>
          </div>
        </div>

        <div className="hail-rover-status-card">
          <div>
            <strong>Trạng thái Rover: {gameState.rover.status.toUpperCase()}</strong>
            <p className="text-xs text-slate-300 mt-0.5">
              {gameState.rover.expeditionId
                ? `Đang thám hiểm ${gameState.rover.expeditionId} (còn ${gameState.rover.solsRemaining} Sol)`
                : 'Sẵn sàng phóng từ bãi đáp Artemis (-4 kWh, cần 1 phi hành gia Fit & không Starving).'}
            </p>
          </div>
        </div>

        {feedback && (
          <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
            {feedback}
          </div>
        )}

        <div className="hail-site-tabs">
          {bundle.campaign.expeditions.map((exp) => {
            const done = gameState.rover.completedExpeditions.includes(exp.id);
            return (
              <button
                key={exp.id}
                type="button"
                onClick={() => setSelectedSite(exp.id)}
                className={`hail-site-tab ${selectedSite === exp.id ? 'is-active' : ''}`}
              >
                {exp.name} {done ? '✓' : ''}
              </button>
            );
          })}
        </div>

        <div className="hail-site-detail-card">
          <img src={SITE_ART[expedition.id]} alt={expedition.name} className="hail-site-preview-img" />
          <div className="hail-site-meta">
            <div className="hail-site-badges">
              <span className="hail-tag-pill">Cửa sổ: Sol {expedition.windowStartSol}–{expedition.windowEndSol}</span>
              <span className="hail-tag-pill">Hiểm họa: {expedition.threat}</span>
            </div>
            <p className="text-xs text-slate-300">
              Trang bị khắc chế yêu cầu: <strong>{expedition.requiredEquipment.join(', ')}</strong> →{' '}
              {threatBlocked ? (
                <span className="text-emerald-300 font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Đã chặn 100% hiểm họa địa hình
                </span>
              ) : (
                <span className="text-amber-300 inline-flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Chưa đủ đồ khắc chế
                </span>
              )}
            </p>
            <p className="text-xs text-cyan-200">
              Thưởng: Mẫu <code>{expedition.rewardSample}</code> + {expedition.rewards.partsKg}P · {expedition.rewards.oxygenKg}kg O₂ · {expedition.rewards.waterL}L Nước
            </p>
          </div>
        </div>

        {/* Loadout 3 equipment */}
        <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70">
          <div className="text-xs font-semibold text-slate-200 mb-2">
            Chọn tối đa 3 Thiết bị mang theo ({selectedEquipmentIds.length}/3):
          </div>
          <div className="flex flex-wrap gap-2">
            {ownedReadyEquipment.map((eq) => {
              const selected = selectedEquipmentIds.includes(eq.id);
              return (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => toggleRoverEquipment(eq.id as EquipmentId)}
                  className={`hail-btn text-xs ${selected ? 'hail-btn--accent' : ''}`}
                >
                  {selected ? '✓ ' : ''}{eq.id} ({eq.durability}%)
                </button>
              );
            })}
            {ownedReadyEquipment.length === 0 && (
              <span className="text-xs text-slate-400">Chưa có thiết bị khả dụng trên LR Rack.</span>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={!inComms || gameState.rover.status !== 'idle'}
          onClick={handleLaunch}
          className="hail-btn hail-btn--accent py-2.5 flex items-center justify-center gap-2 font-bold"
        >
          <Rocket className="w-4 h-4" />
          {inComms ? `Phóng Rover tới ${expedition.name} (-4 kWh)` : 'Cần ở Pha 3 (Liên lạc) để phóng Rover'}
        </button>
      </div>
    </MissionDialog>
  );
}
