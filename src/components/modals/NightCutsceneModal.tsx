import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { selectRichDebriefBreakdown } from '../../domain/debriefSelectors.ts';
import { selectDynamicDebrief, type DynamicDebriefView } from '../../domain/eventSelectors.ts';
import { selectCampaignInsights, selectSol7DebriefBranch } from '../../domain/narrativeSelectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { Locale } from '../../i18n/types.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { ContentBundle, GameState, SolSummary } from '../../types/index.ts';
import { formatPowerLoadList } from '../eventPresentation.ts';
import { DynamicSTEMBrief } from '../DynamicSTEMBrief.tsx';
import { CampaignReportCard, TrainingReport } from '../CampaignReportCard.tsx';
import { HAIL_ENV, HAIL_SVG } from '../cabin/hailAssets.ts';
import { TOUR_TARGET_IDS } from '../../onboarding/targets.ts';

function DebriefDialogBody({
  gameState,
  summary,
  debriefView,
  bundle,
  locale,
  onDismiss,
  onReset,
  onReplay,
  onReturnTitle,
}: {
  gameState: GameState;
  summary: SolSummary;
  debriefView: DynamicDebriefView;
  bundle: ContentBundle;
  locale: Locale;
  onDismiss: () => void;
  onReset: () => void;
  onReplay: () => void;
  onReturnTitle: () => void;
}) {
  const { t, pickText, localize } = useI18n();
  const uiReducedMotion = useUiStore((state) => state.reducedMotion);
  const tourActive = useUiStore((state) => state.onboarding.activeTour !== null);
  const fullText = pickText(
    debriefView.scienceBrief?.content ?? '',
    debriefView.scienceBrief?.contentEn
  );
  const prefersReduced =
    uiReducedMotion ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [length, setLength] = useState(prefersReduced ? fullText.length : 0);
  const [skip, setSkip] = useState(prefersReduced);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = dialog.current;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.requestAnimationFrame(() => {
      if (!el) return;
      const active = document.activeElement;
      if (active && el.contains(active) && active !== el) return;
      const firstFocusable = el.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) firstFocusable.focus();
      else el.focus();
    });

    let timer: number | undefined;
    if (!prefersReduced) {
      const start = performance.now();
      timer = window.setInterval(() => {
        const count = Math.min(fullText.length, Math.floor((performance.now() - start) / 14));
        setLength(count);
        if (count >= fullText.length) clearInterval(timer);
      }, 30);
    }

    return () => {
      window.cancelAnimationFrame(focusTimer);
      if (timer !== undefined) clearInterval(timer);
      if (el?.open) el.close();
      const prev = previousFocusRef.current;
      if (prev?.isConnected) prev.focus();
    };
  }, [fullText, prefersReduced]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (el.open) el.close();
    if (tourActive) {
      el.show();
    } else {
      el.showModal();
    }
  }, [tourActive]);

  const isTerminal = gameState.clock.phase === 'terminal';
  const paddedSol = String(summary.sol).padStart(2, '0');
  const sol7Branch =
    !isTerminal && summary.sol === bundle.campaign.milestones.goldenCrisisSol
      ? selectSol7DebriefBranch(gameState, bundle)
      : null;
  const finaleInsights = isTerminal ? selectCampaignInsights(gameState, bundle) : null;
  const breakdown = selectRichDebriefBreakdown(gameState);

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-modal="true"
      className={`night-cutscene hail-night-cutscene ${tourActive ? 'is-tour-modeless' : ''}`.trim()}
      aria-labelledby="night-title"
      data-locale={locale}
      onCancel={(e) => {
        e.preventDefault();
        if (!isTerminal) onDismiss();
      }}
    >
      <div className="hail-night-backdrop" aria-hidden="true">
        <img src={HAIL_ENV.spaceDeep} alt="" className="hail-night-space" draggable={false} />
        <img
          src={summary.isLunarNight ? HAIL_ENV.lunarNight : HAIL_ENV.lunarDay}
          alt=""
          className="hail-night-lunar"
          draggable={false}
        />
      </div>

      <div className="night-content">
        <p className="mission-kicker flex items-center gap-2">
          <img src={HAIL_SVG.badgeNasaStem} alt="" aria-hidden="true" className="w-4 h-4" />
          <span>{t('night.kicker', { sol: paddedSol })}</span>
        </p>

        <h2 id="night-title">
          {isTerminal
            ? gameState.campaign.status === 'victory'
              ? t('night.victoryTitle', { targetSol: bundle.campaign.targetSol })
              : t('night.defeatTitle')
            : `Sol ${paddedSol} `}
          {!isTerminal && <span>{t('night.solClosed', { temp: summary.surfaceTempC })}</span>}
        </h2>

        {gameState.campaign.endReason && (
          <p className="text-sm text-amber-300 font-semibold mt-1">{localize(gameState.campaign.endReason, bundle)}</p>
        )}

        {isTerminal && finaleInsights && (
          <section className="phf-finale-summary" aria-label="Campaign Finale">
            <div className="phf-finale-head">
              <h3>
                {finaleInsights.status === 'victory'
                  ? t('night.finaleHeadingVictory', { sol: finaleInsights.resolvedSol })
                  : t('night.finaleHeadingDefeat', { sol: finaleInsights.resolvedSol })}
              </h3>
              <span className="hail-evidence-badge">
                {t(`stem.evidence.${finaleInsights.provenance}`)}
              </span>
            </div>
            <p>
              {finaleInsights.status === 'victory'
                ? t('night.finaleSummaryVictory', {
                    sol: finaleInsights.resolvedSol,
                    rank: finaleInsights.rank ?? 'B',
                    crew: finaleInsights.activeCrew,
                    expeditions: finaleInsights.completedExpeditions,
                    totalExpeditions: finaleInsights.totalExpeditions,
                    science: finaleInsights.sciencePoints,
                    blackouts: finaleInsights.blackouts,
                  })
                : t('night.finaleSummaryDefeat', {
                    sol: finaleInsights.resolvedSol,
                    crew: finaleInsights.activeCrew,
                    expeditions: finaleInsights.completedExpeditions,
                    totalExpeditions: finaleInsights.totalExpeditions,
                    science: finaleInsights.sciencePoints,
                    blackouts: finaleInsights.blackouts,
                  })}
            </p>
            <small>{t('night.finaleSource')}</small>
          </section>
        )}

        {sol7Branch && (
          <section className="phf-night-branch-card" aria-label={t('night.sol7BranchTitle', { sol: sol7Branch.goldenCrisisSol })}>
            <div className="phf-night-branch-head">
              <h3>{t('night.sol7BranchTitle', { sol: sol7Branch.goldenCrisisSol })}</h3>
              <span className="hail-evidence-badge">{t('stem.evidence.simulated')}</span>
            </div>
            <p>
              {sol7Branch.branch === 'saved-rover'
                ? t('night.sol7BranchRover')
                : sol7Branch.branch === 'prioritized-wrs'
                  ? t('night.sol7BranchWrs')
                  : t('night.sol7BranchUnknown', { sol: sol7Branch.goldenCrisisSol })}
            </p>
            <small>
              {t('night.sol7FollowUpNote', {
                min: sol7Branch.followUpSolMin,
                max: sol7Branch.followUpSolMax,
              })}
            </small>
          </section>
        )}

        {isTerminal ? (
          <CampaignReportCard state={gameState} bundle={bundle} />
        ) : (
          summary.sol === bundle.campaign.training.reportSol && (
            <TrainingReport state={gameState} bundle={bundle} />
          )
        )}

        <dl className="night-stats">
          {[
            [t('night.statBattery'), summary.resourceDeltas.batteryKWh, 'kWh'],
            [t('night.statOxygen'), summary.resourceDeltas.oxygenKg, 'kg'],
            [t('night.statWater'), summary.resourceDeltas.waterL, 'L'],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>
                {Number(value) > 0 ? '+' : ''}
                {value}
                <small>{unit}</small>
              </dd>
            </div>
          ))}
        </dl>

        {breakdown && (
          <div className="phf-night-power-strip" aria-label={t('night.powerStripAria')}>
            <span className="phf-night-power-chip">
              <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              <span>
                {t('night.powerSummary', {
                  gen: breakdown.power.generatedKWh,
                  cons: breakdown.power.consumedKWh,
                  wrs: breakdown.power.wrsRecoveredL,
                })}
              </span>
            </span>
            {breakdown.power.blackout ? (
              <span className="phf-night-status-pill is-critical">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('night.alert.blackout')}</span>
              </span>
            ) : breakdown.power.unmetLoads.length > 0 ? (
              <span className="phf-night-status-pill is-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {t('night.alert.loadShed', {
                    loads: formatPowerLoadList(breakdown.power.unmetLoads, locale),
                  })}
                </span>
              </span>
            ) : (
              <span className="phf-night-status-pill is-ok">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('night.powerBalanced')}</span>
              </span>
            )}
          </div>
        )}

        {breakdown && breakdown.alerts.length > 0 && (
          <div className="phf-night-alert-strip" role="region" aria-label={t('night.alertsAria')}>
            {breakdown.alerts.map((alert) => {
              const params = { ...alert.params };
              if (alert.labelKey === 'night.alert.loadShed' && typeof params.loads === 'string') {
                params.loads = formatPowerLoadList(params.loads, locale);
              } else if (alert.labelKey === 'night.alert.stormDamage' && typeof params.system === 'string') {
                const sysId = params.system.trim().toLowerCase();
                if (['solar', 'recycler', 'scrubber', 'airlock'].includes(sysId)) {
                  params.system = t(`system.${sysId}`);
                }
              } else if (
                (alert.labelKey === 'night.alert.roverCompleted' || alert.labelKey === 'night.alert.roverFailed') &&
                typeof params.id === 'string'
              ) {
                const exp = bundle.campaign.expeditions.find((e) => e.id === params.id);
                if (exp) params.id = exp.name;
              }
              return (
                <span key={alert.id} className={`phf-night-alert-chip is-${alert.tone}`}>
                  <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{t(alert.labelKey, params)}</span>
                </span>
              );
            })}
          </div>
        )}

        <div className="text-xs font-mono text-slate-300 bg-slate-950/60 border border-slate-700/60 rounded p-2.5 my-2">
          <div>
            {t('night.donkiLine', { date: summary.weather.solDate })}{' '}
            <strong className="text-cyan-300">{t(`donki.${summary.weather.level}`)}</strong> ·{' '}
            {t('night.donkiDose', { dose: summary.weather.radiationDoseMgy })} ·{' '}
            {t('night.donkiRepair', { pct: Math.round(summary.weather.repairSuccessProb * 100) })}
          </div>
          {(breakdown ? breakdown.priorityHighlights : summary.highlights.slice(0, 3)).map((h, i) => (
            <div key={i} className="text-amber-200 mt-1">
              • {localize(h, bundle)}
            </div>
          ))}
          {breakdown && breakdown.hasExtraDetails && (
            <div className="phf-night-breakdown-wrap">
              <button
                type="button"
                className="phf-night-breakdown-toggle"
                aria-expanded={showBreakdown}
                onClick={() => setShowBreakdown((prev) => !prev)}
              >
                <span>
                  {showBreakdown ? t('night.hideBreakdown') : t('night.showBreakdown')}
                  {breakdown.allHighlights.length > 3
                    ? ` (${breakdown.allHighlights.length})`
                    : ''}
                </span>
                {showBreakdown ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
              </button>
              {showBreakdown && (
                <div className="phf-night-breakdown-panel">
                  <div className="phf-night-breakdown-grid">
                    <span>
                      {t('night.breakdownSources', {
                        solar: breakdown.power.solarKWh ?? '—',
                        fission: breakdown.power.fissionKWh ?? '—',
                      })}
                    </span>
                    <span>
                      {t('night.breakdownStorage', {
                        overflow: breakdown.power.batteryOverflowKWh ?? 0,
                        unmet: breakdown.power.essentialUnmetKWh ?? 0,
                        greywater: breakdown.power.wrsProcessedL ?? '—',
                      })}
                    </span>
                    <span>
                      {t('night.breakdownCrewHealth', {
                        care: breakdown.crewNeedingCareCount,
                        starving: breakdown.crewStarvingCount,
                      })}
                    </span>
                  </div>
                  {breakdown.allHighlights.length > 0 && (
                    <ul className="phf-night-breakdown-list">
                      {breakdown.allHighlights.map((h, i) => (
                        <li key={i}>• {localize(h, bundle)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div data-tour={TOUR_TARGET_IDS.DEBRIEF_BRIEF}>
          <DynamicSTEMBrief
            view={debriefView}
            bundle={bundle}
            content={
              <>
                <p aria-hidden="true" className="night-typewriter">
                  {skip ? fullText : fullText.slice(0, length)}
                  <span className="typewriter-cursor" />
                </p>
                <p className="sr-only">{fullText}</p>
              </>
            }
          />
        </div>

        <div className="night-actions driver-allowed-element">
          {!skip && length < fullText.length && (
            <button type="button" onClick={() => setSkip(true)} className="night-skip">
              {t('night.skipTypewriter')}
            </button>
          )}
          {isTerminal ? (
            <>
              <button type="button" className="mission-button" onClick={onReplay}>
                {t('night.replaySameSeed')}
              </button>
              <button type="button" className="mission-button" onClick={onReset}>
                {t('night.newSetup')}
              </button>
              <button type="button" className="night-skip" onClick={onReturnTitle}>
                {t('night.returnToTitle')}
              </button>
              <p>{t('night.seedHint')}</p>
            </>
          ) : (
            <button type="button" className="mission-button" onClick={onDismiss}>
              {t('night.wakeUpBtn', { sol: summary.sol + 1 })}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function NightCutsceneModal() {
  const { gameState, bundle, dispatch, resetCampaign } = useGameStore();
  const activeModal = useUiStore((state) => state.activeModal);
  const locale = useUiStore((state) => state.locale);
  const isDebrief = gameState.clock.phase === 'debrief' || gameState.clock.phase === 'terminal';
  const debriefView = selectDynamicDebrief(gameState, bundle);
  const summary = debriefView.summary;
  if (!isDebrief || !summary || activeModal === 'launch') return null;

  return (
    <DebriefDialogBody
      key={`${summary.sol}-${gameState.clock.phase}-${locale}`}
      gameState={gameState}
      summary={summary}
      debriefView={debriefView}
      bundle={bundle}
      locale={locale}
      onDismiss={() => {
        dispatch({ type: 'debrief/dismiss' });
      }}
      onReset={() => {
        useUiStore.getState().openModal('launch');
      }}
      onReplay={() => {
        resetCampaign({
          seed: gameState.campaign.seed,
          difficulty: gameState.campaign.difficulty,
          donkiProfileId: gameState.campaign.donkiProfileId,
          spaceWeatherOverride: gameState.campaign.spaceWeatherOverride,
        });
      }}
      onReturnTitle={() => {
        useUiStore.getState().enterTitleScreen();
      }}
    />
  );
}
