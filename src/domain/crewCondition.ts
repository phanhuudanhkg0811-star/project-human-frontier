import type { CrewCondition } from '../types/index.ts';

/**
 * Apply the crew-health hysteresis shared by End-Sol, events, and Medkits.
 * Fit crew become injured below the lower threshold; injured crew recover only
 * after reaching the higher threshold.
 */
export function deriveCrewCondition(
  health: number,
  previous: CrewCondition,
  fitRecoverAtHealth: number,
  injuredBelowHealth: number
): CrewCondition {
  if (health <= 0) return 'evacuated';
  if (health < injuredBelowHealth) return 'injured';
  if (previous === 'injured' && health < fitRecoverAtHealth) return 'injured';
  return 'fit';
}
