import { selectCampaignReport, selectTrainingReport } from '../domain/campaignSelectors.ts';
import { selectCampaignInsights } from '../domain/narrativeSelectors.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { buildSaveEnvelope } from '../persistence/saveAdapter.ts';
import { downloadArtifact } from '../persistence/downloadArtifact.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { ContentBundle, GameState } from '../types/index.ts';
import { NightReadinessChecklist } from './NightReadinessChecklist.tsx';

export function ArtifactExportButtons() {
  const { gameState, replayTrace } = useGameStore();
  const { t } = useI18n();
  return (
    <div className="campaign-export-actions">
      <button
        type="button"
        className="hail-btn"
        onClick={() =>
          downloadArtifact(
            `moon32-save-${gameState.campaign.seed}-sol${gameState.clock.sol}.json`,
            buildSaveEnvelope(gameState)
          )
        }
      >
        {t('report.exportSave')}
      </button>
      <button
        type="button"
        className="hail-btn"
        onClick={() => downloadArtifact(`moon32-replay-${gameState.campaign.seed}.json`, replayTrace)}
      >
        {t('report.exportReplay')}
      </button>
      <p>
        {replayTrace?.coverage === 'full-campaign'
          ? t('report.exportNoteFull')
          : t('report.exportNotePartial')}
      </p>
    </div>
  );
}

