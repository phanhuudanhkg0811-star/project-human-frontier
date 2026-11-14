import { selectCampaignReport, selectTrainingReport } from '../domain/campaignSelectors.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { buildSaveEnvelope } from '../persistence/saveAdapter.ts';
import { downloadArtifact } from '../persistence/downloadArtifact.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { ContentBundle, GameState } from '../types/index.ts';

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
  const { locale, t } = useI18n();
  const report = selectTrainingReport(state, bundle);
  if (!report) return null;

  const localizedChecks =
    locale === 'en'
      ? [
          {
            label: t('report.trainingCheckCrew', { min: bundle.campaign.training.minActiveCrew }),
            met: report.checks[0]?.met ?? null,
          },
          {
            label: t('report.trainingCheckExpedition', { min: bundle.campaign.training.minExpeditions }),
            met: report.checks[1]?.met ?? null,
          },
        ]
      : report.checks;

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
    </section>
  );
}

export function CampaignReportCard({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const { locale, t, pickText } = useI18n();
  const report = selectCampaignReport(state, bundle);
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
      <h3>{t('report.cardTitle', { status: statusText })}</h3>
      <p className="campaign-rank">
        {outcome?.rank ? t('report.rankValue', { rank: outcome.rank }) : t('report.unranked')}
      </p>
      {outcome?.reasonCode === 'legacy-outcome' && <p>{t('report.legacyOutcome')}</p>}
      <p>
        {t('common.seed')} {report.seed} · {report.difficulty} · {report.profile}
      </p>
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
          completed: report.expeditions.filter((mission) => mission.outcome === 'completed').length,
          total: bundle.campaign.expeditions.length,
          science: report.sciencePoints,
          blackouts: report.blackouts,
        })}
      </p>
      <ul>
        {report.crew.map((crew) => (
          <li key={crew.id}>
            {crew.name}: {crew.condition} · Health {crew.health} · Morale {crew.morale} · Satiety{' '}
            {crew.satiety}
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
              {system.id}: Lv{system.level} · Integrity {(system.integrity * 100).toFixed(0)}% ·{' '}
              {system.status}
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
              Sol {entry.sol}: {entry.highlights.join(' ')}
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
