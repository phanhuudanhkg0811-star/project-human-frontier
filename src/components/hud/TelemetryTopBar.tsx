import { selectMissionProgress, selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { DonkiLevel, SolPhase } from '../../types/index.ts';
import { HAIL_SVG } from '../cabin/hailAssets.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { TOUR_TARGET_IDS } from '../../onboarding/targets.ts';

const DONKI_COLOR: Record<DonkiLevel, string> = {
  quiet: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/50',
  moderate: 'text-sky-300 border-sky-500/40 bg-sky-950/50',
  storm: 'text-amber-300 border-amber-500/50 bg-amber-950/60',
  extreme: 'text-rose-300 border-rose-500/60 bg-rose-950/70',
};

export function TelemetryTopBar() {
  const { gameState, bundle } = useGameStore();
  const r = gameState.resources;
  const sol = gameState.clock.sol;
  const targetSol = gameState.campaign.targetSol;
  const progress = selectMissionProgress(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const { t } = useI18n();
  const phaseKey: Record<SolPhase, string> = {
    briefing: 'phase.briefing', engineering: 'phase.engineering', comms: 'phase.comms',
    rationing: 'phase.rationing', resolving: 'phase.resolving', debrief: 'phase.debrief', terminal: 'phase.terminal',
  };

  const metrics = [
    { key: 'pwr', label: t('telemetry.battery'), value: r.batteryKWh, cap: bundle.balance.storages.batteryKWh.max, unit: 'kWh', icon: HAIL_SVG.resPower, warn: r.batteryKWh < 14 },
    { key: 'o2', label: 'O₂', value: r.oxygenKg, cap: bundle.balance.storages.oxygenKg.max, unit: 'kg', icon: HAIL_SVG.resOxygen, warn: r.oxygenKg < 18 },
    { key: 'h2o', label: t('telemetry.water'), value: r.waterL, cap: bundle.balance.storages.waterL.max, unit: 'L', icon: HAIL_SVG.resWater, warn: r.waterL < 22 },
    { key: 'parts', label: t('telemetry.parts'), value: r.partsKg, cap: bundle.balance.storages.partsKg.max, unit: 'kg', icon: HAIL_SVG.resParts, warn: r.partsKg < 4 },
    { key: 'mre', label: 'MRE', value: r.mrePacks, cap: bundle.balance.consumables.mrePacks.max, unit: t('telemetry.packUnit'), icon: HAIL_SVG.resFood, warn: r.mrePacks < 6 },
  ];

  return (
    <header className="hail-telemetry" aria-label={t('telemetry.aria')}>
      <div className="hail-mission-id">
        <img src={HAIL_SVG.badgeNasaStem} alt="NASA STEM" className="hail-emblem-icon" />
        <div className="hail-mission-titles">
          <div className="hail-title-row">
            <strong>ARTEMIS BASE</strong>
            <span className="hail-sol-pill">
              SOL {String(sol).padStart(2, '0')} / {targetSol}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${progress.isLunarNight ? 'text-indigo-200 border-indigo-400/50 bg-indigo-950/60' : 'text-amber-200 border-amber-400/40 bg-amber-950/40'}`}>
              {progress.isLunarNight ? t('telemetry.lunarNight') : t('telemetry.lunarDay')}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${DONKI_COLOR[weather.level]}`} title={weather.headline ?? 'NASA DONKI'} data-tour={TOUR_TARGET_IDS.TELEMETRY_DONKI}>
              DONKI: {t(`donki.${weather.level}`)}
            </span>
          </div>
          <span className="hail-sub-row">
            {`MOON SURVIVAL 32 SOL · ${t(phaseKey[gameState.clock.phase])}`}
          </span>
        </div>
      </div>

      <dl className="hail-resource-strip">
        {metrics.map((m) => (
          <div key={m.key} className={`hail-res-pill ${m.warn ? 'is-warn' : ''}`} title={`${m.label}: ${m.value}/${m.cap} ${m.unit}`}>
            <img src={m.icon} alt="" aria-hidden="true" className="hail-res-icon" />
            <div className="hail-res-data">
              <dt>{m.label}</dt>
              <dd>
                {Number.isInteger(m.value) ? m.value : m.value.toFixed(1)}
                <small>{m.unit}</small>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </header>
  );
}
