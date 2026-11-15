import { deriveRoll } from './prng.ts';
import { deriveCrewCondition } from './crewCondition.ts';
import type {
  ActiveEvent,
  ContentBundle,
  CrewId,
  DebriefContext,
  DebriefMetricDelta,
  DomainError,
  EventChoice,
  EventEffect,
  EventNode,
  EventTriggerCondition,
  GameState,
  PendingFollowUpEvent,
  RoverTimelineStage,
  SolSummary,
} from '../types/index.ts';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getCurrentRoverStage(state: GameState): RoverTimelineStage {
  const status = state.rover.activeMission?.status;
  if (!status) return 'available';
  return status === 'recovery-pending' ? 'returning' : status;
}

/**
 * Evaluate a single EventTriggerCondition (`AND` across all declared fields).
 */
export function evaluateTriggerCondition(
  state: GameState,
  cond: EventTriggerCondition,
  bundle: ContentBundle
): boolean {
  const sol = state.clock.sol;
  if (cond.sol !== undefined && sol !== cond.sol) return false;
  if (cond.solMin !== undefined && sol < cond.solMin) return false;
  if (cond.solMax !== undefined && sol > cond.solMax) return false;

  if (cond.isLunarNight !== undefined) {
    const isNight =
      sol >= bundle.campaign.milestones.lunarNight.startSol &&
      sol <= bundle.campaign.milestones.lunarNight.endSol;
    if (isNight !== cond.isLunarNight) return false;
  }

  if (cond.flagSet !== undefined && !state.events.flags[cond.flagSet]) {
    return false;
  }
  if (cond.flagNotSet !== undefined && Boolean(state.events.flags[cond.flagNotSet])) {
    return false;
  }
  if (cond.flagEquals !== undefined && state.events.flags[cond.flagEquals.key] !== cond.flagEquals.value) {
    return false;
  }

  if (cond.choiceMade !== undefined) {
    const matched = state.events.occurrenceHistory.some(
      (occ) =>
        occ.eventId === cond.choiceMade!.eventId &&
        occ.outcome === 'resolved' &&
        occ.choiceId === cond.choiceMade!.choiceId
    );
    if (!matched) return false;
  }

  if (cond.eventSeen !== undefined) {
    const seen =
      state.events.occurrenceHistory.some((occ) => occ.eventId === cond.eventSeen) ||
      state.events.resolvedEventIds.includes(cond.eventSeen);
    if (!seen) return false;
  }

  if (cond.eventNotSeen !== undefined) {
    const seen =
      state.events.occurrenceHistory.some((occ) => occ.eventId === cond.eventNotSeen) ||
      state.events.resolvedEventIds.includes(cond.eventNotSeen);
    if (seen) return false;
  }

  if (cond.roverExpeditionId !== undefined || cond.roverStatus !== undefined) {
    const active = state.rover.activeMission;
    const currentStage = getCurrentRoverStage(state);
    if (cond.roverExpeditionId !== undefined && cond.roverStatus !== undefined) {
      if (cond.roverStatus === 'completed' || cond.roverStatus === 'failed') {
        const inActive =
          active?.expeditionId === cond.roverExpeditionId && active.status === cond.roverStatus;
        const inHistory = state.rover.missionHistory.some(
          (m) => m.expeditionId === cond.roverExpeditionId && m.outcome === cond.roverStatus
        );
        if (!inActive && !inHistory) return false;
      } else {
        if (active?.expeditionId !== cond.roverExpeditionId || currentStage !== cond.roverStatus) {
          return false;
        }
      }
    } else if (cond.roverExpeditionId !== undefined) {
      const inActive = active?.expeditionId === cond.roverExpeditionId;
      const inHistory = state.rover.missionHistory.some((m) => m.expeditionId === cond.roverExpeditionId);
      if (!inActive && !inHistory) return false;
    } else if (cond.roverStatus !== undefined) {
      if (cond.roverStatus === 'completed' || cond.roverStatus === 'failed') {
        const inActive = active?.status === cond.roverStatus;
        const inHistory = state.rover.missionHistory.some((m) => m.outcome === cond.roverStatus);
        if (!inActive && !inHistory) return false;
      } else if (currentStage !== cond.roverStatus) {
        return false;
      }
    }
  }

  if (cond.systemIntegrityBelow !== undefined) {
    const sys = state.systems[cond.systemIntegrityBelow.id];
    if (sys.integrity > cond.systemIntegrityBelow.maxIntegrity) return false;
  }

  if (cond.minResource !== undefined) {
    for (const [key, minVal] of Object.entries(cond.minResource)) {
      if (minVal !== undefined) {
        const k = key as keyof typeof cond.minResource;
        if (state.resources[k] < minVal) return false;
      }
    }
  }

  if (cond.maxResource !== undefined) {
    for (const [key, maxVal] of Object.entries(cond.maxResource)) {
      if (maxVal !== undefined) {
        const k = key as keyof typeof cond.maxResource;
        if (state.resources[k] > maxVal) return false;
      }
    }
  }

  if (cond.crewCondition !== undefined) {
    if (cond.crewCondition.crewId !== undefined) {
      if (state.crew[cond.crewCondition.crewId].condition !== cond.crewCondition.condition) return false;
    } else {
      const anyMatch = Object.values(state.crew).some(
        (c) => c.condition === cond.crewCondition!.condition
      );
      if (!anyMatch) return false;
    }
  }

  return true;
}

