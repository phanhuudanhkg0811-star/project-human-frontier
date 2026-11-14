import { useState } from 'react';
import { CheckCircle2, Rocket, ShieldAlert } from 'lucide-react';
import {
  selectCanScheduleExpedition,
  selectCompletedExpeditions,
  selectMitigationSatisfied,
  selectRoverRemainingSols,
  selectRoverSamples,
  selectRoverStatus,
  selectWeatherOutlook,
} from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { CrewId, EquipmentId, ExpeditionId } from '../../types/index.ts';
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
  const [launchOperator, setLaunchOperator] = useState<CrewId>('geo');
  const [recoveryOperator, setRecoveryOperator] = useState<CrewId>('geo');
  const [feedback, setFeedback] = useState<string | null>(null);

  const inComms = gameState.clock.phase === 'comms';
  const weather = selectWeatherOutlook(gameState, bundle, 'geo');
  const expedition = bundle.campaign.expeditions.find((e) => e.id === selectedSite) ?? bundle.campaign.expeditions[0];
  const siteData = bundle.lunarSites.find((site) => site.expeditionId === expedition.id);
  const threatBlocked = selectMitigationSatisfied(gameState, bundle, expedition.id, selectedEquipmentIds);
  const roverStatus = selectRoverStatus(gameState);
  const samples = selectRoverSamples(gameState);
  const completed = selectCompletedExpeditions(gameState);
  const schedulePermission = selectCanScheduleExpedition(gameState, bundle, selectedSite);
  const activeMission = gameState.rover.activeMission;
  const ownedReadyEquipment = Object.values(gameState.equipment).filter(
    (eq) => eq.owned && eq.state !== 'damaged' && !eq.reservedForRover
  );

  const handleSchedule = async () => {
    const res = await dispatch({
      type: 'rover/schedule',
      expeditionId: selectedSite,
      equipmentIds: selectedEquipmentIds,
      launchOperatorCrewId: launchOperator,
    });
    if (res.ok) {
      clearRoverEquipment();
      setFeedback(res.effects[0]?.message ?? 'Đã phóng Rover!');
    } else {
      setFeedback(res.error.message);
    }
  };

  const handleCancel = async () => {
    const res = await dispatch({ type: 'rover/cancel-schedule' });
    setFeedback(res.ok ? res.effects[0]?.message ?? 'Đã hủy lịch.' : res.error.message);
  };

  const handleRecoverSignal = async () => {
    const res = await dispatch({ type: 'rover/recover-signal' });
    setFeedback(res.ok ? res.effects[0]?.message ?? 'Đã khôi phục tín hiệu.' : res.error.message);
  };

  const handleRecoveryOperator = async () => {
    const res = await dispatch({ type: 'rover/set-recovery-operator', crewId: recoveryOperator });
    setFeedback(res.ok ? res.effects[0]?.message ?? 'Đã phân công thu hồi.' : res.error.message);
  };

  return (
    <MissionDialog
      title="Thám hiểm Rover Mặt Trăng (3 Sites · BlockThreat)"
      eyebrow="PHA 3 · MAX 3 THIẾT BỊ TỪ LR RACK"
      art={roverStatus === 'available' ? HAIL_ROVER.base : HAIL_ROVER.active}
      panelType="expedition"
      dockSide="right"
      onClose={onClose}
    >
      <div className="hail-expedition-panel">
        <div className="hail-lunar-map-banner">
          <img src={HAIL_ENV.lunarMap} alt="Lunar Reconnaissance Map" className="hail-lunar-map-img" />
          <div className="hail-lunar-map-overlay">
            <span className="hail-tag-pill">Mẫu thu thập: {samples.length} / 3</span>
            <span className="hail-tag-pill">
              Rủi ro bão DONKI hôm nay: {Math.round(weather.roverIncidentProb * 100)}%
            </span>
          </div>
        </div>

        <div className="hail-rover-status-card">
          <div>
            <strong>Trạng thái Rover: {roverStatus.toUpperCase()}</strong>
            <p className="text-xs text-slate-300 mt-0.5">
              {activeMission
                ? `Nhiệm vụ ${activeMission.expeditionId} (còn khoảng ${selectRoverRemainingSols(gameState)} Sol)`
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
            const done = completed.includes(exp.id);
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
              Trang bị khắc chế (OR): <strong>{expedition.mitigationOptions.map((option) => `${option.allOf.join(' + ')}${option.requirements?.minBatteryKWh ? ` + Pin ≥ ${option.requirements.minBatteryKWh} kWh` : ''}`).join(' HOẶC ')}</strong> →{' '}
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
              Thưởng: Mẫu <code>{expedition.rewardSample}</code> + {expedition.rewards.science} Science · {expedition.rewards.partsKg}P · {expedition.rewards.waterL}L Nước
            </p>
            {siteData && (
              <p className="text-[11px] text-slate-400">
                Điểm tham chiếu: {siteData.representativeLocation.name} ({siteData.representativeLocation.latitudeDeg}°, {siteData.representativeLocation.longitudeDegEast}°E) · Địa hình LOLA · Nhiệt Diviner. Mapping gameplay: {siteData.mappingProvenance}.
              </p>
            )}
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

        {!activeMission && (
          <label className="text-xs text-slate-200 flex items-center gap-2">
            Người trực phóng
            <select value={launchOperator} onChange={(event) => setLaunchOperator(event.target.value as CrewId)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1">
              {(Object.keys(gameState.crew) as CrewId[]).map((id) => <option key={id} value={id}>{gameState.crew[id].name}</option>)}
            </select>
          </label>
        )}

        <button
          type="button"
          disabled={!schedulePermission.allowed}
          onClick={handleSchedule}
          className="hail-btn hail-btn--accent py-2.5 flex items-center justify-center gap-2 font-bold"
        >
          <Rocket className="w-4 h-4" />
          {inComms ? `Lập lịch Rover tới ${expedition.name} (4 kWh tại End-Sol)` : 'Cần ở Pha 3 (Liên lạc) để lập lịch Rover'}
        </button>
        {!schedulePermission.allowed && !activeMission && <p className="text-xs text-amber-300">{schedulePermission.message}</p>}

        {activeMission?.status === 'scheduled' && (
          <button type="button" onClick={handleCancel} className="hail-btn">Hủy lịch Rover</button>
        )}
        {activeMission?.status === 'signal-lost' && (
          <button type="button" onClick={handleRecoverSignal} className="hail-btn hail-btn--accent">Khôi phục tín hiệu</button>
        )}
        {(activeMission?.status === 'exploring' || activeMission?.status === 'recovery-pending') && activeMission.expectedReturnSol !== null && gameState.clock.sol >= activeMission.expectedReturnSol && (
          <div className="flex items-center gap-2">
            <select value={recoveryOperator} onChange={(event) => setRecoveryOperator(event.target.value as CrewId)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs">
              {(Object.keys(gameState.crew) as CrewId[]).map((id) => <option key={id} value={id}>{gameState.crew[id].name}</option>)}
            </select>
            <button type="button" onClick={handleRecoveryOperator} className="hail-btn hail-btn--accent">Phân công thu hồi</button>
          </div>
        )}
      </div>
    </MissionDialog>
  );
}
