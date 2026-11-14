import { dispatchDomainCommand } from '../domain/orchestrator.ts';
import { selectEventChoicePreviews } from '../domain/eventSelectors.ts';
import { deriveRoll } from '../domain/prng.ts';
import { baselinePolicy, type CampaignPolicy } from './campaignRunner.ts';
import type { CargoPackId, ContentBundle, CrewId, EquipmentId, GameCommand, GameState } from '../types/index.ts';

export const POLICY_IDS = ['balanced', 'conserve-power', 'science-first', 'repair-first', 'random-valid', 'stress-test'] as const;
export type PolicyId = typeof POLICY_IDS[number];
export type BranchPreference = 'A' | 'B';
const crewIds: readonly CrewId[] = ['eng', 'cmd', 'doc', 'geo'];

/** Permission probing uses the pure dispatcher on snapshots, never patches the live run. */
function firstAllowed(state: GameState, bundle: ContentBundle, commands: readonly GameCommand[]): GameCommand | null {
  return commands.find((command) => dispatchDomainCommand(state, command, bundle).ok) ?? null;
}

export function createPolicy(id: PolicyId, branch: BranchPreference = 'A'): CampaignPolicy {
  return {
    id: `${id}-branch-${branch.toLowerCase()}`,
    branchPreference: branch,
    nextCommand(state, bundle, decisionIndex) {
      const sol = state.clock.sol;
      const phase = state.clock.phase;
      if (id === 'stress-test' && decisionIndex % 5 === 0) return { type: 'rover/schedule', expeditionId: 'polar-psr', equipmentIds: [], launchOperatorCrewId: 'geo' };
      if (phase === 'briefing' && state.events.activeEventId) {
        const allowed = selectEventChoicePreviews(state, state.events.activeEventId, bundle).filter((preview) => preview.allowed);
        const requested = state.events.activeEventId === 'sol7-golden-comms-crisis'
          ? (branch === 'A' ? 'save-rover-link' : 'prioritize-wrs') : null;
        const roll = deriveRoll(state.campaign.seed, sol, `policy:${id}:event:${decisionIndex}`);
        const choice = requested ? allowed.find((preview) => preview.choice.id === requested) ?? allowed[0]
          : id === 'random-valid' ? allowed[Math.floor(roll * allowed.length)] : allowed[0];
        return choice ? { type: 'event/resolve', eventId: state.events.activeEventId, choiceId: choice.choice.id } : null;
      }
      if (phase === 'briefing') return { type: 'phase/advance' };
      if (phase === 'debrief') return { type: 'debrief/dismiss' };

      if (id === 'random-valid') {
        const candidates: GameCommand[] = phase === 'rationing' ? [{ type: 'sol/end' }]
          : [{ type: 'phase/advance' }];
        if (phase === 'engineering') {
          for (const crewId of crewIds) if (!state.crew[crewId].assignedTask) candidates.push({ type: 'crew/assign', crewId, task: 'rest' });
        }
        if (phase === 'rationing') {
          candidates.push({ type: 'rationing/set-wrs', enabled: !state.dailyPlan.wrsEnabled });
          for (const crewId of crewIds) if (!state.dailyPlan.mreTargets.includes(crewId)) candidates.push({ type: 'rationing/toggle-mre', crewId, enabled: true });
        }
        if (phase === 'comms' && !state.logistics.activeOrder) candidates.push({ type: 'comms/order-cargo', slots: { 'water-pack': 1, 'oxygen-pack': 1, 'food-med-pack': 1, 'power-parts-pack': 1 } });
        const valid = candidates.filter((command) => dispatchDomainCommand(state, command, bundle).ok);
        const roll = deriveRoll(state.campaign.seed, sol, `policy:${id}:${decisionIndex}`);
        return valid[Math.floor(roll * valid.length)] ?? null;
      }

      if (phase === 'engineering') {
        const commands: GameCommand[] = [];
        if (state.resources.medkits > 0) for (const crewId of crewIds) {
          if (state.crew[crewId].condition !== 'evacuated' && state.crew[crewId].health < 60) commands.push({ type: 'crew/use-medkit', targetCrewId: crewId });
        }
        const eng = state.crew.eng;
        if (!eng.assignedTask) {
          const repairTarget = (['airlock', 'solar', 'recycler', 'fabricator', 'scrubber'] as const).find((systemId) =>
            state.systems[systemId].integrity < (systemId === 'airlock' || id === 'repair-first' ? 1 : 0.8));
          if (repairTarget) commands.push({ type: 'crew/assign', crewId: 'eng', task: 'repair-system', targetSystemId: repairTarget });
          if (sol >= 2 && sol <= 5 && state.systems.fabricator.level < 2) commands.push({ type: 'crew/assign', crewId: 'eng', task: 'upgrade-system', targetSystemId: 'fabricator' });
          if (id === 'conserve-power' && sol >= 10 && sol <= 14 && state.systems.recycler.level < 3) commands.push({ type: 'crew/assign', crewId: 'eng', task: 'upgrade-system', targetSystemId: 'recycler' });
        }
        if (!state.fabricator.usedThisSol && !state.fabricator.activeJob) {
          const needed: EquipmentId[] = sol < 5 ? ['core_drill', 'solar_lantern', 'radio_repeater'] : ['radio_repeater', 'solar_lantern'];
          for (const itemId of needed) if (!state.equipment[itemId].owned) commands.push({ type: 'fabricator/queue', itemId, action: 'craft' });
        }
        for (const crewId of crewIds) {
          // Keep the geologist free for launches, recoveries and Sol 7 emergency response.
          if (!state.crew[crewId].assignedTask && !(crewId === 'geo' && sol <= bundle.campaign.training.reportSol)) commands.push({ type: 'crew/assign', crewId, task: 'rest' });
        }
        return firstAllowed(state, bundle, commands) ?? { type: 'phase/advance' };
      }
      if (phase === 'comms') {
        const commands: GameCommand[] = [];
        if (state.rover.activeMission?.status === 'signal-lost') commands.push({ type: 'rover/recover-signal' });
        if (!state.rover.activeMission) {
          const launchSols = id === 'science-first' ? [1, 5, 9] : [2, 6, 9];
          for (const [index, expedition] of bundle.campaign.expeditions.entries()) {
            if (sol < launchSols[index] || sol > expedition.windowEndSol || state.rover.missionHistory.some((mission) => mission.expeditionId === expedition.id)) continue;
            const mitigation = expedition.mitigationOptions.find((option) => option.allOf.every((itemId) => state.equipment[itemId].owned && state.equipment[itemId].state !== 'damaged'));
            if (mitigation) commands.push({ type: 'rover/schedule', expeditionId: expedition.id, equipmentIds: mitigation.allOf, launchOperatorCrewId: 'geo' });
          }
        }
        if (!state.logistics.activeOrder && state.logistics.padCooldownSols === 0 && sol + bundle.balance.logistics.transitSols <= bundle.campaign.targetSol) {
          const night = sol >= 10 && sol <= 24;
          const slots: Partial<Record<CargoPackId, number>> = night
            ? { 'power-parts-pack': id === 'conserve-power' ? 1 : 2, 'water-pack': id === 'conserve-power' ? 2 : 1, 'food-med-pack': 1 }
            : { 'power-parts-pack': 1, 'water-pack': 1, 'oxygen-pack': 1, 'food-med-pack': 1 };
          if (state.resources.oxygenKg < 40) { slots['oxygen-pack'] = 1; slots['power-parts-pack'] = Math.max(0, (slots['power-parts-pack'] ?? 0) - 1); }
          commands.push({ type: 'comms/order-cargo', slots });
        }
        return firstAllowed(state, bundle, commands) ?? { type: 'phase/advance' };
      }
      if (phase === 'rationing') {
        const night = sol >= bundle.campaign.milestones.lunarNight.startSol && sol <= bundle.campaign.milestones.lunarNight.endSol;
        const reserve = id === 'conserve-power' ? 90 : 120;
        const enabled = sol === bundle.campaign.milestones.goldenCrisisSol && branch === 'A' ? false
          : state.resources.waterL < reserve && state.resources.wasteWaterL >= (id === 'conserve-power' ? 18 : 10)
            && (!night || state.resources.batteryKWh >= 12);
        if (state.dailyPlan.wrsEnabled !== enabled) return { type: 'rationing/set-wrs', enabled };
        for (const crewId of crewIds) {
          if (state.crew[crewId].condition !== 'evacuated' && state.crew[crewId].satiety <= 25
            && !state.dailyPlan.mreTargets.includes(crewId) && state.dailyPlan.mreTargets.length < state.resources.mrePacks) return { type: 'rationing/toggle-mre', crewId, enabled: true };
        }
        return { type: 'sol/end' };
      }
      return null;
    },
  };
}