/**
 * Check whether an event's repeatPolicy allows it to trigger on `state.clock.sol`.
 */
export function canEventRepeat(state: GameState, event: EventNode): boolean {
  const sol = state.clock.sol;
  const historyForEvent = state.events.occurrenceHistory.filter((occ) => occ.eventId === event.id);

  // Never trigger the same event twice in the same Sol
  if (historyForEvent.some((occ) => occ.triggeredSol === sol || occ.settledSol === sol)) {
    return false;
  }

  if (event.repeatPolicy === 'once') {
    if (historyForEvent.length > 0 || state.events.resolvedEventIds.includes(event.id)) {
      return false;
    }
    return true;
  }

  if (event.repeatPolicy === 'cooldown') {
    if (historyForEvent.length === 0) return true;
    const lastSettledSol = Math.max(...historyForEvent.map((occ) => occ.settledSol));
    const cooldown = event.cooldownSols ?? 1;
    return sol >= lastSettledSol + cooldown;
  }

  return true;
}

/**
 * Check whether an event is eligible to trigger (`canEventRepeat` AND `OR` across `when`).
 */
export function isEventEligible(state: GameState, event: EventNode, bundle: ContentBundle): boolean {
  if (!canEventRepeat(state, event)) return false;
  return event.when.some((cond) => evaluateTriggerCondition(state, cond, bundle));
}

export interface NextSolEventSelection {
  readonly activeEvent: ActiveEvent | null;
  readonly pendingFollowUps: readonly PendingFollowUpEvent[];
}

/**
 * Deterministically select the next active event at the start of a Sol:
 * 1. If an unexpired `activeEvent` is still open, keep it.
 * 2. Check due `pendingFollowUps` (`triggerSol <= currentSol`) that pass `isEventEligible`:
 *    highest `priority` wins, tie-broken by `event.id` ascending.
 * 3. Otherwise filter `bundle.events` by `isEventEligible`, keep highest `priority` group,
 *    sort by `event.id` ascending, and roll weighted-random via `deriveRoll(seed, sol, 'event-pick')`.
 */
