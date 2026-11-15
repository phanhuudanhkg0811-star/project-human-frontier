import { useState } from 'react';
import { CheckCircle2, Rocket, ShieldAlert } from 'lucide-react';
import { playSfx } from '../../audio/sfx.ts';
import {
  selectCanOperateRover,
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
import { HailSelect } from '../HailSelect.tsx';
import { MissionDialog } from './MissionDialog.tsx';
import { useI18n } from '../../i18n/useI18n.ts';

interface ExpeditionModalProps {
  onClose: () => void;
}

const SITE_ART: Record<ExpeditionId, string> = {
  'lunar-crater': HAIL_ENV.lunarCrater,
  'regolith-field': HAIL_ENV.regolithField,
  'polar-psr': HAIL_ENV.lunarPsr,
};

export function ExpeditionModal({ onClose }: ExpeditionModalProps) {
  const { t, localize } = useI18n();
  const { gameState, bundle, dispatch } = useGameStore();
  const { selectedEquipmentIds, toggleRoverEquipment, clearRoverEquipment } = useUiStore();
  const [selectedSite, setSelectedSite] = useState<ExpeditionId>(() => {
    const { gameState: s, bundle: b } = useGameStore.getState();
    const open = b.campaign.expeditions.find(
      (e) =>
        s.clock.sol >= e.windowStartSol &&
        s.clock.sol <= e.windowEndSol &&
        !s.rover.missionHistory.some((m) => m.expeditionId === e.id)
    );
    return (open ?? b.campaign.expeditions[0]).id;
  });
  const [pickedOperator, setLaunchOperator] = useState<CrewId | null>(null);
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

  const canOperate = (id: CrewId) => selectCanOperateRover(gameState, id, bundle);
  const crewIds = Object.keys(gameState.crew) as CrewId[];
  // Default to an eligible operator instead of a hard-coded one that may be busy/tired.
  const launchOperator: CrewId =
    pickedOperator && canOperate(pickedOperator)
      ? pickedOperator
      : (crewIds.find(canOperate) ?? pickedOperator ?? crewIds[0]);
  const noOperatorAvailable = !activeMission && !crewIds.some(canOperate);
  const recoveryOperatorId: CrewId =
    canOperate(recoveryOperator) ? recoveryOperator : (crewIds.find(canOperate) ?? recoveryOperator);
  const noRecoveryOperator = !crewIds.some(canOperate);

  const handleSchedule = async () => {
    const res = await dispatch({
      type: 'rover/schedule',
      expeditionId: selectedSite,
      equipmentIds: selectedEquipmentIds,
      launchOperatorCrewId: launchOperator,
    });
    if (res.ok) {
      playSfx('launch', 0.6);
      clearRoverEquipment();
      setFeedback(localize(res.effects[0]?.message ?? '', bundle) || t('expedition.launched'));
    } else {
      setFeedback(localize(res.error.message, bundle));
    }
  };

  const handleCancel = async () => {
    const res = await dispatch({ type: 'rover/cancel-schedule' });
    if (res.ok) playSfx('click', 0.45);
    setFeedback(
      res.ok
        ? localize(res.effects[0]?.message ?? '', bundle) || t('expedition.cancelled')
        : localize(res.error.message, bundle)
    );
  };

  const handleRecoverSignal = async () => {
    const res = await dispatch({ type: 'rover/recover-signal' });
    if (res.ok) playSfx('radio', 0.55);
    setFeedback(
      res.ok
        ? localize(res.effects[0]?.message ?? '', bundle) || t('expedition.signalRestored')
        : localize(res.error.message, bundle)
    );
  };

  const handleRecoveryOperator = async () => {
    const res = await dispatch({ type: 'rover/set-recovery-operator', crewId: recoveryOperatorId });
    if (res.ok) playSfx('click', 0.45);
    setFeedback(
      res.ok
        ? localize(res.effects[0]?.message ?? '', bundle) || t('expedition.recoveryAssigned')
        : localize(res.error.message, bundle)
    );
  };

  const handleClearRecoveryOperator = async () => {
    const res = await dispatch({ type: 'rover/clear-recovery-operator' });
    if (res.ok) playSfx('click', 0.45);
    setFeedback(
      res.ok
        ? localize(res.effects[0]?.message ?? '', bundle) || t('expedition.recoveryCleared')
        : localize(res.error.message, bundle)
    );
  };

  return (
    <MissionDialog
      title={t('modal.expeditionTitle')}
      eyebrow={t('modal.expeditionEyebrow')}
      art={roverStatus === 'available' ? HAIL_ROVER.base : HAIL_ROVER.active}
      panelType="expedition"
      dockSide="right"
      onClose={onClose}
    >
      <div className="hail-expedition-panel">
        <div className="hail-lunar-map-banner">
          <img src={HAIL_ENV.lunarMap} alt="Lunar Reconnaissance Map" className="hail-lunar-map-img" />
          <div className="hail-lunar-map-overlay">
            <span className="hail-tag-pill">{t('expedition.samples', { count: samples.length })}</span>
            <span className="hail-tag-pill">
              {t('expedition.risk', { pct: Math.round(weather.roverIncidentProb * 100) })}
            </span>
          </div>
        </div>

        <div className="hail-rover-status-card">
          <div>
            <strong>{t('expedition.status', { status: roverStatus.toUpperCase() })}</strong>
            <p className="text-xs text-slate-300 mt-0.5">
              {activeMission
                ? t('expedition.activeMission', { mission: activeMission.expeditionId, sols: selectRoverRemainingSols(gameState) })
                : t('expedition.ready')}
            </p>
          </div>
        </div>

        {feedback && (
          <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
            {localize(feedback, bundle)}
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
              <span className="hail-tag-pill">{t('expedition.window', { start: expedition.windowStartSol, end: expedition.windowEndSol })}</span>
              <span className="hail-tag-pill">{t('expedition.threat', { threat: expedition.threat })}</span>
            </div>
            <p className="text-xs text-slate-300">
              {t('expedition.mitigation')} <strong>{expedition.mitigationOptions.map((option) => `${option.allOf.join(' + ')}${option.requirements?.minBatteryKWh ? ` + ${t('expedition.batteryAtLeast', { amount: option.requirements.minBatteryKWh })}` : ''}`).join(` ${t('expedition.or')} `)}</strong> →{' '}
              {threatBlocked ? (
                <span className="text-emerald-300 font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('expedition.blockedThreat')}
                </span>
              ) : (
                <span className="text-amber-300 inline-flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> {t('expedition.missingMitigation')}
                </span>
              )}
            </p>
            <p className="text-xs text-cyan-200">
              {t('expedition.reward', { sample: expedition.rewardSample, science: expedition.rewards.science, parts: expedition.rewards.partsKg, water: expedition.rewards.waterL })}
            </p>
            {siteData && (
              <p className="text-[11px] text-slate-400">
                {t('expedition.reference', { name: siteData.representativeLocation.name, lat: siteData.representativeLocation.latitudeDeg, lon: siteData.representativeLocation.longitudeDegEast, mapping: siteData.mappingProvenance })}
              </p>
            )}
          </div>
        </div>

        {/* Loadout 3 equipment */}
        <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70">
          <div className="text-xs font-semibold text-slate-200 mb-2">
            {t('expedition.loadout', { count: selectedEquipmentIds.length })}
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
              <span className="text-xs text-slate-400">{t('expedition.noEquipment')}</span>
            )}
          </div>
        </div>

        {!activeMission && (
          <HailSelect
            label={t('expedition.launchOperator')}
            value={launchOperator}
            onChange={(val) => setLaunchOperator(val as CrewId)}
            options={(Object.keys(gameState.crew) as CrewId[]).map((id) => ({
              value: id,
              label: gameState.crew[id].name,
              meta: `${gameState.crew[id].roleTag}${gameState.crew[id].assignedTask ? ` · ${t('expedition.busy')}` : ''}`,
              disabled: !canOperate(id),
            }))}
          />
        )}
        {noOperatorAvailable && (
          <p className="text-xs text-amber-300">
            Không có người trực phóng khả dụng: cần Fit, không đói, đủ tinh thần và chưa được phân công ở Pha 2. / No eligible operator: crew must be Fit, fed, with enough morale and unassigned in Phase 2.
          </p>
        )}

        <button
          type="button"
          disabled={!schedulePermission.allowed || noOperatorAvailable}
          onClick={handleSchedule}
          className="hail-btn hail-btn--accent py-2.5 flex items-center justify-center gap-2 font-bold"
        >
          <Rocket className="w-4 h-4" aria-hidden="true" />
          {inComms ? t('expedition.schedule', { site: expedition.name }) : t('expedition.phaseLock')}
        </button>
        {!schedulePermission.allowed && !activeMission && <p className="text-xs text-amber-300">{localize(schedulePermission.message ?? '', bundle)} (Sol hiện tại / current: {gameState.clock.sol})</p>}

        {activeMission?.status === 'scheduled' && (
          <button type="button" onClick={handleCancel} className="hail-btn">{t('expedition.cancel')}</button>
        )}
        {activeMission?.status === 'signal-lost' && (
          <button type="button" onClick={handleRecoverSignal} className="hail-btn hail-btn--accent">{t('expedition.recoverSignal')}</button>
        )}
        {(activeMission?.status === 'exploring' || activeMission?.status === 'recovery-pending') && activeMission.expectedReturnSol !== null && gameState.clock.sol >= activeMission.expectedReturnSol && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <HailSelect
                label={t('expedition.recoveryOperator')}
                value={recoveryOperatorId}
                onChange={(val) => setRecoveryOperator(val as CrewId)}
                options={(Object.keys(gameState.crew) as CrewId[]).map((id) => ({
                  value: id,
                  label: gameState.crew[id].name,
                  meta: `${gameState.crew[id].roleTag}${gameState.crew[id].assignedTask ? ` · ${t('expedition.busy')}` : ''}`,
                  disabled: !canOperate(id),
                }))}
              />
            </div>
            <button type="button" disabled={noRecoveryOperator} onClick={handleRecoveryOperator} className="hail-btn hail-btn--accent shrink-0">{t('expedition.assignRecovery')}</button>
            {activeMission.recoveryOperatorCrewId !== null && (
              <button type="button" onClick={handleClearRecoveryOperator} className="hail-btn shrink-0">{t('expedition.clearRecovery')}</button>
            )}
          </div>
        )}
      </div>
    </MissionDialog>
  );
}