/** Negative controls fail through real consumption, never by editing resources or clocks. */
export function createDefeatPolicy(reason: 'oxygen' | 'water'): CampaignPolicy {
  return { id: `negative-control-${reason}`, nextCommand(state, bundle, index) {
    if (state.clock.phase === 'comms' && !state.logistics.activeOrder && state.logistics.padCooldownSols === 0) return {
      type: 'comms/order-cargo', slots: reason === 'oxygen' ? { 'water-pack': 2, 'food-med-pack': 1, 'power-parts-pack': 1 }
        : { 'oxygen-pack': 2, 'food-med-pack': 1, 'power-parts-pack': 1 },
    };
    if (state.clock.phase === 'rationing' && reason === 'water') {
      if (state.dailyPlan.wrsEnabled) return { type: 'rationing/set-wrs', enabled: false };
      for (const crewId of crewIds) if (state.crew[crewId].condition !== 'evacuated' && state.crew[crewId].satiety <= 50
        && !state.dailyPlan.mreTargets.includes(crewId) && state.dailyPlan.mreTargets.length < state.resources.mrePacks) return { type: 'rationing/toggle-mre', crewId, enabled: true };
      return { type: 'sol/end' };
    }
    const command = baselinePolicy.nextCommand(state, bundle, index);
    return command;
  } };
}