export function selectNextSolEvent(
  state: GameState,
  bundle: ContentBundle
): NextSolEventSelection {
  if (state.events.activeEvent !== null) {
    return {
      activeEvent: state.events.activeEvent,
      pendingFollowUps: state.events.pendingFollowUps,
    };
  }

  const sol = state.clock.sol;
  const eventById = new Map(bundle.events.map((e) => [e.id, e]));

  // Clean up follow-ups that point to 'once' events already seen
  const validFollowUps = state.events.pendingFollowUps.filter((f) => {
    const ev = eventById.get(f.eventId);
    if (!ev) return false;
    return canEventRepeat(state, ev);
  });

  const dueCandidates = validFollowUps
    .map((followUp, index) => ({ followUp, index, event: eventById.get(followUp.eventId)! }))
    .filter(({ followUp, event }) => followUp.triggerSol <= sol && isEventEligible(state, event, bundle));

  if (dueCandidates.length > 0) {
    dueCandidates.sort((a, b) => {
      if (b.event.priority !== a.event.priority) return b.event.priority - a.event.priority;
      return a.event.id.localeCompare(b.event.id);
    });
    const chosen = dueCandidates[0];
    const remainingFollowUps = validFollowUps.filter((_, idx) => idx !== chosen.index);
    return {
      activeEvent: {
        eventId: chosen.event.id,
        triggeredAtSol: sol,
        deadlineSol: sol + (chosen.event.deadlineOffsetSols ?? 0),
        context: {
          sourceEventId: chosen.followUp.sourceEventId,
          sourceChoiceId: chosen.followUp.sourceChoiceId,
        },
      },
      pendingFollowUps: remainingFollowUps,
    };
  }

  const eligible = bundle.events.filter((ev) => isEventEligible(state, ev, bundle));
  if (eligible.length === 0) {
    return {
      activeEvent: null,
      pendingFollowUps: validFollowUps,
    };
  }

  const maxPriority = Math.max(...eligible.map((e) => e.priority));
  const topGroup = eligible
    .filter((e) => e.priority === maxPriority)
    .sort((a, b) => a.id.localeCompare(b.id));

  let picked = topGroup[0];
  if (topGroup.length > 1) {
    const totalWeight = topGroup.reduce((sum, e) => sum + e.weight, 0);
    const roll = deriveRoll(state.campaign.seed, sol, 'event-pick');
    const threshold = roll * totalWeight;
    let cursor = 0;
    for (const candidate of topGroup) {
      cursor += candidate.weight;
      if (threshold < cursor) {
        picked = candidate;
        break;
      }
    }
  }

  return {
    activeEvent: {
      eventId: picked.id,
      triggeredAtSol: sol,
      deadlineSol: sol + (picked.deadlineOffsetSols ?? 0),
      context: {},
    },
    pendingFollowUps: validFollowUps,
  };
}

/**
 * Evaluate whether a player can select `choice` right now, returning human-readable blocked reasons.
 */
export function checkEventChoiceRequirements(
  state: GameState,
  choice: EventChoice
): { readonly allowed: boolean; readonly blockedReasons: readonly string[] } {
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

  const netResourceDeltas: Partial<Record<string, number>> = {};
  for (const eff of choice.effects) {
    if (eff.kind === 'resource') {
      netResourceDeltas[eff.resource] = round2((netResourceDeltas[eff.resource] ?? 0) + eff.delta);
    } else if (eff.kind === 'plan-override' && eff.extraPowerCostKWh !== undefined) {
      netResourceDeltas.batteryKWh = round2((netResourceDeltas.batteryKWh ?? 0) - eff.extraPowerCostKWh);
    }
  }

  for (const [resKey, delta] of Object.entries(netResourceDeltas)) {
    if (delta !== undefined && delta < 0) {
      const currentVal = state.resources[resKey as keyof typeof state.resources];
      if (round2(currentVal + delta) < 0) {
        blockedReasons.push(`Không đủ ${resKey} (${delta}).`);
      }
    }
  }

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
  };
}

export type AtomicEffectsResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: DomainError };

/**
 * Execute an array of `EventEffect`s atomically on a copy of `state`.
 * In `'choice'` mode, any insufficient resource or invalid assignment aborts the entire transaction and returns `ok: false`.
 * In `'expire'` mode, resource deltas clamp to `[0, max]` so expiration penalties always apply cleanly.
 */
