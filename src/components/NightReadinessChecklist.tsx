import { selectNightReadiness } from '../domain/campaignSelectors.ts';
import { useI18n } from '../i18n/useI18n.ts';
import type { ContentBundle, GameState } from '../types/index.ts';

export function NightReadinessChecklist({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const { locale, t } = useI18n();
  if (state.campaign.status !== 'active') return null;

  const readiness = selectNightReadiness(state, bundle);
  const activeCrew = Object.values(state.crew).filter((crew) => crew.condition !== 'evacuated').length;

  const localizedChecks =
    locale === 'en'
      ? [
          {
            label: t('readiness.check.battery'),
            value: `${state.resources.batteryKWh}/${bundle.balance.storages.batteryKWh.max} kWh`,
          },
          {
            label: t('readiness.check.waterO2'),
            value: `${state.resources.waterL} L / ${state.resources.oxygenKg} kg`,
          },
          {
            label: t('readiness.check.mre'),
            value: t('readiness.mreValue', { packs: state.resources.mrePacks, crew: activeCrew }),
          },
          {
            label: t('readiness.check.wrs'),
            value: t('readiness.wrsValue', {
              state: state.dailyPlan.wrsEnabled ? t('common.on') : t('common.off'),
              level: state.systems.recycler.level,
            }),
          },
          {
            label: t('readiness.check.cargo'),
            value: state.logistics.activeOrder
              ? t('readiness.cargoEta', { sol: state.logistics.activeOrder.arrivalSol })
              : t('readiness.cargoNone'),
          },
        ]
      : readiness.checks;

  const localizedWarnings =
    locale === 'en'
      ? readiness.warnings.map((w) => {
          if (w.includes('điện tải thiết yếu')) return t('readiness.warn.blackout');
          if (w.includes('hết nước')) return t('readiness.warn.water');
          if (w.includes('hết O₂')) return t('readiness.warn.oxygen');
          return w;
        })
      : readiness.warnings;

  return (
    <section className="campaign-readiness" aria-label={t('readiness.aria')}>
      <h3>{t('readiness.title', { start: readiness.night.startSol, end: readiness.night.endSol })}</h3>
      <dl>
        {localizedChecks.map((check) => (
          <div key={check.label}>
            <dt>{check.label}</dt>
            <dd>{check.value}</dd>
          </div>
        ))}
      </dl>
      {localizedWarnings.map((warning) => (
        <p role="status" key={warning}>
          {warning}
        </p>
      ))}
      <p>{locale === 'en' ? t('readiness.assumption') : readiness.assumption}</p>
    </section>
  );
}
