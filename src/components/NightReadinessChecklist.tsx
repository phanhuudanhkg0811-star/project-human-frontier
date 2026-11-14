import { selectNightReadiness } from '../domain/campaignSelectors.ts';
import type { ContentBundle, GameState } from '../types/index.ts';

export function NightReadinessChecklist({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  if (state.campaign.status !== 'active') return null;
  const readiness = selectNightReadiness(state, bundle);
  return <section className="campaign-readiness" aria-label="Chuẩn bị Lunar Night">
    <h3>Lunar Night · Sol {readiness.night.startSol}–{readiness.night.endSol}</h3>
    <dl>{readiness.checks.map((check) => <div key={check.label}><dt>{check.label}</dt><dd>{check.value}</dd></div>)}</dl>
    {readiness.warnings.map((warning) => <p role="status" key={warning}>{warning}</p>)}
    <p>{readiness.assumption}</p>
  </section>;
}