export function applyEventEffectsAtomic(
  state: GameState,
  effects: readonly EventEffect[],
  bundle: ContentBundle,
  options: {
    readonly mode: 'choice' | 'expire';
    readonly sourceEventId: string;
    readonly sourceChoiceId: string;
  }
): AtomicEffectsResult {
  const r = { ...state.resources };
  const s = bundle.balance.storages;
  const nextCrew = { ...state.crew };
  const nextEq = { ...state.equipment };
  const nextSys = { ...state.systems };
  const nextFlags: Record<string, boolean | string | number> = { ...state.events.flags };
  const nextFollowUps = [...state.events.pendingFollowUps];
  let nextWrsEnabled = state.dailyPlan.wrsEnabled;
  let nextSciencePoints = state.campaign.sciencePoints;
  let nextRover = state.rover;

  const updateResource = (
    key: 'batteryKWh' | 'oxygenKg' | 'waterL' | 'partsKg' | 'mrePacks' | 'medkits',
    delta: number,
    maxVal: number,
    label: string
  ): DomainError | null => {
    const rawNext = key === 'mrePacks' || key === 'medkits' ? r[key] + delta : round2(r[key] + delta);
    if (options.mode === 'choice' && delta < 0 && rawNext < 0) {
      return {
        code: 'E_INSUFFICIENT_RESOURCE',
        message: `Không đủ ${label} cho lựa chọn này.`,
        recoverable: true,
      };
    }
    r[key] = clamp(rawNext, 0, maxVal);
    return null;
  };

  for (const eff of effects) {
    switch (eff.kind) {
      case 'resource': {
        const err =
          eff.resource === 'partsKg'
            ? updateResource('partsKg', eff.delta, s.partsKg.max, 'Phụ tùng')
            : eff.resource === 'batteryKWh'
              ? updateResource('batteryKWh', eff.delta, s.batteryKWh.max, 'Pin')
              : eff.resource === 'oxygenKg'
                ? updateResource('oxygenKg', eff.delta, s.oxygenKg.max, 'Oxy')
                : eff.resource === 'waterL'
                  ? updateResource('waterL', eff.delta, s.waterL.max, 'Nước')
                  : eff.resource === 'mrePacks'
                    ? updateResource('mrePacks', eff.delta, bundle.balance.consumables.mrePacks.max, 'gói MRE')
                    : updateResource('medkits', eff.delta, bundle.balance.consumables.medkits.max, 'Medkit');
        if (err) return { ok: false, error: err };
        break;
      }

      case 'science': {
        nextSciencePoints = Math.max(0, nextSciencePoints + eff.delta);
        break;
      }

      case 'crew': {
        const targets: readonly CrewId[] =
          eff.target === 'all' ? ['cmd', 'eng', 'doc', 'geo'] : [eff.target];
        for (const id of targets) {
          const c = nextCrew[id];
          if (c.condition === 'evacuated') continue;
          const nextHealth = clamp(c.health + (eff.healthDelta ?? 0), 0, 100);
          const nextMorale = clamp(c.morale + (eff.moraleDelta ?? 0), 0, 100);
          const nextSatiety = clamp(c.satiety + (eff.satietyDelta ?? 0), 0, 100);
          nextCrew[id] = {
            ...c,
            health: nextHealth,
            morale: nextMorale,
            satiety: nextSatiety,
            condition: deriveCrewCondition(
              nextHealth,
              c.condition,
              bundle.balance.crew.fitRecoverAtHealth,
              bundle.balance.crew.injuredBelowHealth
            ),
            hungerState: nextSatiety <= 0 ? 'starving' : nextSatiety <= 25 ? 'hungry' : 'ok',
          };
        }
        break;
      }

      case 'equipment-wear': {
        const eq = nextEq[eff.equipmentId];
        const nextDur = clamp(eq.durability - eff.wear, 0, 100);
        nextEq[eff.equipmentId] = {
          ...eq,
          durability: nextDur,
          state: nextDur > 50 ? 'good' : nextDur > 0 ? 'worn' : 'damaged',
        };
        break;
      }

      case 'system-integrity': {
        const sys = nextSys[eff.systemId];
        const nextInt = clamp(round2(sys.integrity + eff.delta), 0, 1);
        nextSys[eff.systemId] = {
          ...sys,
          integrity: nextInt,
          status: nextInt >= 0.85 ? 'nominal' : nextInt > 0 ? 'degraded' : 'offline',
        };
        break;
      }

      case 'plan-override': {
        if (eff.wrsEnabled !== undefined) {
          nextWrsEnabled = eff.wrsEnabled;
        }
        if (eff.extraPowerCostKWh !== undefined && eff.extraPowerCostKWh !== 0) {
          const err = updateResource('batteryKWh', -eff.extraPowerCostKWh, s.batteryKWh.max, 'Pin');
          if (err) return { ok: false, error: err };
        }
        break;
      }

      case 'set-flag': {
        nextFlags[eff.key] = eff.value;
        break;
      }

      case 'clear-flag': {
        delete nextFlags[eff.key];
        break;
      }

      case 'assign-task': {
        const member = nextCrew[eff.crewId];
        if (member.condition === 'evacuated') {
          if (options.mode === 'choice') {
            return {
              ok: false,
              error: { code: 'E_PLAN_INVALID', message: `${member.name} đã rời trạm.`, recoverable: true },
            };
          }
          break;
        }
        if (options.mode === 'choice' && member.assignedTask !== null) {
          return {
            ok: false,
            error: { code: 'E_PLAN_INVALID', message: `${member.name} đang bận nhiệm vụ khác.`, recoverable: true },
          };
        }
        nextCrew[eff.crewId] = {
          ...member,
          assignedTask: {
            type: eff.task,
            ...(eff.targetSystemId ? { targetSystemId: eff.targetSystemId } : {}),
            ...(eff.targetCrewId ? { targetCrewId: eff.targetCrewId } : {}),
          },
        };
        break;
      }

      case 'rover-action': {
        const mission = nextRover.activeMission;
        if (!mission) break;
        if (eff.expeditionId !== undefined && mission.expeditionId !== eff.expeditionId) break;

        if (eff.action === 'continue-expedition' || eff.action === 'recover-signal') {
          if (mission.status === 'signal-lost') {
            nextRover = {
              ...nextRover,
              activeMission: {
                ...mission,
                status: mission.resumeStatus ?? 'exploring',
                statusEnteredSol: state.clock.sol,
                expectedReturnSol:
                  mission.expectedReturnSol === null
                    ? null
                    : mission.expectedReturnSol + mission.signalLostSols,
                signalLostSols: 0,
                resumeStatus: null,
              },
            };
          }
        } else if (eff.action === 'delay-1-sol') {
          nextRover = {
            ...nextRover,
            activeMission: {
              ...mission,
              recoveryDelaySols: mission.recoveryDelaySols + 1,
              expectedReturnSol:
                mission.expectedReturnSol === null ? null : mission.expectedReturnSol + 1,
            },
          };
        } else if (eff.action === 'fail-expedition') {
          for (const eqId of mission.equippedItems) {
            const item = nextEq[eqId];
            const nextDur = clamp(item.durability - 25, 0, 100);
            nextEq[eqId] = {
              ...item,
              durability: nextDur,
              state: nextDur > 50 ? 'good' : nextDur > 0 ? 'worn' : 'damaged',
              reservedForRover: false,
            };
          }
          if (mission.status === 'scheduled') {
            const op = nextCrew[mission.launchOperatorCrewId];
            if (op.assignedTask?.type === 'rover-operate') {
              nextCrew[mission.launchOperatorCrewId] = { ...op, assignedTask: null };
            }
          }
          const failIncident = {
            kind: 'signal-timeout' as const,
            occurredSol: state.clock.sol,
            summary: `Chuyến ${mission.expeditionId} dừng khẩn cấp từ sự kiện ${options.sourceEventId}.`,
          };
          const alreadySettled = nextRover.missionHistory.some(
            (m) => m.expeditionId === mission.expeditionId
          );
          nextRover = {
            activeMission: null,
            missionHistory: alreadySettled
              ? nextRover.missionHistory
              : [
                  ...nextRover.missionHistory,
                  {
                    expeditionId: mission.expeditionId,
                    outcome: 'failed',
                    launchedSol: mission.launchedSol,
                    settledSol: state.clock.sol,
                    rewardSampleGranted: null,
                    scienceGranted: 0,
                    launchOperatorCrewId: mission.launchOperatorCrewId,
                    recoveryOperatorCrewId: mission.recoveryOperatorCrewId,
                    equippedItems: mission.equippedItems,
                    incidents: [...mission.incidents, failIncident],
                  },
                ],
          };
        }
        break;
      }

      case 'schedule-follow-up': {
        nextFollowUps.push({
          eventId: eff.eventId,
          triggerSol: state.clock.sol + eff.delaySols,
          sourceEventId: options.sourceEventId,
          sourceChoiceId: options.sourceChoiceId,
        });
        break;
      }
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      campaign: {
        ...state.campaign,
        sciencePoints: nextSciencePoints,
      },
      resources: r,
      crew: nextCrew,
      equipment: nextEq,
      systems: nextSys,
      rover: nextRover,
      dailyPlan: {
        ...state.dailyPlan,
        wrsEnabled: nextWrsEnabled,
      },
      events: {
        ...state.events,
        flags: nextFlags,
        pendingFollowUps: nextFollowUps,
      },
    },
  };
}

