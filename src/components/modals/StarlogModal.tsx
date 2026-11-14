import { useRef, useState } from 'react';
import { CheckCircle2, ScrollText } from 'lucide-react';
import { selectActiveEventView, selectEventChoicePreviews } from '../../domain/eventSelectors.ts';
import { selectWeatherOutlook } from '../../domain/selectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useGameStore } from '../../store/gameStore.ts';
import {
  eventDeadlineText,
  formatEventEffectSummary,
  getEventCategoryLabel,
  getEventResourceLabel,
} from '../eventPresentation.ts';
import type { EventResourceKey } from '../../types/index.ts';
import { getHailEventScene } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface StarlogModalProps {
  onClose: () => void;
}

export function StarlogModal({ onClose }: StarlogModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const { locale, t, pickText } = useI18n();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);
  const activeView = selectActiveEventView(gameState, bundle);
  const activeEvent = activeView?.event ?? null;
  const previews = activeEvent ? selectEventChoicePreviews(gameState, activeEvent.id, bundle) : [];
  const planningPhase = ['briefing', 'engineering', 'comms', 'rationing'].includes(gameState.clock.phase);
  const canRespondNow =
    planningPhase &&
    gameState.campaign.status === 'active' &&
    activeView !== null &&
    gameState.clock.sol <= activeView.deadlineSol;
  const weather = selectWeatherOutlook(gameState, bundle);

  const handleChoice = async (choiceId: string) => {
    if (!activeEvent || inFlight.current || !canRespondNow) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setChoiceError(null);
    setFeedback(null);
    try {
      const res = await dispatch({ type: 'event/resolve', eventId: activeEvent.id, choiceId });
      if (res.ok) setFeedback(res.effects[0]?.message ?? t('starlog.resolvedOk'));
      else setChoiceError(res.error.message);
    } catch {
      setChoiceError(t('starlog.resolveFail'));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <MissionDialog
      title={t('starlog.title', { sol: gameState.clock.sol })}
      eyebrow={t('starlog.eyebrow')}
      art={getHailEventScene(activeEvent?.art)}
      panelType="starlog"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        {/* DONKI Space Weather Card */}
        <section className="p-3 rounded-lg bg-slate-900/75 border border-cyan-500/35 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <strong className="text-cyan-300">
              {t('starlog.donkiTitle', {
                date: weather.date,
                level: t(`donki.${weather.level}`),
              })}
            </strong>
            <span className="font-mono text-[11px] text-slate-400">
              {t('starlog.donkiSample', { profile: gameState.campaign.donkiProfileId })}
            </span>
          </div>
          {weather.headline && <p className="text-amber-200 italic mb-1.5">"{weather.headline}"</p>}
          <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-slate-950/75 p-2 rounded">
            <div>
              {t('starlog.repairProb')}{' '}
              <strong className="text-emerald-300">{Math.round(weather.repairSuccessProb * 100)}%</strong>
            </div>
            <div>
              {t('starlog.roverRisk')}{' '}
              <strong className="text-amber-300">{Math.round(weather.roverIncidentProb * 100)}%</strong>
            </div>
            <div>
              {t('starlog.radiation')}{' '}
              <strong className="text-sky-300">+{weather.crewWeatherRisk.radiationDoseMgy} mGy</strong>
            </div>
          </div>
        </section>

        {feedback && (
          <div
            role="status"
            className="text-xs px-3 py-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback}
          </div>
        )}
        {choiceError && (
          <p role="alert" className="hail-event-error">
            {choiceError}
          </p>
        )}

        {/* Active Event */}
        {activeEvent && activeView ? (
          <section
            className={`hail-event-banner hail-event-detail--${activeEvent.category}`}
            aria-busy={isSubmitting}
          >
            <img src={getHailEventScene(activeEvent.art)} alt="" className="hail-event-banner-img" />
            <div className="p-3 flex flex-col gap-2">
              <span className="hail-event-banner-badge">
                {getEventCategoryLabel(activeEvent.category, locale)}
              </span>
              <h3 className="text-base font-bold text-white">
                {pickText(activeEvent.title, activeEvent.titleEn)}
              </h3>
              <div className="hail-event-metadata">
                <span>
                  {activeView.mandatory ? t('starlog.mandatoryDetail') : t('starlog.optionalDetail')}
                </span>
                <span>{t('events.priorityLabel', { priority: activeView.priority })}</span>
                <strong className="hail-event-deadline">
                  {eventDeadlineText(activeView, gameState.clock.sol, locale)}
                </strong>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickText(activeEvent.prompt, activeEvent.promptEn)}
              </p>
              {!canRespondNow && <p className="hail-event-error">{t('starlog.cannotRespond')}</p>}
              <div className="flex flex-col gap-2 mt-2">
                {previews.map((preview) => {
                  const ch = preview.choice;
                  const choiceLabel = pickText(ch.label, ch.labelEn);
                  const reasonsId = `event-choice-${ch.id}-reasons`;
                  return (
                    <article
                      key={ch.id}
                      className={`hail-event-choice ${!preview.allowed ? 'is-blocked' : ''}`}
                    >
                      <h4>{choiceLabel}</h4>
                      <div className="hail-event-costs" aria-label={t('starlog.costsAria')}>
                        {Object.entries(preview.resourceDeltas).map(([resource, delta]) => (
                          <span key={resource}>
                            {getEventResourceLabel(resource as EventResourceKey, locale)}:{' '}
                            <strong>
                              {Number(delta) > 0 ? '+' : ''}
                              {delta}
                            </strong>
                          </span>
                        ))}
                        {preview.scienceDelta !== 0 && (
                          <span>
                            {t('starlog.scienceLabel')}{' '}
                            <strong>
                              {preview.scienceDelta > 0 ? '+' : ''}
                              {preview.scienceDelta}
                            </strong>
                          </span>
                        )}
                        {Object.keys(preview.resourceDeltas).length === 0 && preview.scienceDelta === 0 && (
                          <span>{t('starlog.noDirectResource')}</span>
                        )}
                      </div>
                      {preview.effectsSummary.length > 0 && (
                        <ul className="hail-event-effects" aria-label={t('starlog.effectsAria')}>
                          {preview.effectsSummary.map((effect, index) => (
                            <li key={index}>{formatEventEffectSummary(effect, locale)}</li>
                          ))}
                        </ul>
                      )}
                      {preview.blockedReasons.length > 0 && (
                        <ul id={reasonsId} className="hail-event-blocked" aria-label={t('starlog.blockedAria')}>
                          {preview.blockedReasons.map((reason, index) => (
                            <li key={index}>{formatEventEffectSummary(reason, locale)}</li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        className="hail-btn hail-choice-card"
                        disabled={!preview.allowed || !canRespondNow || isSubmitting}
                        aria-describedby={preview.blockedReasons.length > 0 ? reasonsId : undefined}
                        onClick={() => handleChoice(ch.id)}
                      >
                        {isSubmitting
                          ? t('starlog.submitting')
                          : t('starlog.choosePrefix', { label: choiceLabel })}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            {t('starlog.emptyEvents')}
          </div>
        )}

        {/* History Logs */}
        <section className="crt-terminal-screen p-3 rounded-lg">
          <div className="text-xs font-bold text-cyan-300 mb-2 flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            {t('starlog.logsTitle')}
          </div>
          <div className="max-h-36 overflow-y-auto flex flex-col gap-1 text-[11px] font-mono">
            {gameState.history.logs.slice(-8).reverse().map((log, i) => (
              <div key={i} className="text-slate-300">
                <span className="text-cyan-400">
                  [Sol {log.sol} · {log.phase}]
                </span>{' '}
                {log.message}
              </div>
            ))}
          </div>
        </section>
      </div>
    </MissionDialog>
  );
}
