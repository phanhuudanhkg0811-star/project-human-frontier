import { useRef, useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import { selectFiveSolResourceTrend, selectResourceForecast } from '../../domain/selectors.ts';
import { selectDynamicDebrief } from '../../domain/eventSelectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { DynamicSTEMBrief } from '../DynamicSTEMBrief.tsx';
import { NightReadinessChecklist } from '../NightReadinessChecklist.tsx';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId, PowerConsumerId } from '../../types/index.ts';
import { getHailCrewVisual, HAIL_TACTILE_UI } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

const CREW_IDS: readonly CrewId[] = ['cmd', 'eng', 'doc', 'geo'];

const SHORT_LOAD_LABEL: Record<PowerConsumerId, string> = {
  eclss: 'ECLSS',
  wrs: 'WRS',
  fabricator: 'FAB',
  rover: 'ROVER',
};

export function EndOfDayModal({
  onStarlog,
  onComms,
  onClose,
}: {
  onStarlog?: () => void;
  onComms?: () => void;
  onClose: () => void;
}) {
  const { gameState, bundle, dispatch } = useGameStore();
  const { t, locale, localize } = useI18n();
  const [leverPulledSol, setLeverPulledSol] = useState<number | null>(null);
  const [errorState, setErrorState] = useState<{ sol: number; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const sol = gameState.clock.sol;
  const leverPulled = leverPulledSol === sol;
  const errorMsg = errorState?.sol === sol ? errorState.message : null;
  const setErrorMsg = (message: string | null) => {
    setErrorState(message ? { sol, message } : null);
  };
  const ended = gameState.campaign.status !== 'active' || gameState.clock.phase === 'terminal';
  const pendingEvent = gameState.events.activeEventId
    ? bundle.events.find((e) => e.id === gameState.events.activeEventId) ?? null
    : null;
  const mustResolveEvent = Boolean(pendingEvent?.mandatory && gameState.clock.phase === 'briefing');
  const inRationing = gameState.clock.phase === 'rationing' && !ended;
  const canPullLever = inRationing && !mustResolveEvent && !leverPulled && !isSubmitting;

  const preview = selectResourceForecast(gameState, bundle);
  const fiveSolTrend = selectFiveSolResourceTrend(gameState, bundle, 5);
  const debriefView = selectDynamicDebrief(gameState, bundle);

  const prepareRations = async () => {
    playSfx('click', 0.45);
    setErrorMsg(null);
    for (let i = 0; i < 3; i += 1) {
      const state = useGameStore.getState().gameState;
      if (state.clock.phase === 'rationing' || state.clock.phase === 'terminal') {
        break;
      }
      const res = await dispatch({ type: 'phase/advance' });
      if (!res.ok) {
        setErrorMsg(res.error.message);
        break;
      }
    }
  };

  const promotePriority = async (idx: number) => {
    if (!inRationing || isSubmitting || idx <= 0) return;
    playSfx('click', 0.4);
    const copy = [...gameState.dailyPlan.powerPriority];
    const tmp = copy[idx - 1];
    copy[idx - 1] = copy[idx];
    copy[idx] = tmp;
    const res = await dispatch({ type: 'rationing/set-power-priority', order: copy });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handleToggleMre = async (crewId: CrewId) => {
    if (!inRationing || isSubmitting) return;
    playSfx('click', 0.45);
    const res = await dispatch({ type: 'rationing/toggle-mre', crewId });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handleToggleWrs = async () => {
    if (!inRationing || isSubmitting) return;
    playSfx('click', 0.45);
    const res = await dispatch({
      type: 'rationing/set-wrs',
      enabled: !gameState.dailyPlan.wrsEnabled,
    });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handlePullLever = async () => {
    if (!canPullLever || inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setLeverPulledSol(sol);
    setErrorMsg(null);
    playSfx('endSol', 0.7);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const res = await dispatch({ type: 'sol/end' });
      if (res.ok) {
        onClose();
      } else {
        setLeverPulledSol(null);
        setErrorMsg(res.error.message);
      }
    } catch {
      setLeverPulledSol(null);
      setErrorMsg(t('endDay.submitError'));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <MissionDialog
      title={t('endDay.title', { sol })}
      eyebrow="ALLOCATION"
      panelType="end"
      tactileFrame
      onClose={onClose}
    >
      <section
        className="hail-tactile-frame hail-tactile-frame--allocation"
        aria-label={t('endDay.tactileAria')}
      >
        <img
          src={HAIL_TACTILE_UI.allocationFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Left Main Screen: 4-Astronaut MRE Allocation & Predictor */}
        <div className="hail-alloc-main-screen">
          <header className="hail-term-topbar">
            <div className="hail-term-title-group">
              <span className="hail-term-code">
                {t('endDay.allocCode', { count: gameState.resources.mrePacks })}
              </span>
              <h2 className="hail-term-title">{t('endDay.allocTitle')}</h2>
            </div>

            <div className="hail-alloc-phase-cmds">
              {mustResolveEvent && (
                <button
                  type="button"
                  className="hail-term-inline-cmd is-warn"
                  onClick={() => {
                    playSfx('click', 0.45);
                    onStarlog?.();
                  }}
                >
                  {t('endDay.resolveIncidentCmd')}
                </button>
              )}
              {!mustResolveEvent && !inRationing && !ended && (
                <>
                  <button
                    type="button"
                    className="hail-term-inline-cmd"
                    onClick={() => {
                      playSfx('radioOn', 0.45);
                      onComms?.();
                    }}
                  >
                    {t('endDay.commsCmd')}
                  </button>
                  <button
                    type="button"
                    className="hail-term-inline-cmd is-primary"
                    onClick={prepareRations}
                  >
                    {t('endDay.advanceToRationingCmd')}
                  </button>
                </>
              )}
            </div>
          </header>

          {errorMsg && (
            <p className="hail-term-plain-line is-warn">{t('endDay.errorPrefix', { message: localize(errorMsg, bundle) })}</p>
          )}

          {/* 4-Crew Columns with Dynamic 3-State Portraits + Square Checkboxes */}
          <div className="hail-alloc-crew-grid">
            {CREW_IDS.map((crewId) => {
              const member = gameState.crew[crewId];
              const evacuated = member.condition === 'evacuated';
              const giveMre = !evacuated && gameState.dailyPlan.mreTargets.includes(crewId);
              const isRationCut = inRationing && !giveMre;
              const vis = getHailCrewVisual(crewId, member, isRationCut, locale);

              return (
                <div
                  key={crewId}
                  className={`hail-alloc-crew-col ${evacuated ? 'is-evacuated' : ''}`}
                >
                  <div className="hail-alloc-crew-head">
                    <img
                      src={vis.portrait}
                      alt={`${member.name} (${vis.stateLabel})`}
                      className="hail-alloc-avatar"
                      draggable={false}
                    />
                    <div className="hail-alloc-crew-meta">
                      <strong>{member.name.split(' ')[0]}</strong>
                      <span>
                        {evacuated
                          ? t('endDay.evacuated')
                          : t('endDay.crewMeta', { health: member.health, state: vis.stateLabel })}
                      </span>
                    </div>
                  </div>

                  <div className="hail-alloc-checks">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={giveMre}
                      aria-label={t('endDay.issueMreAria', { name: member.name })}
                      className="hail-alloc-check-btn"
                      disabled={!inRationing || evacuated || isSubmitting}
                      onClick={() => handleToggleMre(crewId)}
                    >
                      <img
                        src={
                          giveMre
                            ? HAIL_TACTILE_UI.checkboxChecked
                            : HAIL_TACTILE_UI.checkboxUnchecked
                        }
                        alt=""
                        className="hail-alloc-checkbox-img"
                        draggable={false}
                      />
                      <span>{giveMre ? t('endDay.issueMreCheck') : t('endDay.cutMreCheck')}</span>
                    </button>

                    <div className="hail-alloc-crew-statline">
                      <span>{t('endDay.satietyLabel', { satiety: member.satiety })}</span>
                      <span className={member.hungerState === 'starving' ? 'is-crit' : ''}>
                        {member.hungerState.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom WRS + Power Priority + End-Sol Forecast */}
          <footer className="hail-alloc-footer">
            <div className="hail-alloc-toggles">
              <button
                type="button"
                role="checkbox"
                aria-checked={gameState.dailyPlan.wrsEnabled}
                className="hail-alloc-sys-check"
                disabled={!inRationing || isSubmitting}
                onClick={handleToggleWrs}
              >
                <img
                  src={
                    gameState.dailyPlan.wrsEnabled
                      ? HAIL_TACTILE_UI.checkboxChecked
                      : HAIL_TACTILE_UI.checkboxUnchecked
                  }
                  alt=""
                  draggable={false}
                />
                <span>{gameState.dailyPlan.wrsEnabled ? 'WRS 90% ON' : 'WRS OFF'}</span>
              </button>

              <div className="hail-alloc-priority-row" aria-label={t('endDay.priorityAria')}>
                <span className="hail-alloc-priority-lbl">{t('endDay.priorityLbl')}</span>
                {gameState.dailyPlan.powerPriority.map((id, idx) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!inRationing || idx === 0 || isSubmitting}
                    onClick={() => promotePriority(idx)}
                    title={
                      idx === 0
                        ? t('endDay.priorityFirstTitle', { name: SHORT_LOAD_LABEL[id] })
                        : t('endDay.priorityPromoteTitle', { name: SHORT_LOAD_LABEL[id], rank: idx })
                    }
                    className="hail-alloc-priority-pill"
                  >
                    {idx + 1}.{SHORT_LOAD_LABEL[id]}
                    {idx > 0 ? '↑' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="hail-alloc-predictor-row">
              <p className="hail-alloc-summary-line">
                {t('endDay.forecastLine', {
                  sol,
                  battery: `${preview.resourceDeltas.batteryKWh >= 0 ? '+' : ''}${preview.resourceDeltas.batteryKWh}`,
                  oxygen: preview.resourceDeltas.oxygenKg,
                  water: preview.resourceDeltas.waterL,
                })}
                {preview.blackout ? t('endDay.blackoutTag') : ''}
              </p>
              <div className="hail-alloc-trend-chips">
                {fiveSolTrend.slice(0, 4).map((pt) => (
                  <span key={pt.sol}>
                    S{pt.sol}:⚡{pt.batteryKWh.toFixed(0)}/💧{pt.waterL.toFixed(0)}
                  </span>
                ))}
              </div>
            </div>

            <details className="hail-alloc-debrief-drawer">
              <summary>
                {debriefView.summary
                  ? t('endDay.debriefSummaryDone', { sol: debriefView.summary.sol })
                  : t('endDay.debriefSummaryLatest')}
              </summary>
              <div className="flex flex-col gap-2 mt-2">
                <NightReadinessChecklist state={gameState} bundle={bundle} />
                <DynamicSTEMBrief view={debriefView} bundle={bundle} />
              </div>
            </details>
          </footer>
        </div>

        {/* Right Top Sol Counter Display */}
        <div className="hail-alloc-sol-box">
          <span className="hail-mini-label">{t('endDay.solCycleLabel')}</span>
          <strong className="hail-alloc-sol-num">
            {ended ? t('endDay.solCycleDone') : `${String(sol).padStart(2, '0')} → ${String(sol + 1).padStart(2, '0')}`}
          </strong>
        </div>

        {/* Right End-Sol Physical Lever Bay */}
        <div className="hail-alloc-lever-bay">
          <button
            type="button"
            className={`hail-lever-btn ${leverPulled ? 'is-pulled' : ''}`}
            disabled={!canPullLever}
            aria-label={t('endDay.leverAria')}
            title={
              canPullLever
                ? t('endDay.leverTitleReady', { sol })
                : mustResolveEvent
                  ? t('endDay.leverTitleResolve')
                  : t('endDay.leverTitleLocked')
            }
            onClick={handlePullLever}
          >
            <img
              src={leverPulled ? HAIL_TACTILE_UI.leverDown : HAIL_TACTILE_UI.leverUp}
              alt={leverPulled ? t('endDay.leverAltDown') : t('endDay.leverAltUp')}
              draggable={false}
            />
            <span className="hail-lever-caption">
              {isSubmitting || leverPulled
                ? t('endDay.leverSubmitting')
                : canPullLever
                  ? t('endDay.leverAction', { sol })
                  : t('endDay.leverLocked')}
            </span>
          </button>
        </div>

        {/* Close Frame Button */}
        <button
          type="button"
          className="hail-tactile-corner-close"
          aria-label={t('endDay.closeAria')}
          onClick={() => {
            playSfx('click', 0.4);
            onClose();
          }}
        >
          <img src={HAIL_TACTILE_UI.btnClose} alt="×" draggable={false} />
        </button>
      </section>
    </MissionDialog>
  );
}
