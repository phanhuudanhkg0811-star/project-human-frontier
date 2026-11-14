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
    const blockedReasons: string[] = [];
    if (choice.requiresEquipment) {
      const eq = state.equipment[choice.requiresEquipment];
      if (!eq.owned || eq.state === 'damaged') {
        blockedReasons.push(`Yêu cầu thiết bị ${choice.requiresEquipment} còn tốt.`);
      }
    }
    if (choice.requiresFlag && !state.events.flags[choice.requiresFlag]) {
      blockedReasons.push(`Yêu cầu điều kiện ${choice.requiresFlag}.`);
    }
    if (choice.requiresCrew) {
      const crewMember = state.crew[choice.requiresCrew.crewId];
      if (crewMember.condition === 'evacuated') {
        blockedReasons.push(`${crewMember.name} đã rời trạm.`);
      } else {
        if (choice.requiresCrew.requireFit && crewMember.condition !== 'fit') {
          blockedReasons.push(`${crewMember.name} cần ở trạng thái Fit.`);
        }
        if (choice.requiresCrew.requireFree && crewMember.assignedTask !== null) {
          blockedReasons.push(`${crewMember.name} đang bận nhiệm vụ khác.`);
        }
      }
    }

    const resourceDeltas: Partial<Record<EventResourceKey, number>> = {};
    let scienceDelta = 0;
    const effectsSummary: string[] = [];

    for (const eff of choice.effects) {
      if (eff.kind === 'resource') {
        const nextDelta = (resourceDeltas[eff.resource] ?? 0) + eff.delta;
        resourceDeltas[eff.resource] = nextDelta;
        if (state.resources[eff.resource] + nextDelta < 0) {
          blockedReasons.push(`Không đủ ${eff.resource} (${eff.delta}).`);
        }
        effectsSummary.push(`${eff.resource}: ${eff.delta > 0 ? `+${eff.delta}` : eff.delta}`);
      } else if (eff.kind === 'science') {
        scienceDelta += eff.delta;
        effectsSummary.push(`Science: ${eff.delta > 0 ? `+${eff.delta}` : eff.delta}`);
      } else if (eff.kind === 'crew') {
        const targetLabel = eff.target === 'all' ? 'Toàn đội' : state.crew[eff.target].name;
        if (eff.healthDelta) effectsSummary.push(`${targetLabel} Health ${eff.healthDelta > 0 ? `+${eff.healthDelta}` : eff.healthDelta}`);
        if (eff.moraleDelta) effectsSummary.push(`${targetLabel} Morale ${eff.moraleDelta > 0 ? `+${eff.moraleDelta}` : eff.moraleDelta}`);
        if (eff.satietyDelta) effectsSummary.push(`${targetLabel} Satiety ${eff.satietyDelta > 0 ? `+${eff.satietyDelta}` : eff.satietyDelta}`);
      } else if (eff.kind === 'equipment-wear') {
        effectsSummary.push(`Hao mòn ${eff.equipmentId}: -${eff.wear}%`);
      } else if (eff.kind === 'system-integrity') {
        effectsSummary.push(`Hệ thống ${eff.systemId}: ${Math.round(eff.delta * 100)}%`);
      } else if (eff.kind === 'plan-override' && eff.wrsEnabled !== undefined) {
        effectsSummary.push(`WRS hôm nay: ${eff.wrsEnabled ? 'BẬT' : 'TẮT'}`);
      }
    }

    return {
      choice,
      allowed: blockedReasons.length === 0,
      blockedReasons,
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