/** Apply an active event's expiration effects and record the expired occurrence. */
export function expireActiveEvent(
  state: GameState,
  bundle: ContentBundle
): { readonly state: GameState; readonly expiredNote: string | null } {
  const active = state.events.activeEvent;
  if (!active) {
    return { state, expiredNote: null };
  }

  const eventNode = bundle.events.find((e) => e.id === active.eventId);
  const expireEffects = eventNode?.onExpireEffects ?? [];
  const applied = applyEventEffectsAtomic(state, expireEffects, bundle, {
    mode: 'expire',
    sourceEventId: active.eventId,
    sourceChoiceId: 'expired',
  });
  const baseState = applied.ok ? applied.state : state;

  const nextOccurrenceHistory = [
    ...baseState.events.occurrenceHistory,
    {
      eventId: active.eventId,
      triggeredSol: active.triggeredAtSol,
      settledSol: state.clock.sol,
      outcome: 'expired' as const,
      choiceId: null,
    },
  ];

  const expiredNote = `Sự kiện "${eventNode?.title ?? active.eventId}" đã hết thời hạn ở Sol ${state.clock.sol}.`;

  return {
    state: {
      ...baseState,
      events: {
        ...baseState.events,
        activeEventId: null,
        activeEvent: null,
        occurrenceHistory: nextOccurrenceHistory,
      },
    },
    expiredNote,
  };
}

