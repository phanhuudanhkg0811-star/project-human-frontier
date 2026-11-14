import { useState } from 'react';
import { playSfx } from '../audio/sfx.ts';
import { selectAvailableCrew, selectCanRepair, selectWeatherOutlook } from '../domain/selectors.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { CrewId, SystemId } from '../types/index.ts';
import { HAIL_SVG, getHailSystemSprite } from './cabin/hailAssets.ts';
import { HailSelect } from './HailSelect.tsx';
import { useI18n } from '../i18n/useI18n.ts';

const SYSTEM_IDS: ReadonlyArray<SystemId> = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'];

export function SystemControls() {
  const { gameState, bundle, dispatch } = useGameStore();
  const [selectedWorker, setSelectedWorker] = useState<CrewId>('eng');
  const [feedback, setFeedback] = useState<string | null>(null);
  const availableCrew = selectAvailableCrew(gameState);
  const weather = selectWeatherOutlook(gameState, bundle, selectedWorker);
  const canEdit = gameState.clock.phase === 'engineering';
  const { t, localize } = useI18n();

  const handleAssignTask = async (task: 'repair-system' | 'upgrade-system', systemId: SystemId) => {
    const res = await dispatch({
      type: 'crew/assign',
      crewId: selectedWorker,
      task,
      targetSystemId: systemId,
    });
    if (res.ok) playSfx(task === 'upgrade-system' ? 'upgrade' : 'repair', 0.55);
    setFeedback(res.ok ? res.effects[0]?.message ?? t('systems.accepted') : res.error.message);
  };

  return (
    <section className="hail-sys-panel" aria-label={t('systems.aria')}>
      <div className="hail-sys-header">
        <div>
          <h3>{t('systems.title')}</h3>
          <p className="text-xs text-slate-300">
            {t('systems.repairOdds', { level: weather.level.toUpperCase(), pct: Math.round(weather.repairSuccessProb * 100) })}
          </p>
        </div>
        <span className={`hail-phase-tag ${canEdit ? 'is-ready' : ''}`}>
          {canEdit ? t('systems.engineeringOpen') : t('systems.currentPhase', { phase: t(`phase.${gameState.clock.phase}`) })}
        </span>
      </div>

      {/* WRS Toggle + Worker Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-3 p-2.5 rounded-lg bg-slate-900/70 border border-slate-700/70">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">{t('systems.wrsTitle')}</div>
            <div className="text-[11px] text-slate-400">
              {t('systems.wastewater', { liters: gameState.resources.wasteWaterL.toFixed(1) })}
            </div>
          </div>
          <button
            type="button"
            disabled={!canEdit && gameState.clock.phase !== 'rationing'}
            onClick={() => dispatch({ type: 'rationing/set-wrs', enabled: !gameState.dailyPlan.wrsEnabled })}
            className={`hail-btn ${gameState.dailyPlan.wrsEnabled ? 'hail-btn--accent' : ''}`}
          >
            {gameState.dailyPlan.wrsEnabled ? t('systems.wrsOn') : t('systems.wrsOff')}
          </button>
        </div>

        <HailSelect
          label={t('systems.worker')}
          value={selectedWorker}
          onChange={(val) => setSelectedWorker(val as CrewId)}
          options={Object.values(gameState.crew).map((c) => ({
            value: c.id,
            label: c.name,
            meta: `${c.roleTag}${c.assignedTask ? ` · ${t('systems.busy')}` : ''}`,
            disabled: c.condition === 'evacuated',
          }))}
        />
      </div>

      {feedback && (
        <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
          {localize(feedback, bundle)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {SYSTEM_IDS.map((systemId) => {
          const sys = gameState.systems[systemId];
          const sprite = getHailSystemSprite(systemId, sys.integrity);
          const repairPerm = selectCanRepair(gameState, systemId, bundle);
          const pendingUpgrades = Object.values(gameState.crew).filter((crew) => crew.condition !== 'evacuated'
            && crew.assignedTask?.type === 'upgrade-system' && crew.assignedTask.targetSystemId === systemId).length;
          const nextLevel = sys.level + pendingUpgrades + 1;
          const targetLvl = nextLevel <= bundle.balance.systems.maxLevel ? (String(nextLevel) as '2' | '3') : null;
          const baseUpCost = targetLvl ? bundle.balance.systems.upgradePartsByTargetLevel[targetLvl] : 0;
          const discount = selectedWorker === 'eng' && systemId !== 'fabricator' ? 1 : 0;
          const upCost = targetLvl ? Math.max(1, baseUpCost - discount) : 0;
          const workerBusy = !availableCrew.some((c) => c.id === selectedWorker);

          return (
            <div key={systemId} className={`hail-sys-card ${sys.integrity < 0.85 ? 'is-damaged' : ''}`}>
              <div className="flex items-start gap-3">
                <img src={sprite.sprite} alt="" aria-hidden="true" className="hail-sys-thumb" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm text-white truncate">{t(`system.${systemId}`)}</strong>
                    <span className="hail-level-pill">Lv{sys.level}/3</span>
                    <span className="text-[11px] font-mono text-slate-300">
                      {Math.round(sys.integrity * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t(`systems.role.${systemId}`)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60">
                <button
                  type="button"
                  disabled={!canEdit || !repairPerm.allowed || workerBusy}
                  title={repairPerm.allowed ? t('systems.repairTitle') : localize(repairPerm.message ?? '', bundle)}
                  onClick={() => handleAssignTask('repair-system', systemId)}
                  className="hail-btn hail-btn--warn w-full"
                >
                  <img src={HAIL_SVG.actRepair} alt="" className="w-3.5 h-3.5" />
                  {t('systems.repair')}
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !targetLvl || gameState.resources.partsKg < upCost || workerBusy}
                  onClick={() => handleAssignTask('upgrade-system', systemId)}
                  className="hail-btn hail-btn--accent w-full"
                >
                  <img src={HAIL_SVG.actUpgrade} alt="" className="w-3.5 h-3.5" />
                  {targetLvl ? t('systems.upgrade', { cost: upCost }) : t('systems.max')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
