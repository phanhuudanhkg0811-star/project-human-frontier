import { createInitialGameState, validateGameCommand } from '../schemas/contracts.ts';
import { resolveSol } from './endSolResolver.ts';
import {
  applyEventEffectsAtomic,
  checkEventChoiceRequirements,
  expireActiveEvent,
  isEventEligible,
  selectNextSolEvent,
} from './eventEngine.ts';
import { deriveCrewCondition } from './crewCondition.ts';
import { validateStateInvariants } from './invariants.ts';
import type {
  ContentBundle,
  DispatchResult,
  DomainError,
  EquipmentId,
  EventNode,
  GameCommand,
  GameState,
  SolPhase,
} from '../types/index.ts';

function fail(state: GameState, code: DomainError['code'], message: string, recoverable = true): DispatchResult {
  return {
    ok: false,
    state,
    error: { code, message, recoverable },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function canOperateRover(state: GameState, crewId: keyof GameState['crew'], bundle: ContentBundle): boolean {
  const crew = state.crew[crewId];
  return (
    crew.condition === 'fit' &&
    crew.hungerState !== 'starving' &&
    crew.morale >= bundle.balance.crew.tiredBelowMorale &&
    crew.assignedTask === null
  );
}

/** Find the next eligible event for the current Sol using Phase 1.3 priority + weighted RNG rules. */
export function findNextPendingEvent(
  state: GameState,
  events: readonly EventNode[],
  bundle?: ContentBundle
): EventNode | null {
  if (state.events.activeEventId) {
    return events.find((e) => e.id === state.events.activeEventId) ?? null;
  }
  if (bundle) {
    const picked = selectNextSolEvent(state, { ...bundle, events });
    if (!picked.activeEvent) return null;
    return events.find((e) => e.id === picked.activeEvent!.eventId) ?? null;
  }
  const eligible = events.filter((ev) => {
    if (state.events.resolvedEventIds.includes(ev.id)) return false;
    return ev.when.some((cond) => {
      if (cond.sol !== undefined && cond.sol !== state.clock.sol) return false;
      if (cond.solMin !== undefined && state.clock.sol < cond.solMin) return false;
      if (cond.solMax !== undefined && state.clock.sol > cond.solMax) return false;
      return true;
    });
  });
  if (eligible.length === 0) return null;
  const maxPriority = Math.max(...eligible.map((e) => e.priority));
  return (
    eligible
      .filter((e) => e.priority === maxPriority)
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
  );
}

const NEXT_PHASE: Partial<Record<SolPhase, SolPhase>> = {
  briefing: 'engineering',
  engineering: 'comms',
  comms: 'rationing',
};

/** Battery cost (kWh) to re-acquire a signal-lost Rover via the Deep Space Network. */
const RECOVER_SIGNAL_BATTERY_KWH = 2;

/** Pure TypeScript command reducer implementing all Phase 1.1 state transitions and constitutional guards. */
export function dispatchDomainCommand(
  state: GameState,
  commandInput: GameCommand,
  bundle: ContentBundle
): DispatchResult {
  let command: GameCommand;
  try {
    command = validateGameCommand(commandInput);
  } catch (err) {
    return fail(
      state,
      'E_PLAN_INVALID',
      err instanceof Error ? err.message : 'Lệnh không hợp lệ.'
    );
  }

  if (command.type === 'game/start') {
    const fresh = createInitialGameState(bundle, {
      seed: command.seed,
      difficulty: command.difficulty,
      donkiProfileId: command.donkiProfileId,
      spaceWeatherOverride: command.spaceWeatherOverride,
    });
    const invErr = validateStateInvariants(fresh, bundle);
    if (invErr) return fail(state, invErr.code, invErr.message, false);
    return {
      ok: true,
      state: { ...fresh, revision: 1 },
      effects: [{ type: 'game-started', message: `Bắt đầu chiến dịch Moon 32 Sol (${fresh.campaign.donkiProfileId}).` }],
    };
  }

  if (state.campaign.status === 'victory' || state.campaign.status === 'defeat' || state.clock.phase === 'terminal') {
    return fail(state, 'E_PHASE_INVALID', 'Nhiệm vụ đã kết thúc; chỉ có thể khởi động ván mới.');
  }

  let candidate: GameState;

  switch (command.type) {
    case 'phase/advance': {
      if (state.clock.phase === 'briefing' && state.events.activeEventId !== null) {
        const activeEv = bundle.events.find((e) => e.id === state.events.activeEventId);
        const isMandatory = activeEv ? activeEv.mandatory : true;
        if (isMandatory) {
          return fail(state, 'E_PHASE_INVALID', 'Cần xử lý sự kiện Morning Briefing trước khi sang pha Kỹ thuật.');
        }
      }
      const next = NEXT_PHASE[state.clock.phase];
      if (!next) {
        return fail(state, 'E_PHASE_INVALID', `Không thể chuyển pha từ "${state.clock.phase}".`);
      }
      candidate = {
        ...state,
        revision: state.revision + 1,
        clock: { ...state.clock, phase: next },
        dailyPlan: next === 'rationing' ? state.dailyPlan : state.dailyPlan,
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'phase-changed', message: `Chuyển sang pha ${next}.` }],
      };
    }

    case 'event/resolve': {
      if (state.events.activeEventId !== command.eventId) {
        return fail(state, 'E_PLAN_INVALID', 'Sự kiện không khớp activeEventId hiện tại.');
      }
      const ev = bundle.events.find((e) => e.id === command.eventId);
      const choice = ev?.choices.find((c) => c.id === command.choiceId);
      if (!ev || !choice) {
        return fail(state, 'E_PLAN_INVALID', 'Lựa chọn sự kiện không hợp lệ.');
      }
      const allowedPhases: readonly SolPhase[] = ev.mandatory
        ? ['briefing']
        : ['briefing', 'engineering', 'comms', 'rationing'];
      if (!allowedPhases.includes(state.clock.phase)) {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ xử lý sự kiện tại pha hợp lệ trước khi chốt ngày.');
      }
      if (state.events.activeEvent && state.clock.sol > state.events.activeEvent.deadlineSol) {
        return fail(state, 'E_PLAN_INVALID', 'Sự kiện đã quá hạn xử lý.');
      }

      const reqCheck = checkEventChoiceRequirements(state, choice);
      if (!reqCheck.allowed) {
        const isResourceOrEq =
          Boolean(choice.requiresEquipment && (!state.equipment[choice.requiresEquipment].owned || state.equipment[choice.requiresEquipment].state === 'damaged')) ||
          reqCheck.blockedReasons.some((msg) => msg.startsWith('Không đủ'));
        return fail(
          state,
          isResourceOrEq ? 'E_INSUFFICIENT_RESOURCE' : 'E_PLAN_INVALID',
          reqCheck.blockedReasons[0] ?? 'Chưa đủ điều kiện chọn phương án này.'
        );
      }

      const applied = applyEventEffectsAtomic(state, choice.effects, bundle, {
        mode: 'choice',
        sourceEventId: ev.id,
        sourceChoiceId: choice.id,
      });
      if (!applied.ok) {
        return fail(state, applied.error.code, applied.error.message, applied.error.recoverable);
      }

      const nextOccurrenceHistory = [
        ...applied.state.events.occurrenceHistory,
        {
          eventId: ev.id,
          triggeredSol: state.events.activeEvent?.triggeredAtSol ?? state.clock.sol,
          settledSol: state.clock.sol,
          outcome: 'resolved' as const,
          choiceId: choice.id,
        },
      ];
      const nextResolvedIds = [
        ...new Set(
          nextOccurrenceHistory.filter((occ) => occ.outcome === 'resolved').map((occ) => occ.eventId)
        ),
      ];

      candidate = {
        ...applied.state,
        revision: state.revision + 1,
        events: {
          ...applied.state.events,
          activeEventId: null,
          activeEvent: null,
          resolvedEventIds: nextResolvedIds,
          occurrenceHistory: nextOccurrenceHistory,
        },
        history: {
          ...applied.state.history,
          logs: [
            ...applied.state.history.logs,
            { sol: state.clock.sol, phase: state.clock.phase, code: 'EVENT_RESOLVED', message: choice.log },
          ],
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'event-resolved', message: choice.log }],
      };
    }

    case 'crew/assign': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ phân công phi hành đoàn trong pha Kỹ thuật hoặc Liên lạc.');
      }
      const member = state.crew[command.crewId];
      if (member.condition === 'evacuated') {
        return fail(state, 'E_PLAN_INVALID', `${member.name} đã rời trạm.`);
      }
      if (member.assignedTask !== null) {
        return fail(state, 'E_PLAN_INVALID', `${member.name} đã nhận nhiệm vụ trong Sol này.`);
      }
      if (member.condition === 'injured' && command.task !== 'rest' && command.task !== 'medical-care') {
        return fail(state, 'E_PLAN_INVALID', `${member.name} đang bị thương (Injured), chỉ có thể Rest hoặc Medical Care.`);
      }
      const isTired = member.morale < bundle.balance.crew.tiredBelowMorale;
      if (isTired && (command.task === 'rover-operate' || command.task === 'emergency-response')) {
        return fail(state, 'E_PLAN_INVALID', `${member.name} đang mệt (Tired), không thể trực Rover hoặc xử lý khẩn cấp.`);
      }
      if (member.hungerState === 'starving' && command.task === 'rover-operate') {
        return fail(state, 'E_PLAN_INVALID', `${member.name} đang đói lả (Starving), bị cấm vận hành Rover.`);
      }
      if (command.task === 'medical-care') {
        if (!command.targetCrewId) return fail(state, 'E_PLAN_INVALID', 'Thiếu targetCrewId để chăm sóc y tế.');
        if (state.crew[command.targetCrewId].condition === 'evacuated') {
          return fail(state, 'E_PLAN_INVALID', 'Không thể chăm sóc phi hành gia đã evacuated.');
        }
      }

      let resources = { ...state.resources };
      let partsSpent = 0;
      if (command.task === 'repair-system') {
        if (!command.targetSystemId) return fail(state, 'E_PLAN_INVALID', 'Thiếu targetSystemId để sửa chữa.');
        if (state.systems[command.targetSystemId].integrity >= 1.0) {
          return fail(state, 'E_PLAN_INVALID', `${command.targetSystemId} đang hoạt động 100%, không cần sửa.`);
        }
        const cost = bundle.balance.systems.repairPartsCost;
        if (resources.partsKg < cost) {
          return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${cost} kg Phụ tùng để sửa hệ thống.`);
        }
        partsSpent = cost;
        resources.partsKg = round2(resources.partsKg - cost);
      } else if (command.task === 'upgrade-system') {
        if (!command.targetSystemId) return fail(state, 'E_PLAN_INVALID', 'Thiếu targetSystemId để nâng cấp.');
        const sys = state.systems[command.targetSystemId];
        const pendingUpgrades = Object.values(state.crew).filter(
          (c) =>
            c.condition !== 'evacuated' &&
            c.assignedTask?.type === 'upgrade-system' &&
            c.assignedTask.targetSystemId === command.targetSystemId
        ).length;
        if (sys.level + pendingUpgrades >= bundle.balance.systems.maxLevel) {
          return fail(
            state,
            'E_PLAN_INVALID',
            `${command.targetSystemId} đã đạt hoặc đang chờ nâng cấp tối đa (Lv${bundle.balance.systems.maxLevel}).`
          );
        }
        const targetLvl = String(sys.level + pendingUpgrades + 1) as '2' | '3';
        let cost = bundle.balance.systems.upgradePartsByTargetLevel[targetLvl];
        if (member.id === 'eng' && command.targetSystemId !== 'fabricator') {
          cost = Math.max(1, cost - 1);
        }
        if (resources.partsKg < cost) {
          return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${cost} kg Phụ tùng để nâng cấp ${command.targetSystemId}.`);
        }
        partsSpent = cost;
        resources.partsKg = round2(resources.partsKg - cost);
      }

      candidate = {
        ...state,
        revision: state.revision + 1,
        resources,
        crew: {
          ...state.crew,
          [command.crewId]: {
            ...member,
            assignedTask: {
              type: command.task,
              targetSystemId: command.targetSystemId,
              targetCrewId: command.targetCrewId,
              ...(partsSpent > 0 ? { partsSpent } : {}),
            },
          },
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'crew-assigned', message: `Đã phân công ${member.name}: ${command.task}.` }],
      };
    }

    case 'crew/unassign': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ hủy phân công phi hành gia trong pha Kỹ thuật hoặc Liên lạc.');
      }
      const member = state.crew[command.crewId];
      if (!member.assignedTask) {
        return fail(state, 'E_PLAN_INVALID', `${member.name} chưa được giao việc.`);
      }
      if (member.assignedTask.type === 'upgrade-system') {
        const targetSystemId = member.assignedTask.targetSystemId;
        // Upgrade costs are reserved in level order. Cancel the highest level first
        // so removing Lv2 never leaves another worker paying Lv3 for a Lv2 result.
        const baseCost = (crew: typeof member) => (crew.assignedTask?.partsSpent ?? 0)
          + (crew.id === 'eng' && targetSystemId !== 'fabricator' ? 1 : 0);
        if (Object.values(state.crew).some((crew) => crew.id !== member.id
          && crew.assignedTask?.type === 'upgrade-system' && crew.assignedTask.targetSystemId === targetSystemId
          && baseCost(crew) > baseCost(member))) {
          return fail(state, 'E_PLAN_INVALID', 'Hãy hủy nâng cấp cấp cao hơn của cùng hệ thống trước để giữ đúng chi phí.');
        }
      }
      const mission = state.rover.activeMission;
      if (
        member.assignedTask.type === 'rover-operate' &&
        mission &&
        mission.status === 'scheduled' &&
        mission.launchOperatorCrewId === command.crewId
      ) {
        return fail(state, 'E_PLAN_INVALID', 'Nhiệm vụ Rover đang giữ slot phóng; hãy hủy lịch Rover để đổi người.');
      }
      const isRecoveryOp = Boolean(
        member.assignedTask.type === 'rover-operate' &&
        mission &&
        mission.recoveryOperatorCrewId === command.crewId
      );
      const fallbackParts =
        member.assignedTask.type === 'repair-system' ? bundle.balance.systems.repairPartsCost : 0;
      const partsRefund = member.assignedTask.partsSpent ?? fallbackParts;
      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: {
          ...state.resources,
          partsKg: clamp(round2(state.resources.partsKg + partsRefund), 0, bundle.balance.storages.partsKg.max),
        },
        crew: {
          ...state.crew,
          [command.crewId]: { ...member, assignedTask: null },
        },
        ...(isRecoveryOp && mission
          ? { rover: { ...state.rover, activeMission: { ...mission, recoveryOperatorCrewId: null } } }
          : {}),
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'crew-assigned', message: `Đã hủy phân công cho ${member.name}.` }],
      };
    }

    case 'fabricator/queue': {
      if (state.clock.phase !== 'engineering') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ đặt lệnh 3D Fabricator trong pha Kỹ thuật.');
      }
      if (state.fabricator.usedThisSol || state.fabricator.activeJob !== null) {
        return fail(state, 'E_PLAN_INVALID', '3D Fabricator chỉ nhận tối đa 1 lệnh mỗi Sol.');
      }
      if (state.systems.fabricator.status === 'offline' || state.systems.fabricator.integrity < 0.35) {
        return fail(state, 'E_PLAN_INVALID', '3D Fabricator đang hỏng hoặc độ bền dưới 35%, cần sửa trước.');
      }

      const recipe = bundle.recipes.items.find((r) => r.id === command.itemId);
      if (!recipe) return fail(state, 'E_PLAN_INVALID', 'Công thức không tồn tại.');

      let partsCost = 0;
      let waterCost = 0;
      let batteryCost = 0;
      let durationSols = 1;

      if (command.action === 'craft') {
        if (state.systems.fabricator.level < recipe.requiredFabricatorLevel) {
          return fail(state, 'E_PLAN_INVALID', `Cần 3D Fabricator Lv${recipe.requiredFabricatorLevel} để chế tạo ${recipe.name}.`);
        }
        if (recipe.category === 'equipment' && state.equipment[recipe.id as EquipmentId].owned) {
          return fail(state, 'E_PLAN_INVALID', `${recipe.name} đã có trên LR Rack.`);
        }
        partsCost = recipe.craftCost.partsKg;
        waterCost = recipe.craftCost.waterL;
        batteryCost = recipe.craftCost.batteryKWh;
        durationSols = recipe.craftCost.durationSols;
      } else if (command.action === 'upgrade') {
        if (!recipe.upgradeCost) return fail(state, 'E_PLAN_INVALID', `${recipe.name} không có nâng cấp Lv2.`);
        if (recipe.id === 'medkit' && state.resources.medkitLevel >= 2) {
          return fail(state, 'E_PLAN_INVALID', 'Medkit đã đạt Cấp 2.');
        }
        if (recipe.category === 'equipment') {
          const eq = state.equipment[recipe.id as EquipmentId];
          if (!eq.owned) return fail(state, 'E_PLAN_INVALID', `Chưa sở hữu ${recipe.name} để nâng cấp.`);
          if (eq.level >= 2) return fail(state, 'E_PLAN_INVALID', `${recipe.name} đã đạt Cấp 2.`);
        }
        partsCost = recipe.upgradeCost.partsKg;
        waterCost = recipe.upgradeCost.waterL;
        batteryCost = recipe.upgradeCost.batteryKWh;
        durationSols = recipe.upgradeCost.durationSols;
      } else if (command.action === 'repair') {
        if (recipe.category !== 'equipment') return fail(state, 'E_PLAN_INVALID', 'Chỉ sửa chữa được Equipment.');
        const eq = state.equipment[recipe.id as EquipmentId];
        if (!eq.owned || eq.durability >= 100) {
          return fail(state, 'E_PLAN_INVALID', `${recipe.name} không cần sửa chữa.`);
        }
        partsCost = bundle.recipes.rules.repairCost.partsKg;
        waterCost = bundle.recipes.rules.repairCost.waterL;
        batteryCost = bundle.recipes.rules.repairCost.batteryKWh;
        durationSols = bundle.recipes.rules.repairCost.durationSols;
      } else if (command.action === 'recycle') {
        if (recipe.category !== 'equipment') return fail(state, 'E_PLAN_INVALID', 'Chỉ tái chế được Equipment.');
        const eq = state.equipment[recipe.id as EquipmentId];
        if (!eq.owned || eq.reservedForRover) {
          return fail(state, 'E_PLAN_INVALID', `${recipe.name} không thể tái chế lúc này.`);
        }
        durationSols = bundle.recipes.rules.recycleDurationSols;
      }

      const batteryPerSol = durationSols > 1 ? round2(batteryCost / durationSols) : batteryCost;
      const batteryReserved = batteryPerSol;

      if (state.resources.partsKg < partsCost) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${partsCost} kg Phụ tùng.`);
      }
      if (state.resources.waterL < waterCost) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${waterCost} L Nước.`);
      }
      if (state.resources.batteryKWh < batteryReserved) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần tối thiểu ${batteryReserved} kWh Pin.`);
      }

      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: {
          ...state.resources,
          partsKg: round2(state.resources.partsKg - partsCost),
          waterL: round2(state.resources.waterL - waterCost),
        },
        fabricator: {
          usedThisSol: true,
          activeJob: {
            action: command.action,
            itemId: command.itemId,
            startedSol: state.clock.sol,
            solsRemaining: durationSols,
            partsSpent: partsCost,
            waterSpent: waterCost,
            batteryReserved,
          },
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'fabricator-queued', message: `3D Fabricator bắt đầu ${command.action} ${recipe.name}.` }],
      };
    }

    case 'fabricator/cancel': {
      if (state.clock.phase !== 'engineering') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ hủy lệnh 3D Fabricator trong pha Kỹ thuật.');
      }
      const job = state.fabricator.activeJob;
      if (!job) return fail(state, 'E_PLAN_INVALID', 'Không có lệnh 3D Fabricator nào đang chạy.');
      const s = bundle.balance.storages;
      const refundRate = job.startedSol < state.clock.sol ? 0.5 : 1.0;
      const refundParts = round2(job.partsSpent * refundRate);
      const refundWater = round2(job.waterSpent * refundRate);
      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: {
          ...state.resources,
          partsKg: clamp(round2(state.resources.partsKg + refundParts), 0, s.partsKg.max),
          waterL: clamp(round2(state.resources.waterL + refundWater), 0, s.waterL.max),
        },
        fabricator: { usedThisSol: true, activeJob: null },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [
          {
            type: 'fabricator-queued',
            message:
              refundRate < 1
                ? 'Đã hủy lệnh 3D Fabricator đang in dở (hoàn trả 50% vật tư, giữ giới hạn 1 lệnh/Sol).'
                : 'Đã hủy lệnh 3D Fabricator và hoàn trả 100% vật tư (giữ giới hạn 1 lệnh/Sol).',
          },
        ],
      };
    }

    case 'comms/send-radio': {
      if (state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ gửi điện tín CAPCOM trong pha Liên lạc.');
      }
      if (state.logistics.radioMessages.some((m) => m.id === command.id)) {
        return fail(state, 'E_PLAN_INVALID', 'ID tin nhắn radio đã tồn tại.');
      }
      const delay = bundle.balance.logistics.radioLatencyMs * 2 + bundle.balance.logistics.groundProcessingMs;
      const readyAt = (command.nowMs ?? 0) + delay;
      candidate = {
        ...state,
        revision: state.revision + 1,
        logistics: {
          ...state.logistics,
          radioMessages: [
            ...state.logistics.radioMessages,
            {
              id: command.id,
              sentSol: state.clock.sol,
              prompt: command.message,
              status: 'transmitting',
              reply: null,
              replyReadyAtMs: readyAt,
            },
          ],
        },
      };
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'cargo-ordered', message: 'Đã phát tín hiệu vô tuyến tới Houston (1,3 s/chiều, phản hồi ~3,8 s).' }],
      };
    }

    case 'comms/tick-radio': {
      const anyDue = state.logistics.radioMessages.some(
        (msg) => msg.status === 'transmitting' && command.nowMs >= msg.replyReadyAtMs
      );
      if (!anyDue) return { ok: true, state, effects: [] };
      const sol = state.clock.sol;
      const stageReply =
        sol < 15
          ? 'CAPCOM Houston xác nhận: Đã ghi nhận dữ liệu telemetry trạm Artemis. Khuyến nghị theo dõi pin và tích lũy mẫu vật trước Đêm Trăng Sol 15.'
          : sol < 29
            ? 'CAPCOM Houston xác nhận: Trạm đang trong Đêm Trăng cực lạnh (-185°C). Hãy duy trì dòng điện nền lò Fission và bảo vệ đường ống sinh tồn ECLSS.'
            : 'CAPCOM Houston xác nhận: Bình minh Sol 29 đã tới Nam Cực Mặt Trăng. Pin mặt trời đã phát điện trở lại; dồn sức hoàn thành các mục tiêu khảo sát cuối cùng!';
      const updated = state.logistics.radioMessages.map((msg) =>
        msg.status === 'transmitting' && command.nowMs >= msg.replyReadyAtMs
          ? {
              ...msg,
              status: 'reply-received' as const,
              reply: stageReply,
            }
          : msg
      );
      candidate = {
        ...state,
        revision: state.revision + 1,
        logistics: { ...state.logistics, radioMessages: updated },
      };
      return { ok: true, state: candidate, effects: [] };
    }

    case 'comms/order-cargo': {
      if (state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ đặt tàu tiếp tế trong pha Liên lạc.');
      }
      if (state.logistics.activeOrder !== null) {
        return fail(state, 'E_PLAN_INVALID', 'Đang có tàu tiếp tế trên đường bay.');
      }
      if (state.logistics.padCooldownSols > 0) {
        return fail(state, 'E_PLAN_INVALID', 'Bãi đáp đang hồi phục sau chuyến tiếp tế trước.');
      }
      const totalSlots = Object.values(command.slots).reduce((acc, v) => acc + (v ?? 0), 0);
      if (totalSlots < 1 || totalSlots > bundle.balance.logistics.maxSlots) {
        return fail(state, 'E_PLAN_INVALID', `Tổng số slot phải từ 1 đến ${bundle.balance.logistics.maxSlots} (tối đa 80 kg).`);
      }

      candidate = {
        ...state,
        revision: state.revision + 1,
        logistics: {
          ...state.logistics,
          activeOrder: {
            id: `cargo-sol-${state.clock.sol}`,
            orderedAtSol: state.clock.sol,
            arrivalSol: state.clock.sol + bundle.balance.logistics.transitSols,
            slots: { ...command.slots },
          },
        },
      };
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'cargo-ordered', message: `Đã phóng tàu tiếp tế (${totalSlots * 20} kg), dự kiến hạ cánh tại Sol ${state.clock.sol + bundle.balance.logistics.transitSols}.` }],
      };
    }

    case 'rover/schedule': {
      if (state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ lập lịch Rover trong pha Liên lạc.');
      }
      if (state.rover.activeMission !== null) {
        return fail(state, 'E_PLAN_INVALID', 'Rover đang có nhiệm vụ hoạt động.');
      }
      const exp = bundle.campaign.expeditions.find((e) => e.id === command.expeditionId);
      if (!exp) return fail(state, 'E_PLAN_INVALID', 'Chuyến thám hiểm không hợp lệ.');
      if (state.rover.missionHistory.some((result) => result.expeditionId === exp.id)) {
        return fail(state, 'E_PLAN_INVALID', 'Chuyến thám hiểm này đã được giải quyết và không thể chạy lại.');
      }
      if (state.clock.sol < exp.windowStartSol || state.clock.sol > exp.windowEndSol) {
        return fail(state, 'E_PLAN_INVALID', `Chỉ có thể lập lịch chuyến này trong Sol ${exp.windowStartSol}-${exp.windowEndSol}.`);
      }
      if (command.equipmentIds.length > 3) {
        return fail(state, 'E_PLAN_INVALID', 'Rover chỉ mang tối đa 3 thiết bị.');
      }
      if (!canOperateRover(state, command.launchOperatorCrewId, bundle)) {
        return fail(state, 'E_PLAN_INVALID', 'Người trực phóng phải rảnh, Fit và không Tired/Starving.');
      }
      const operator = state.crew[command.launchOperatorCrewId];

      const nextEq = { ...state.equipment };
      for (const eqId of command.equipmentIds) {
        const eq = nextEq[eqId];
        if (!eq.owned || eq.state === 'damaged' || eq.reservedForRover) {
          return fail(state, 'E_PLAN_INVALID', `Thiết bị ${eqId} không sẵn sàng gắn lên Rover.`);
        }
        nextEq[eqId] = { ...eq, reservedForRover: true };
      }

      candidate = {
        ...state,
        revision: state.revision + 1,
        crew: {
          ...state.crew,
          [operator.id]: { ...operator, assignedTask: { type: 'rover-operate' } },
        },
        equipment: nextEq,
        rover: {
          ...state.rover,
          activeMission: {
            expeditionId: exp.id,
            status: 'scheduled',
            scheduledSol: state.clock.sol,
            launchedSol: null,
            statusEnteredSol: state.clock.sol,
            expectedReturnSol: null,
            launchOperatorCrewId: operator.id,
            recoveryOperatorCrewId: null,
            equippedItems: [...command.equipmentIds],
            travelTicksCompleted: 0,
            signalLostSols: 0,
            resumeStatus: null,
            recoveryDelaySols: 0,
            incidents: [],
          },
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'rover-scheduled', message: `${operator.name} đã lập lịch phóng Rover tới ${exp.name}.` }],
      };
    }

    case 'rover/cancel-schedule': {
      if (state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ hủy lịch Rover trong pha Liên lạc.');
      }
      const mission = state.rover.activeMission;
      if (!mission || mission.status !== 'scheduled') {
        return fail(state, 'E_PLAN_INVALID', 'Không có lịch Rover đang chờ để hủy.');
      }
      const equipment = { ...state.equipment };
      for (const id of mission.equippedItems) equipment[id] = { ...equipment[id], reservedForRover: false };
      const operator = state.crew[mission.launchOperatorCrewId];
      candidate = {
        ...state,
        revision: state.revision + 1,
        equipment,
        crew: {
          ...state.crew,
          [operator.id]: operator.assignedTask?.type === 'rover-operate' ? { ...operator, assignedTask: null } : operator,
        },
        rover: { ...state.rover, activeMission: null },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return { ok: true, state: candidate, effects: [{ type: 'rover-cancelled', message: 'Đã hủy lịch Rover và trả thiết bị về LR Rack.' }] };
    }

    case 'rover/recover-signal': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ khôi phục tín hiệu Rover trong pha Kỹ thuật hoặc Liên lạc.');
      }
      const mission = state.rover.activeMission;
      if (!mission || mission.status !== 'signal-lost' || mission.resumeStatus === null) {
        return fail(state, 'E_PLAN_INVALID', 'Rover hiện không ở trạng thái mất tín hiệu.');
      }
      // Deep Space Network re-acquisition burns transponder power; report 9.8 calls for a
      // modest cost, not a repeater prerequisite.
      if (state.resources.batteryKWh < RECOVER_SIGNAL_BATTERY_KWH) {
        return fail(
          state,
          'E_INSUFFICIENT_RESOURCE',
          `Khôi phục tín hiệu Rover cần ${RECOVER_SIGNAL_BATTERY_KWH} kWh Pin.`
        );
      }
      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: {
          ...state.resources,
          batteryKWh: round2(state.resources.batteryKWh - RECOVER_SIGNAL_BATTERY_KWH),
        },
        rover: {
          ...state.rover,
          activeMission: {
            ...mission,
            status: mission.resumeStatus,
            statusEnteredSol: state.clock.sol,
            expectedReturnSol: mission.expectedReturnSol === null ? null : mission.expectedReturnSol + mission.signalLostSols,
            signalLostSols: 0,
            resumeStatus: null,
          },
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{
          type: 'rover-signal-recovered',
          message: `Đã khôi phục liên lạc với Rover (tốn ${RECOVER_SIGNAL_BATTERY_KWH} kWh Pin).`,
        }],
      };
    }

    case 'rover/clear-recovery-operator': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ gỡ phân công thu hồi Rover trong pha Kỹ thuật hoặc Liên lạc.');
      }
      const mission = state.rover.activeMission;
      if (!mission || (mission.status !== 'exploring' && mission.status !== 'recovery-pending')) {
        return fail(state, 'E_PLAN_INVALID', 'Rover chưa đến thời điểm phân công thu hồi.');
      }
      if (mission.recoveryOperatorCrewId === null) {
        return fail(state, 'E_PLAN_INVALID', 'Chưa có người thu hồi Rover nào được phân công.');
      }
      const operatorId = mission.recoveryOperatorCrewId;
      const operator = state.crew[operatorId];
      candidate = {
        ...state,
        revision: state.revision + 1,
        crew: {
          ...state.crew,
          [operatorId]:
            operator.assignedTask?.type === 'rover-operate' ? { ...operator, assignedTask: null } : operator,
        },
        rover: {
          ...state.rover,
          activeMission: { ...mission, recoveryOperatorCrewId: null },
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'rover-recovery-assigned', message: 'Đã gỡ phân công thu hồi Rover.' }],
      };
    }

    case 'rover/set-recovery-operator': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ phân công thu hồi Rover trong pha Kỹ thuật hoặc Liên lạc.');
      }
      const mission = state.rover.activeMission;
      if (!mission || (mission.status !== 'exploring' && mission.status !== 'recovery-pending')) {
        return fail(state, 'E_PLAN_INVALID', 'Rover chưa đến thời điểm phân công thu hồi.');
      }
      if (mission.expectedReturnSol !== null && state.clock.sol < mission.expectedReturnSol) {
        return fail(state, 'E_PLAN_INVALID', `Chỉ phân công thu hồi từ Sol ${mission.expectedReturnSol}.`);
      }
      if (!canOperateRover(state, command.crewId, bundle)) {
        return fail(state, 'E_PLAN_INVALID', 'Người thu hồi phải rảnh, Fit và không Tired/Starving.');
      }
      const operator = state.crew[command.crewId];
      const prevOperatorId = mission.recoveryOperatorCrewId;
      const nextCrew = {
        ...state.crew,
        ...(prevOperatorId && prevOperatorId !== operator.id && state.crew[prevOperatorId]
          ? { [prevOperatorId]: { ...state.crew[prevOperatorId], assignedTask: null } }
          : {}),
        [operator.id]: { ...operator, assignedTask: { type: 'rover-operate' as const } },
      };
      candidate = {
        ...state,
        revision: state.revision + 1,
        crew: nextCrew,
        rover: { ...state.rover, activeMission: { ...mission, recoveryOperatorCrewId: operator.id } },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return { ok: true, state: candidate, effects: [{ type: 'rover-recovery-assigned', message: `${operator.name} sẽ trực thu hồi Rover.` }] };
    }

    case 'crew/use-medkit': {
      if (state.clock.phase !== 'engineering' && state.clock.phase !== 'rationing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ dùng Medkit trong pha Kỹ thuật hoặc Phân phối.');
      }
      if (state.resources.medkits < 1) return fail(state, 'E_INSUFFICIENT_RESOURCE', 'Không còn Medkit trong kho.');
      const target = state.crew[command.targetCrewId];
      if (target.condition === 'evacuated') return fail(state, 'E_PLAN_INVALID', 'Không thể điều trị phi hành gia đã evacuated.');
      if (target.health >= 100) return fail(state, 'E_PLAN_INVALID', `${target.name} đang có Health tối đa.`);
      let medicBonus = 0;
      const crew = { ...state.crew };
      if (command.administeredByCrewId !== undefined) {
        if (command.administeredByCrewId !== 'doc') {
          return fail(state, 'E_PLAN_INVALID', 'Chỉ Mizuki Murakami có bonus khi trực tiếp dùng Medkit.');
        }
        const medic = state.crew.doc;
        if (medic.condition !== 'fit' || medic.assignedTask !== null) {
          return fail(state, 'E_PLAN_INVALID', 'Mizuki phải Fit và rảnh để trực tiếp dùng Medkit.');
        }
        medicBonus = bundle.balance.consumables.medkits.medicBonus;
        // Occupies Mizuki's task slot, but must not also apply the separate End-Sol medical-care heal.
        crew.doc = { ...medic, assignedTask: { type: 'medical-care' } };
      }
      const baseHeal = state.resources.medkitLevel === 2
        ? bundle.balance.consumables.medkits.healLv2
        : bundle.balance.consumables.medkits.healLv1;
      const nextHealth = clamp(target.health + baseHeal + medicBonus, 0, 100);
      crew[target.id] = {
        ...crew[target.id],
        health: nextHealth,
        condition: deriveCrewCondition(
          nextHealth,
          target.condition,
          bundle.balance.crew.fitRecoverAtHealth,
          bundle.balance.crew.injuredBelowHealth
        ),
      };
      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: { ...state.resources, medkits: state.resources.medkits - 1 },
        crew,
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return { ok: true, state: candidate, effects: [{ type: 'medkit-used', message: `Đã dùng Medkit cho ${target.name}: Health ${nextHealth}.` }] };
    }

    case 'rationing/set-wrs': {
      if (state.clock.phase !== 'rationing' && state.clock.phase !== 'engineering') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ bật/tắt WRS trong pha Kỹ thuật hoặc Phân phối.');
      }
      candidate = {
        ...state,
        revision: state.revision + 1,
        dailyPlan: { ...state.dailyPlan, wrsEnabled: command.enabled },
      };
      return { ok: true, state: candidate, effects: [] };
    }

    case 'rationing/set-power-priority': {
      if (state.clock.phase !== 'rationing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ chỉnh thứ tự ưu tiên điện trong pha Phân phối.');
      }
      if (new Set(command.order).size !== 4) {
        return fail(state, 'E_PLAN_INVALID', 'Danh sách ưu tiên điện phải đủ 4 nhóm tải.');
      }
      candidate = {
        ...state,
        revision: state.revision + 1,
        dailyPlan: { ...state.dailyPlan, powerPriority: [...command.order] },
      };
      return { ok: true, state: candidate, effects: [] };
    }

    case 'rationing/toggle-mre': {
      if (state.clock.phase !== 'rationing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ phát MRE trong pha Phân phối.');
      }
      const already = state.dailyPlan.mreTargets.includes(command.crewId);
      const nextEnable = command.enabled ?? !already;
      if (nextEnable && state.dailyPlan.mreTargets.length >= state.resources.mrePacks) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', 'Không đủ gói MRE trong kho.');
      }
      const nextList = nextEnable
        ? already
          ? state.dailyPlan.mreTargets
          : [...state.dailyPlan.mreTargets, command.crewId]
        : state.dailyPlan.mreTargets.filter((id) => id !== command.crewId);
      candidate = {
        ...state,
        revision: state.revision + 1,
        dailyPlan: { ...state.dailyPlan, mreTargets: nextList },
      };
      return { ok: true, state: candidate, effects: [] };
    }

    case 'sol/end': {
      if (state.clock.phase !== 'rationing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ có thể chốt ngày (End-Sol) tại pha Phân phối (Rationing).');
      }
      const committedState: GameState = {
        ...state,
        dailyPlan: { ...state.dailyPlan, status: 'committed' },
      };
      const resolved = resolveSol(committedState, bundle, 'commit');
      const invErr = validateStateInvariants(resolved.nextState, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: resolved.nextState,
        effects: [{ type: 'sol-resolved', message: `Đã hoàn tất tính toán End-Sol ${state.clock.sol}.` }],
      };
    }

    case 'debrief/dismiss': {
      if (state.clock.phase !== 'debrief') {
        return fail(state, 'E_PHASE_INVALID', 'Không ở màn hình Debrief.');
      }
      const nextSol = state.clock.sol + 1;
      const clearedRover =
        state.rover.activeMission?.status === 'completed' || state.rover.activeMission?.status === 'failed'
          ? { ...state.rover, activeMission: null }
          : state.rover;
      let previewNextState: GameState = {
        ...state,
        clock: { ...state.clock, sol: nextSol, phase: 'briefing' },
        rover: clearedRover,
      };
      const activeEventNode = previewNextState.events.activeEvent
        ? bundle.events.find((event) => event.id === previewNextState.events.activeEvent!.eventId)
        : null;
      const mandatoryEventWaiting = bundle.events.some(
        (event) => event.mandatory && isEventEligible(previewNextState, event, bundle)
      );
      if (activeEventNode && !activeEventNode.mandatory && mandatoryEventWaiting) {
        previewNextState = expireActiveEvent(previewNextState, bundle).state;
      }
      const nextEventSelection = selectNextSolEvent(previewNextState, bundle);
      const nextActiveEvent = nextEventSelection.activeEvent;
      candidate = {
        ...previewNextState,
        revision: state.revision + 1,
        dailyPlan: {
          sol: nextSol,
          status: 'draft',
          wrsEnabled: state.dailyPlan.wrsEnabled,
          powerPriority: state.dailyPlan.powerPriority,
          mreTargets: [],
        },
        events: {
          ...previewNextState.events,
          activeEventId: nextActiveEvent ? nextActiveEvent.eventId : null,
          activeEvent: nextActiveEvent,
          pendingFollowUps: nextEventSelection.pendingFollowUps,
        },
        debrief: {
          pendingDismiss: false,
          lastSummary: state.debrief.lastSummary,
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'debrief-dismissed', message: `Bắt đầu Sol ${nextSol}.` }],
      };
    }

    default:
      return fail(state, 'E_PLAN_INVALID', 'Command không được hỗ trợ.');
  }
}