/** Expire an event only after its inclusive End-Sol deadline has been reached. */
export function resolveExpiredEventAtEndSol(
  state: GameState,
  bundle: ContentBundle
): { readonly state: GameState; readonly expiredNote: string | null } {
  const active = state.events.activeEvent;
  if (!active || state.clock.sol < active.deadlineSol) {
    return { state, expiredNote: null };
  }
  return expireActiveEvent(state, bundle);
}

/**
 * Build dynamic STEM DebriefContext linking tonight's Sol resolution and today's event to a NASA Science Brief.
 */
export function buildDebriefContext(
  prevState: GameState,
  nextResources: GameState['resources'],
  summary: Omit<SolSummary, 'debriefContext'>,
  bundle: ContentBundle
): DebriefContext {
  const sol = prevState.clock.sol;
  const todayOccurrence = [...prevState.events.occurrenceHistory]
    .reverse()
    .find((occ) => occ.settledSol === sol);
  const todayEvent = todayOccurrence
    ? bundle.events.find((e) => e.id === todayOccurrence.eventId)
    : undefined;

  let briefId = summary.briefId;
  let reasonTag = 'baseline';
  let sourceEventId: string | null = null;
  let sourceChoiceId: string | null = null;

  if (summary.blackout) {
    reasonTag = 'power-blackout';
    briefId = 'brief-fission-kilopower';
  } else if (todayEvent) {
    reasonTag = 'event-choice';
    sourceEventId = todayEvent.id;
    sourceChoiceId = todayOccurrence?.choiceId ?? null;
    briefId = todayEvent.scienceBriefId || summary.briefId;
  } else if (summary.isLunarNight) {
    reasonTag = 'lunar-night';
    briefId = 'brief-lunar-cycle';
  } else if (summary.weather.level === 'storm' || summary.weather.level === 'extreme') {
    reasonTag = 'donki-storm';
    briefId = 'brief-donki-sep-flare';
  } else if (summary.wrsRecoveredWaterL > 0) {
    reasonTag = 'wrs-recovery';
    briefId = 'brief-wrs-eclss';
  }

  const matchedBrief = bundle.briefs.find((b) => b.id === briefId) ?? bundle.briefs[0];

  const metricHighlights: DebriefMetricDelta[] = [
    {
      key: 'batteryKWh',
      label: 'Pin',
      delta: summary.resourceDeltas.batteryKWh,
      unit: 'kWh',
    },
    {
      key: 'waterL',
      label: 'Nước sạch',
      delta: summary.resourceDeltas.waterL,
      unit: 'L',
    },
    {
      key: 'oxygenKg',
      label: 'Oxy',
      delta: summary.resourceDeltas.oxygenKg,
      unit: 'kg',
    },
    {
      key: 'partsKg',
      label: 'Phụ tùng',
      delta: summary.resourceDeltas.partsKg,
      unit: 'kg',
    },
  ];

  return {
    briefId: matchedBrief.id,
    reasonTag,
    sourceEventId,
    sourceChoiceId,
    // Resource deltas are produced by this run's deterministic simulation.
    // The NASA brief keeps its own provenance and is rendered separately.
    evidenceType: 'simulated',
    metricHighlights,
  };
}