export function TrainingReport({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const { t } = useI18n();
  const report = selectTrainingReport(state, bundle);
  if (!report) return null;

  const localizedChecks = [
    {
      label: t('report.trainingCheckCrew', { min: bundle.campaign.training.minActiveCrew }),
      met: report.checks[0]?.met ?? null,
    },
    {
      label: t('report.trainingCheckExpedition', { min: bundle.campaign.training.minExpeditions }),
      met: report.checks[1]?.met ?? null,
    },
  ];

  const showReadinessGap =
    state.campaign.status === 'active' &&
    state.clock.sol < bundle.campaign.milestones.lunarNight.startSol;

  return (
    <section className="campaign-report" aria-label="Training Report">
      <h3>{t('report.trainingTitle', { sol: report.sol })}</h3>
      <p>{t('report.trainingSubtitle', { targetSol: bundle.campaign.targetSol })}</p>
      <ul>
        {localizedChecks.map((check) => (
          <li key={check.label}>
            {check.met === null ? t('common.noData') : check.met ? t('common.met') : t('common.unmet')} ·{' '}
            {check.label}
          </li>
        ))}
      </ul>
      {showReadinessGap && (
        <div className="phf-training-readiness-gap">
          <h4>{t('report.trainingGapTitle', { nightStart: bundle.campaign.milestones.lunarNight.startSol })}</h4>
          <p className="text-xs text-slate-300 mb-2">{t('report.trainingGapSubtitle')}</p>
          <NightReadinessChecklist state={state} bundle={bundle} />
        </div>
      )}
    </section>
  );
}

export function CampaignReportCard({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const { locale, t, pickText, localize } = useI18n();
  const report = selectCampaignReport(state, bundle);
  const insights = selectCampaignInsights(state, bundle);
  const outcome = report.outcome;

  const requirementLabels: Record<string, string> = {
    'end-sol': t('report.req.endSol'),
    'active-crew': t('report.req.activeCrew'),
    'positive-oxygen': t('report.req.positiveOxygen'),
    'positive-water': t('report.req.positiveWater'),
  };

  const localizedLesson =
    locale === 'en'
      ? outcome?.reasonCode === 'oxygen-depleted'
        ? t('report.lesson.oxygenDepleted')
        : outcome?.reasonCode === 'water-depleted'
          ? t('report.lesson.waterDepleted')
          : outcome?.reasonCode === 'crew-collapse'
            ? t('report.lesson.crewCollapse')
            : outcome?.reasonCode === 'final-requirements-unmet'
              ? t('report.lesson.finalRequirements')
              : t('report.lesson.default')
      : report.lesson;

  const statusText = state.campaign.status === 'victory' ? t('report.victory') : t('report.defeat');
  const wrsDetail =
    report.wrs.efficiency === null
      ? t('report.wrsNoData')
      : t('report.wrsStats', {
        pct: (report.wrs.efficiency * 100).toFixed(1),
        recovered: report.wrs.recoveredL.toFixed(2),
        processed: report.wrs.processedL.toFixed(2),
      });

  return (
    <section className="campaign-report" aria-label="NASA Cadet Report Card">
      <div className="phf-report-header">
        <h3>{t('report.cardTitle', { status: statusText })}</h3>
        <span className="hail-evidence-badge">{t(`stem.evidence.${insights.provenance}`)}</span>
      </div>
      <p className="campaign-rank">
        {outcome?.rank ? t('report.rankValue', { rank: outcome.rank }) : t('report.unranked')}
      </p>
      {outcome?.reasonCode === 'legacy-outcome' && <p>{t('report.legacyOutcome')}</p>}
      <p>
        {t('common.seed')} {report.seed} · {report.difficulty} · {report.profile}
      </p>

      <div className="phf-report-insights">
        <div className="phf-report-insight-col">
          <h4>{t('report.causesTitle')}</h4>
          <ul>
            {insights.causes.map((cause) => (
              <li key={cause.code}>{t(cause.code, cause.params)}</li>
            ))}
          </ul>
        </div>
        <div className="phf-report-insight-col">
          <h4>{t('report.recommendationsTitle')}</h4>
          <ul>
            {insights.recommendations.map((rec) => (
              <li key={rec.code}>{t(rec.code, rec.params)}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-slate-400">{t('report.simulatedNote')}</p>

      <ul>
        {outcome?.requirements.map((requirement) => (
          <li key={requirement.id}>
            {requirement.met ? t('common.met') : t('common.unmet')} ·{' '}
            {requirementLabels[requirement.id] ?? requirement.id}: {requirement.actual}
            {requirement.id === 'end-sol' || requirement.id === 'active-crew'
              ? ` / ${requirement.target}`
              : ''}
          </li>
        ))}
      </ul>
      <p>
        {t('report.expeditionLine', {
          completed: insights.completedExpeditions,
          total: insights.totalExpeditions,
          science: insights.sciencePoints,
          blackouts: insights.blackouts,
        })}
      </p>
      <ul>
        {report.crew.map((crew) => (
          <li key={crew.id}>
            {t('report.crewLine', {
              name: crew.name,
              condition: t(`report.crewCondition.${crew.condition}`),
              health: crew.health,
              morale: crew.morale,
              satiety: crew.satiety,
            })}
          </li>
        ))}
      </ul>
      <p>
        {t('report.finalResources', {
          battery: report.resources.batteryKWh,
          oxygen: report.resources.oxygenKg,
          water: report.resources.waterL,
          parts: report.resources.partsKg,
          mre: report.resources.mrePacks,
        })}
      </p>
      <details>
        <summary>{t('report.systemsSummary')}</summary>
        <ul>
          {report.systems.map((system) => (
            <li key={system.id}>
              {t('report.systemLine', {
                name: t(`system.${system.id}`),
                level: system.level,
                pct: (system.integrity * 100).toFixed(0),
                status: t(`report.systemStatus.${system.status}`),
              })}
            </li>
          ))}
        </ul>
      </details>
      <p>
        {t('report.wrsLine', {
          detail: wrsDetail,
          measured: report.wrs.measuredSols,
          total: report.wrs.totalSols,
        })}
      </p>
      <details>
        <summary>{t('report.rubricSummary', { version: report.rubric.version })}</summary>
        <p>
          {t('report.rubricDetail', {
            sCrew: report.rubric.S.minFitCrew,
            sExp: report.rubric.S.minExpeditions,
            aCrew: report.rubric.A.minActiveCrew,
            aExp: report.rubric.A.minExpeditions,
          })}
        </p>
        <p>{t('report.rubricNote')}</p>
      </details>
      <TrainingReport state={state} bundle={bundle} />
      <details>
        <summary>{t('report.timelineSummary')}</summary>
        <ol>
          {report.timeline.map((entry) => (
            <li key={entry.sol}>
              Sol {entry.sol}: {entry.highlights.map((h) => localize(h, bundle)).join(' ')}
            </li>
          ))}
        </ol>
        <ul>
          {report.choices.map((choice, index) => {
            const event = bundle.events.find((entry) => entry.id === choice.eventId);
            const selected = event?.choices.find((entry) => entry.id === choice.choiceId);
            const eventTitle = event
              ? pickText(event.title, event.titleEn)
              : t('report.legacyEventTitle');
            const choiceLabel = selected
              ? pickText(selected.label, selected.labelEn)
              : choice.outcome === 'expired'
                ? t('report.choiceExpired')
                : t('report.choiceNoData');
            return (
              <li key={`${choice.eventId}-${index}`}>
                Sol {choice.settledSol}: {eventTitle} · {choiceLabel}
              </li>
            );
          })}
        </ul>
      </details>
      <p>{t('report.lessonPrefix', { lesson: localizedLesson })}</p>
      <ArtifactExportButtons />
    </section>
  );
}
