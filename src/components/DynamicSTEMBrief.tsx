import type { ReactNode } from 'react';
import type { DynamicDebriefView } from '../domain/eventSelectors.ts';
import { useI18n } from '../i18n/useI18n.ts';
import type { ContentBundle } from '../types/index.ts';

/** Presentation of resolved results only; never computes deltas from the current plan. */
export function DynamicSTEMBrief({ view, bundle, content }: {
  view: DynamicDebriefView;
  bundle: ContentBundle;
  content?: ReactNode;
}) {
  const { locale, t, pickText } = useI18n();
  const { summary, context, scienceBrief } = view;
  if (!summary) {
    return (
      <section className="hail-stem-brief is-empty" aria-label={t('stem.emptyAria')}>
        {t('stem.emptyText')}
      </section>
    );
  }
  const sourceEvent = context?.sourceEventId
    ? bundle.events.find((event) => event.id === context.sourceEventId)
    : null;
  const sourceChoice = sourceEvent?.choices.find((choice) => choice.id === context?.sourceChoiceId);
  const evidence = context?.evidenceType ?? 'simulated';

  const getMetricLabel = (key: string, fallback: string) => {
    const translationKeys: Readonly<Record<string, string>> = {
      battery: 'battery',
      batteryKWh: 'battery',
      oxygen: 'oxygen',
      oxygenKg: 'oxygen',
      water: 'water',
      waterL: 'water',
      parts: 'parts',
      partsKg: 'parts',
      wrsRecovered: 'wrsRecovered',
      wrsRecoveredWaterL: 'wrsRecovered',
      radiation: 'radiation',
      radiationMgy: 'radiation',
    };
    const translationKey = translationKeys[key];
    return locale === 'en' && translationKey ? t(`stem.metric.${translationKey}`) : fallback;
  };

  return (
    <section className="hail-stem-brief" aria-label={t('stem.sectionAria', { sol: summary.sol })}>
      <div className="hail-stem-heading">
        <span className="mission-kicker">{t('stem.kicker', { sol: summary.sol })}</span>
        {evidence && <span className="hail-evidence-badge">{t(`stem.evidence.${evidence}`)}</span>}
      </div>
      {sourceEvent && (
        <p className="hail-stem-context">
          {t('stem.contextEvent', { title: pickText(sourceEvent.title, sourceEvent.titleEn) })}
        </p>
      )}
      {sourceChoice && (
        <p className="hail-stem-context">
          {t('stem.contextChoice', { label: pickText(sourceChoice.label, sourceChoice.labelEn) })}
        </p>
      )}
      {context && context.metricHighlights.length > 0 && (
        <dl className="hail-stem-metrics">
          {context.metricHighlights.map((metric, index) => (
            <div key={`${metric.key}-${index}`}>
              <dt>{getMetricLabel(metric.key, metric.label)}</dt>
              <dd>{metric.delta > 0 ? '+' : ''}{metric.delta} {metric.unit}</dd>
            </div>
          ))}
        </dl>
      )}
      {scienceBrief ? (
        <>
          <div className="hail-stem-heading hail-stem-heading--science">
            <h3>{pickText(scienceBrief.title, scienceBrief.titleEn)}</h3>
            <span className="hail-evidence-badge">
              {t(`stem.evidence.${scienceBrief.provenance}`)}
            </span>
          </div>
          {content ?? <p>{pickText(scienceBrief.content, scienceBrief.contentEn)}</p>}
          <small>
            <a href={scienceBrief.sourceUrl} target="_blank" rel="noopener noreferrer">
              {t('stem.sourcePrefix', { source: scienceBrief.source })}
            </a>
          </small>
        </>
      ) : (
        <p>{t('stem.noBrief')}</p>
      )}
    </section>
  );
}
