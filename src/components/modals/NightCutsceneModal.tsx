import { useEffect, useRef, useState } from 'react';
import { selectDynamicDebrief, type DynamicDebriefView } from '../../domain/eventSelectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { Locale } from '../../i18n/types.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { ContentBundle, GameState, SolSummary } from '../../types/index.ts';
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
}: {
  gameState: GameState;
  summary: SolSummary;
  debriefView: DynamicDebriefView;
  bundle: ContentBundle;
  locale: Locale;
  onDismiss: () => void;
  onReset: () => void;
  onReplay: () => void;
}) {
  const { t, pickText, localize } = useI18n();
  const uiReducedMotion = useUiStore((state) => state.reducedMotion);
  const fullText = pickText(
    debriefView.scienceBrief?.content ?? '',
    debriefView.scienceBrief?.contentEn
  );
  const prefersReduced =
    uiReducedMotion ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [length, setLength] = useState(prefersReduced ? fullText.length : 0);
  const [skip, setSkip] = useState(prefersReduced);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (el && !el.open) {
      el.showModal();
    }
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
      if (previous?.isConnected) previous.focus();
    };
  }, [fullText, prefersReduced]);

  const isTerminal = gameState.clock.phase === 'terminal';
  const paddedSol = String(summary.sol).padStart(2, '0');

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-modal="true"
      className="night-cutscene hail-night-cutscene"
      aria-labelledby="night-title"
      data-locale={locale}
      onCancel={(e) => {
        e.preventDefault();
        if (!isTerminal) onDismiss();
      }}
    >
      <div className="hail-night-backdrop" aria-hidden="true">
        <img src={HAIL_ENV.spaceDeep} alt="" className="hail-night-space" draggable={false} />
        <img src={HAIL_ENV.lunarNight} alt="" className="hail-night-lunar" draggable={false} />
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

        <div className="text-xs font-mono text-slate-300 bg-slate-950/60 border border-slate-700/60 rounded p-2.5 my-2">
          <div>
            {t('night.donkiLine', { date: summary.weather.solDate })}{' '}
            <strong className="text-cyan-300">{t(`donki.${summary.weather.level}`)}</strong> ·{' '}
            {t('night.donkiDose', { dose: summary.weather.radiationDoseMgy })} ·{' '}
            {t('night.donkiRepair', { pct: Math.round(summary.weather.repairSuccessProb * 100) })}
          </div>
          {summary.highlights.slice(0, 3).map((h, i) => (
            <div key={i} className="text-amber-200 mt-1">
              • {localize(h, bundle)}
            </div>
          ))}
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

        <div className="night-actions">
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
    />
  );
}
