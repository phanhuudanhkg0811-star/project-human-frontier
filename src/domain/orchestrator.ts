import { createInitialGameState, validateGameCommand } from '../schemas/contracts.ts';
import { resolveSol } from './endSolResolver.ts';
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

/** Find the first unresolved mandatory event triggered for the current Sol. */
export function findNextPendingEvent(state: GameState, events: readonly EventNode[]): EventNode | null {
  if (state.events.activeEventId) {
    return events.find((e) => e.id === state.events.activeEventId) ?? null;
  }
  for (const ev of events) {
    if (state.events.resolvedEventIds.includes(ev.id)) continue;
    const matches = ev.when.some((cond) => {
      if (cond.sol !== undefined && cond.sol === state.clock.sol) return true;
      if (cond.solMin !== undefined && cond.solMax !== undefined) {
        return state.clock.sol >= cond.solMin && state.clock.sol <= cond.solMax;
      }
      return false;
    });
    if (matches) return ev;
  }
  return null;
}

const NEXT_PHASE: Partial<Record<SolPhase, SolPhase>> = {
  briefing: 'engineering',
  engineering: 'comms',
  comms: 'rationing',
};

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
        return fail(state, 'E_PHASE_INVALID', 'Cần xử lý sự kiện Morning Briefing trước khi sang pha Kỹ thuật.');
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
      if (state.clock.phase !== 'briefing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ xử lý sự kiện tại pha Morning Briefing.');
      }
      if (state.events.activeEventId !== command.eventId) {
        return fail(state, 'E_PLAN_INVALID', 'Sự kiện không khớp activeEventId hiện tại.');
      }
      const ev = bundle.events.find((e) => e.id === command.eventId);
      const choice = ev?.choices.find((c) => c.id === command.choiceId);
      if (!ev || !choice) {
        return fail(state, 'E_PLAN_INVALID', 'Lựa chọn sự kiện không hợp lệ.');
      }
      if (choice.requiresEquipment) {
        const eq = state.equipment[choice.requiresEquipment];
        if (!eq.owned || eq.state === 'damaged') {
          return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần thiết bị ${choice.requiresEquipment} còn dùng được.`);
        }
      }

      const r = { ...state.resources };
      const s = bundle.balance.storages;
      if (choice.effects.resources?.partsKg) {
        const nextVal = round2(r.partsKg + choice.effects.resources.partsKg);
        if (nextVal < 0) return fail(state, 'E_INSUFFICIENT_RESOURCE', 'Không đủ Phụ tùng cho lựa chọn này.');
        r.partsKg = clamp(nextVal, 0, s.partsKg.max);
      }
      if (choice.effects.resources?.batteryKWh) {
        const nextVal = round2(r.batteryKWh + choice.effects.resources.batteryKWh);
        if (nextVal < 0) return fail(state, 'E_INSUFFICIENT_RESOURCE', 'Không đủ Pin cho lựa chọn này.');
        r.batteryKWh = clamp(nextVal, 0, s.batteryKWh.max);
      }
      if (choice.effects.resources?.oxygenKg) {
        r.oxygenKg = clamp(round2(r.oxygenKg + choice.effects.resources.oxygenKg), 0, s.oxygenKg.max);
      }
      if (choice.effects.resources?.waterL) {
        r.waterL = clamp(round2(r.waterL + choice.effects.resources.waterL), 0, s.waterL.max);
      }
      if (choice.effects.resources?.mrePacks) {
        r.mrePacks = clamp(r.mrePacks + choice.effects.resources.mrePacks, 0, bundle.balance.consumables.mrePacks.max);
      }

      const nextCrew = { ...state.crew };
      if (choice.effects.crew) {
        for (const id of ['cmd', 'eng', 'doc', 'geo'] as const) {
          const c = nextCrew[id];
          if (c.condition === 'evacuated') continue;
          nextCrew[id] = {
            ...c,
            health: clamp(c.health + (choice.effects.crew.healthDelta ?? 0), 0, 100),
            morale: clamp(c.morale + (choice.effects.crew.moraleDelta ?? 0), 0, 100),
          };
        }
      }

      const nextEq = { ...state.equipment };
      if (choice.effects.equipmentDamage) {
        const eq = nextEq[choice.effects.equipmentDamage.id];
        const nextDur = clamp(eq.durability - choice.effects.equipmentDamage.wear, 0, 100);
        nextEq[choice.effects.equipmentDamage.id] = {
          ...eq,
          durability: nextDur,
          state: nextDur > 50 ? 'good' : nextDur > 0 ? 'worn' : 'damaged',
        };
      }

      const nextSys = { ...state.systems };
      if (choice.effects.systemIntegrity) {
        const sys = nextSys[choice.effects.systemIntegrity.id];
        const nextInt = clamp(round2(sys.integrity + choice.effects.systemIntegrity.delta), 0, 1);
        nextSys[choice.effects.systemIntegrity.id] = {
          ...sys,
          integrity: nextInt,
          status: nextInt >= 0.85 ? 'nominal' : nextInt > 0 ? 'degraded' : 'offline',
        };
      }

      candidate = {
        ...state,
        revision: state.revision + 1,
        resources: r,
        crew: nextCrew,
        equipment: nextEq,
        systems: nextSys,
        dailyPlan: {
          ...state.dailyPlan,
          wrsEnabled: choice.effects.planOverride?.wrsEnabled ?? state.dailyPlan.wrsEnabled,
        },
        events: {
          activeEventId: null,
          resolvedEventIds: [...state.events.resolvedEventIds, ev.id],
        },
        history: {
          ...state.history,
          logs: [...state.history.logs, { sol: state.clock.sol, phase: 'briefing', code: 'EVENT_RESOLVED', message: choice.log }],
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

      let resources = { ...state.resources };
      let partsSpent = 0;
      if (command.task === 'repair-system') {
        if (!command.targetSystemId) return fail(state, 'E_PLAN_INVALID', 'Thiếu targetSystemId để sửa chữa.');
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
      if (state.systems.fabricator.status === 'offline') {
        return fail(state, 'E_PLAN_INVALID', '3D Fabricator đang hỏng, cần sửa trước.');
      }

      const recipe = bundle.recipes.items.find((r) => r.id === command.itemId);
      if (!recipe) return fail(state, 'E_PLAN_INVALID', 'Công thức không tồn tại.');

      let partsCost = 0;
      let waterCost = 0;
      let batteryReserved = 0;
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
        batteryReserved = recipe.craftCost.batteryKWh;
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
        batteryReserved = recipe.upgradeCost.batteryKWh;
        durationSols = recipe.upgradeCost.durationSols;
      } else if (command.action === 'repair') {
        if (recipe.category !== 'equipment') return fail(state, 'E_PLAN_INVALID', 'Chỉ sửa chữa được Equipment.');
        const eq = state.equipment[recipe.id as EquipmentId];
        if (!eq.owned || eq.durability >= 100) {
          return fail(state, 'E_PLAN_INVALID', `${recipe.name} không cần sửa chữa.`);
        }
        partsCost = bundle.recipes.rules.repairCost.partsKg;
        waterCost = bundle.recipes.rules.repairCost.waterL;
        batteryReserved = bundle.recipes.rules.repairCost.batteryKWh;
        durationSols = bundle.recipes.rules.repairCost.durationSols;
      } else if (command.action === 'recycle') {
        if (recipe.category !== 'equipment') return fail(state, 'E_PLAN_INVALID', 'Chỉ tái chế được Equipment.');
        const eq = state.equipment[recipe.id as EquipmentId];
        if (!eq.owned || eq.reservedForRover) {
          return fail(state, 'E_PLAN_INVALID', `${recipe.name} không thể tái chế lúc này.`);
        }
        durationSols = bundle.recipes.rules.recycleDurationSols;
      }

      if (state.resources.partsKg < partsCost) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${partsCost} kg Phụ tùng.`);
      }
      if (state.resources.waterL < waterCost) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${waterCost} L Nước.`);
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
        effects: [{ type: 'cargo-ordered', message: 'Đã phát tín hiệu vô tuyến tới Houston (độ trễ ~1.3s chiều đi).' }],
      };
    }

    case 'comms/tick-radio': {
      const updated = state.logistics.radioMessages.map((msg) =>
        msg.status === 'transmitting' && command.nowMs >= msg.replyReadyAtMs
          ? {
              ...msg,
              status: 'reply-received' as const,
              reply: 'CAPCOM Houston xác nhận: Đã ghi nhận dữ liệu telemetry trạm Artemis. Khuyến nghị theo dõi pin trước Đêm Trăng Sol 15.',
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

    case 'rover/launch': {
      if (state.clock.phase !== 'comms') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ phóng Rover trong pha Liên lạc.');
      }
      if (state.rover.status !== 'idle') {
        return fail(state, 'E_PLAN_INVALID', 'Rover đang bận hoặc hỏng.');
      }
      const exp = bundle.campaign.expeditions.find((e) => e.id === command.expeditionId);
      if (!exp) return fail(state, 'E_PLAN_INVALID', 'Chuyến thám hiểm không hợp lệ.');
      if (command.equipmentIds.length > 3) {
        return fail(state, 'E_PLAN_INVALID', 'Rover chỉ mang tối đa 3 thiết bị.');
      }
      const operator = Object.values(state.crew).find(
        (c) => c.condition === 'fit' && c.hungerState !== 'starving' && c.morale >= bundle.balance.crew.tiredBelowMorale && c.assignedTask === null
      );
      if (!operator) {
        return fail(state, 'E_PLAN_INVALID', 'Cần 1 phi hành gia rảnh rỗi, Fit, không Tired/Starving để trực phóng Rover.');
      }
      if (state.resources.batteryKWh < exp.launchPowerKWh) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', `Cần ${exp.launchPowerKWh} kWh Pin để phóng Rover.`);
      }

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
        resources: { ...state.resources, batteryKWh: round2(state.resources.batteryKWh - exp.launchPowerKWh) },
        crew: {
          ...state.crew,
          [operator.id]: { ...operator, assignedTask: { type: 'rover-operate' } },
        },
        equipment: nextEq,
        rover: {
          ...state.rover,
          status: 'outbound',
          expeditionId: exp.id,
          solsRemaining: exp.durationSols,
          equippedItems: [...command.equipmentIds],
        },
      };
      const invErr = validateStateInvariants(candidate, bundle);
      if (invErr) return fail(state, invErr.code, invErr.message, false);
      return {
        ok: true,
        state: candidate,
        effects: [{ type: 'rover-launched', message: `${operator.name} đã phóng Rover tới ${exp.name}.` }],
      };
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

    case 'rationing/toggle-medkit': {
      if (state.clock.phase !== 'rationing') {
        return fail(state, 'E_PHASE_INVALID', 'Chỉ phát Medkit trong pha Phân phối.');
      }
      const already = state.dailyPlan.medkitTargets.includes(command.crewId);
      const nextEnable = command.enabled ?? !already;
      if (nextEnable && state.dailyPlan.medkitTargets.length >= state.resources.medkits) {
        return fail(state, 'E_INSUFFICIENT_RESOURCE', 'Không đủ liều Medkit trong kho.');
      }
      const nextList = nextEnable
        ? already
          ? state.dailyPlan.medkitTargets
          : [...state.dailyPlan.medkitTargets, command.crewId]
        : state.dailyPlan.medkitTargets.filter((id) => id !== command.crewId);
      candidate = {
        ...state,
        revision: state.revision + 1,
        dailyPlan: { ...state.dailyPlan, medkitTargets: nextList },
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
      const previewNextState: GameState = {
        ...state,
        clock: { ...state.clock, sol: nextSol, phase: 'briefing' },
        events: { ...state.events, activeEventId: null },
      };
      const pendingEv = findNextPendingEvent(previewNextState, bundle.events);
      candidate = {
        ...previewNextState,
        revision: state.revision + 1,
        dailyPlan: {
          sol: nextSol,
          status: 'draft',
          wrsEnabled: state.dailyPlan.wrsEnabled,
          powerPriority: state.dailyPlan.powerPriority,
          mreTargets: [],
          medkitTargets: [],
        },
        events: {
          activeEventId: pendingEv ? pendingEv.id : null,
          resolvedEventIds: state.events.resolvedEventIds,
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
