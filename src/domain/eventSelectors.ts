import { checkEventChoiceRequirements } from './eventEngine.ts';
import type {
  ActiveEvent,
  ContentBundle,
  DebriefContext,
  EventChoice,
  EventNode,
  EventResourceKey,
  GameState,
  ScienceBrief,
  SolSummary,
} from '../types/index.ts';

export interface ActiveEventView {
  readonly event: EventNode;
  readonly activeEvent: ActiveEvent;
  readonly deadlineSol: number;
  readonly solsToDeadline: number;
  readonly priority: number;
  readonly mandatory: boolean;
  readonly scienceBrief: ScienceBrief | null;
}

export interface EventChoicePreview {
  readonly choice: EventChoice;
  readonly allowed: boolean;
  readonly blockedReasons: readonly string[];
  readonly resourceDeltas: Readonly<Partial<Record<EventResourceKey, number>>>;
  readonly scienceDelta: number;
  readonly effectsSummary: readonly string[];
}

export interface DynamicDebriefView {
  readonly summary: SolSummary | null;
  readonly context: DebriefContext | null;
  readonly scienceBrief: ScienceBrief | null;
}

export function selectActiveEventView(state: GameState, bundle: ContentBundle): ActiveEventView | null {
  const active = state.events.activeEvent;
  const activeId = active?.eventId ?? state.events.activeEventId;
  if (!activeId) return null;
  const event = bundle.events.find((e) => e.id === activeId);
  if (!event) return null;

  const canonicalActive: ActiveEvent = active ?? {
    eventId: event.id,
    triggeredAtSol: state.clock.sol,
    deadlineSol: state.clock.sol + (event.deadlineOffsetSols ?? 0),
    context: {},
  };
  const scienceBrief = event.scienceBriefId
    ? bundle.briefs.find((b) => b.id === event.scienceBriefId) ?? null
    : null;

  return {
    event,
    activeEvent: canonicalActive,
    deadlineSol: canonicalActive.deadlineSol,
    solsToDeadline: Math.max(0, canonicalActive.deadlineSol - state.clock.sol),
    priority: event.priority,
    mandatory: event.mandatory,
    scienceBrief,
  };
}

export function selectEventChoicePreviews(
  state: GameState,
  eventId: string,
  bundle: ContentBundle
): readonly EventChoicePreview[] {
  const event = bundle.events.find((e) => e.id === eventId);
  if (!event) return [];

  return event.choices.map((choice) => {
    const reqCheck = checkEventChoiceRequirements(state, choice);
    const resourceDeltas: Partial<Record<EventResourceKey, number>> = {};
    let scienceDelta = 0;
    const effectsSummary: string[] = [];

    for (const eff of choice.effects) {
      if (eff.kind === 'resource') {
        const nextDelta = Math.round(((resourceDeltas[eff.resource] ?? 0) + eff.delta) * 100) / 100;
        resourceDeltas[eff.resource] = nextDelta;
      } else if (eff.kind === 'science') {
        scienceDelta += eff.delta;
      } else if (eff.kind === 'crew') {
        const targetLabel = eff.target === 'all' ? 'Toàn đội' : state.crew[eff.target].name;
        if (eff.healthDelta) {
          effectsSummary.push(`${targetLabel} Health ${eff.healthDelta > 0 ? `+${eff.healthDelta}` : eff.healthDelta}`);
        }
        if (eff.moraleDelta) {
          effectsSummary.push(`${targetLabel} Morale ${eff.moraleDelta > 0 ? `+${eff.moraleDelta}` : eff.moraleDelta}`);
        }
        if (eff.satietyDelta) {
          effectsSummary.push(`${targetLabel} Satiety ${eff.satietyDelta > 0 ? `+${eff.satietyDelta}` : eff.satietyDelta}`);
        }
      } else if (eff.kind === 'equipment-wear') {
        effectsSummary.push(`Hao mòn ${eff.equipmentId}: -${eff.wear}%`);
      } else if (eff.kind === 'system-integrity') {
        const pct = Math.round(eff.delta * 100);
        effectsSummary.push(`Hệ thống ${eff.systemId}: ${pct > 0 ? `+${pct}` : pct}%`);
      } else if (eff.kind === 'plan-override') {
        if (eff.wrsEnabled !== undefined) {
          effectsSummary.push(`WRS hôm nay: ${eff.wrsEnabled ? 'BẬT' : 'TẮT'}`);
        }
        if (eff.extraPowerCostKWh !== undefined && eff.extraPowerCostKWh !== 0) {
          const nextDelta = Math.round(((resourceDeltas.batteryKWh ?? 0) - eff.extraPowerCostKWh) * 100) / 100;
          resourceDeltas.batteryKWh = nextDelta;
        }
      } else if (eff.kind === 'assign-task') {
        effectsSummary.push(`Phân công ${state.crew[eff.crewId].name}: ${eff.task}`);
      } else if (eff.kind === 'rover-action') {
        effectsSummary.push(`Rover: ${eff.action}`);
      } else if (eff.kind === 'schedule-follow-up') {
        effectsSummary.push(`Hệ quả sau +${eff.delaySols} Sol`);
      }
    }

    return {
      choice,
      allowed: reqCheck.allowed,
      blockedReasons: reqCheck.blockedReasons,
      resourceDeltas,
      scienceDelta,
      effectsSummary,
    };
  });
}

export function selectDynamicDebrief(state: GameState, bundle: ContentBundle): DynamicDebriefView {
  const summary = state.debrief.lastSummary;
  if (!summary) {
    return { summary: null, context: null, scienceBrief: null };
  }
  const context = summary.debriefContext;
  const briefId = context?.briefId ?? summary.briefId;
  const scienceBrief = bundle.briefs.find((b) => b.id === briefId) ?? bundle.briefs[0] ?? null;

  return {
    summary,
    context,
    scienceBrief,
  };
}
