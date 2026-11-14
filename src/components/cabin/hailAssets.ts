import type { CrewMemberState, EventArtId, SystemId } from '../../types/index.ts';

export const HAIL_ASSET_BASE = '/assets/hail';

export function hailUrl(relPath: string): string {
  return encodeURI(`${HAIL_ASSET_BASE}/${relPath.replace(/^\/+/, '')}`);
}

export const HAIL_ENV = {
  spaceDeep: hailUrl('environments/PH_ENV_SPACE_DEEP_BASE_V01.webp'),
  lunarDay: hailUrl('environments/PH_ENV_LUNAR_EXTERIOR_DAY_V01.webp'),
  lunarNight: hailUrl('environments/PH_ENV_LUNAR_EXTERIOR_NIGHT_V01.webp'),
  cockpitShell: hailUrl('environments/PH_ENV_COCKPIT_SHELL_BASE_V01.webp'),
  lunarMap: hailUrl('environments/PH_ENV_LUNAR_MAP_BASE_V01.webp'),
  lunarCrater: hailUrl('environments/PH_ENV_LUNAR_CRATER_BASE_V01.webp'),
  regolithField: hailUrl('environments/PH_ENV_REGOLITH_FIELD_BASE_V01.webp'),
  lunarPsr: hailUrl('environments/PH_ENV_LUNAR_PSR_BASE_V01.webp'),
} as const;

export const HAIL_FX = {
  degraded: hailUrl('effects/PH_FX_OVERLAY_DEGRADED_V01.webp'),
  broken: hailUrl('effects/PH_FX_OVERLAY_BROKEN_V01.webp'),
} as const;

export const HAIL_EQUIPMENT = {
  oxygenBase: hailUrl('equipment/PH_EQP_OXYGEN_GENERATOR_BASE_V12.webp'),
  oxygenDegraded: hailUrl('equipment/PH_EQP_OXYGEN_GENERATOR_DEGRADED_V01.webp'),
  oxygenBroken: hailUrl('equipment/PH_EQP_OXYGEN_GENERATOR_BROKEN_V01.webp'),
  waterBase: hailUrl('equipment/PH_EQP_WATER_RECYCLER_BASE_V12.webp'),
  waterBroken: hailUrl('equipment/PH_EQP_WATER_RECYCLER_BROKEN_V01.webp'),
  powerBase: hailUrl('equipment/PH_EQP_POWER_MODULE_BASE_V12.webp'),
  powerBroken: hailUrl('equipment/PH_EQP_POWER_MODULE_BROKEN_V01.webp'),
  comms: hailUrl('equipment/PH_EQP_COMMS_TERMINAL_BASE_V03.webp'),
  fabricatorIdle: hailUrl('equipment/PH_EQP_FABRICATOR_IDLE_V02.webp'),
  fabricatorWorking: hailUrl('equipment/PH_EQP_FABRICATOR_WORKING_V02.webp'),
  fabricatorDamaged: hailUrl('equipment/PH_EQP_FABRICATOR_DAMAGED_V02.webp'),
  medical: hailUrl('equipment/PH_EQP_MEDICAL_STATION_BASE_V01.webp'),
  robotStation: hailUrl('equipment/PH_EQP_ROBOT_STATION_BASE_V01.webp'),
  endDayConsole: hailUrl('equipment/PH_EQP_ENDDAY_CONSOLE_BASE_V01.webp'),
  consoleDesk: hailUrl('equipment/PH_EQP_CONSOLE_DESK_BASE_V02.webp'),
  lockerLeftOpen: hailUrl('equipment/PH_EQP_LOCKER_LEFT_OPEN_V01.webp'),
  lockerRightOpen: hailUrl('equipment/PH_EQP_LOCKER_RIGHT_OPEN_V01.webp'),
  lockerDoorLeftTop: hailUrl('equipment/PH_EQP_LOCKER_DOOR_LEFT_TOP_V01.webp'),
  lockerDoorLeftBottom: hailUrl('equipment/PH_EQP_LOCKER_DOOR_LEFT_BOT_V01.webp'),
  lockerDoorRightTop: hailUrl('equipment/PH_EQP_LOCKER_DOOR_RIGHT_TOP_V01.webp'),
  lockerDoorRightBottom: hailUrl('equipment/PH_EQP_LOCKER_DOOR_RIGHT_BOT_V01.webp'),
  crewSeat: hailUrl('equipment/PH_EQP_CREW_SEAT_BASE_V01.webp'),
  captainSeat: hailUrl('equipment/PH_EQP_CREW_SEAT_CAPTAIN_V01.webp'),
} as const;

export const HAIL_ROVER = {
  base: hailUrl('robots/PH_BOT_SURVEY_ROVER_BASE_V01.webp'),
  active: hailUrl('robots/PH_BOT_SURVEY_ROVER_ACTIVE_V01.webp'),
  broken: hailUrl('robots/PH_BOT_SURVEY_ROVER_BROKEN_V01.webp'),
} as const;

export const HAIL_INVENTORY = {
  medicalKit: hailUrl('inventory/PH_ITEM_MEDICAL_KIT_BASE_V01.webp'),
  spareParts: hailUrl('inventory/PH_ITEM_SPARE_PARTS_BASE_V01.webp'),
  filterSeal: hailUrl('inventory/PH_ITEM_FILTER_SEAL_BASE_V01.webp'),
  sampleDrill: hailUrl('inventory/PH_ITEM_SAMPLE_DRILL_BASE_V01.webp'),
  mrePack: hailUrl('inventory/PH_ITEM_MRE_PACK_BASE_V01.webp'),
  waterPack: hailUrl('inventory/PH_ITEM_WATER_PACK_BASE_V01.webp'),
  oxygenCell: hailUrl('inventory/PH_ITEM_OXYGEN_CELL_BASE_V01.webp'),
  lunarSample: hailUrl('inventory/PH_ITEM_LUNAR_SAMPLE_BASE_V01.webp'),
  specialBeacon: hailUrl('inventory/PH_ITEM_SPECIAL_BEACON_BASE_V01.webp'),
  sealantTape: hailUrl('inventory/PH_ITEM_SEALANT_TAPE_BASE_V01.webp'),
  dustShield: hailUrl('inventory/PH_ITEM_DUST_SHIELD_BASE_V01.webp'),
  radioRepeater: hailUrl('inventory/PH_ITEM_RADIO_REPEATER_BASE_V01.webp'),
  solarLantern: hailUrl('inventory/PH_ITEM_SOLAR_LANTERN_BASE_V01.webp'),
  cryoThermalRig: hailUrl('inventory/PH_ITEM_CRYO_THERMAL_RIG_BASE_V01.webp'),
} as const;

export const HAIL_TACTILE_UI = {
  journalFrame: hailUrl('ui/PH_UI_JOURNAL_FRAME_V01.webp'),
  journalTabOff: hailUrl('ui/PH_UI_JOURNAL_TAB_OFF_V01.webp'),
  journalTabOn: hailUrl('ui/PH_UI_JOURNAL_TAB_ON_V01.webp'),
  decisionFrame: hailUrl('ui/PH_UI_DECISION_FRAME_V01.webp'),
  btnSqGreenIdle: hailUrl('ui/PH_UI_BTN_SQ_GREEN_IDLE_V01.webp'),
  btnSqGreenPressed: hailUrl('ui/PH_UI_BTN_SQ_GREEN_PRESSED_V01.webp'),
  btnSqRedIdle: hailUrl('ui/PH_UI_BTN_SQ_RED_IDLE_V01.webp'),
  btnSqRedPressed: hailUrl('ui/PH_UI_BTN_SQ_RED_PRESSED_V01.webp'),
  stencilRejectX: hailUrl('ui/PH_UI_STENCIL_REJECT_X_V01.webp'),
  btnConfirmIdle: hailUrl('ui/PH_UI_BTN_CONFIRM_IDLE_V01.webp'),
  btnConfirmPressed: hailUrl('ui/PH_UI_BTN_CONFIRM_PRESSED_V01.webp'),
  allocationFrame: hailUrl('ui/PH_UI_ALLOCATION_FRAME_V01.webp'),
  leverUp: hailUrl('ui/PH_UI_LEVER_ENDSOL_UP_V01.webp'),
  leverDown: hailUrl('ui/PH_UI_LEVER_ENDSOL_DOWN_V01.webp'),
  checkboxUnchecked: hailUrl('ui/PH_UI_CHECKBOX_UNCHECKED_V01.webp'),
  checkboxChecked: hailUrl('ui/PH_UI_CHECKBOX_CHECKED_V01.webp'),
  keycapArrow: hailUrl('ui/PH_UI_KEYCAP_ARROW_V01.webp'),
  btnClose: hailUrl('ui/PH_UI_BTN_CLOSE_V01.webp'),
} as const;

export const HAIL_SVG = {
  resPower: hailUrl('resources/PH_UI_RES_POWER_V01.svg'),
  resOxygen: hailUrl('resources/PH_UI_RES_OXYGEN_V01.svg'),
  resWater: hailUrl('resources/PH_UI_RES_WATER_V01.svg'),
  resFood: hailUrl('resources/PH_UI_RES_FOOD_V01.svg'),
  resParts: hailUrl('resources/PH_UI_RES_PARTS_V01.svg'),
  sysOxygen: hailUrl('ui/PH_UI_SYS_OXYGEN_V01.svg'),
  sysWater: hailUrl('ui/PH_UI_SYS_WATER_V01.svg'),
  sysPower: hailUrl('ui/PH_UI_SYS_POWER_V01.svg'),
  sysComms: hailUrl('ui/PH_UI_SYS_COMMS_V01.svg'),
  sysMed: hailUrl('ui/PH_UI_SYS_MED_V01.svg'),
  sysRobot: hailUrl('ui/PH_UI_SYS_ROBOT_V01.svg'),
  stateOk: hailUrl('ui/PH_UI_STATE_OK_V01.svg'),
  stateWarn: hailUrl('ui/PH_UI_STATE_WARN_V01.svg'),
  stateCritical: hailUrl('ui/PH_UI_STATE_CRITICAL_V01.svg'),
  actRepair: hailUrl('ui/PH_UI_ACT_REPAIR_V01.svg'),
  actUpgrade: hailUrl('ui/PH_UI_ACT_UPGRADE_V01.svg'),
  actExplore: hailUrl('ui/PH_UI_ACT_EXPLORE_V01.svg'),
  actEndDay: hailUrl('ui/PH_UI_ACT_ENDDAY_V01.svg'),
  navBack: hailUrl('ui/PH_UI_NAV_BACK_V01.svg'),
  navClose: hailUrl('ui/PH_UI_NAV_CLOSE_V01.svg'),
  badgeNasaStem: hailUrl('ui/PH_UI_BADGE_NASA_STEM_V01.svg'),
  frameCorner: hailUrl('ui/PH_UI_FRAME_CORNER_V01.svg'),
} as const;

export type HailCrewState = 'normal' | 'hungry' | 'sick';

export interface HailCrewStateSprites {
  portrait: string;
  seated: string;
}

export interface HailCrewVisual {
  role: string;
  specialty: string;
  state: HailCrewState;
  stateLabel: string;
  portrait: string;
  seated: string;
  states: Record<HailCrewState, HailCrewStateSprites>;
}

const CREW_CHAR_DIR = 'nhân vật cho project hail';

function buildCrewStates(charIndex: 1 | 2 | 3 | 4): Record<HailCrewState, HailCrewStateSprites> {
  return {
    normal: {
      portrait: hailUrl(`characters/PH_CHAR_NV${charIndex}_PORTRAIT_NORMAL_V02.webp`),
      seated: hailUrl(`${CREW_CHAR_DIR}/trạng thái bình thường/nv ${charIndex}.webp`),
    },
    hungry: {
      portrait: hailUrl(`characters/PH_CHAR_NV${charIndex}_PORTRAIT_HUNGRY_V02.webp`),
      seated: hailUrl(`${CREW_CHAR_DIR}/trạng thái đói/nv ${charIndex}.webp`),
    },
    sick: {
      portrait: hailUrl(`characters/PH_CHAR_NV${charIndex}_PORTRAIT_SICK_V02.webp`),
      seated: hailUrl(`${CREW_CHAR_DIR}/trạng thái bệnh/nv ${charIndex}.webp`),
    },
  };
}

export const HAIL_CREW_VISUALS: Record<string, Omit<HailCrewVisual, 'state' | 'stateLabel'>> = {
  cmd: {
    role: 'Chỉ huy Trạm (Commander)',
    specialty: 'Điều phối nhiệm vụ & Quản lý ECLSS',
    ...buildCrewStates(1).normal,
    states: buildCrewStates(1),
  },
  eng: {
    role: 'Kỹ sư Hệ thống (Systems Engineer)',
    specialty: 'Bảo trì pin Mặt Trời, WRS & Rover',
    ...buildCrewStates(2).normal,
    states: buildCrewStates(2),
  },
  doc: {
    role: 'Bác sĩ Hàng không (Flight Surgeon)',
    specialty: 'Y tế phi hành đoàn & Kiểm soát tâm lý',
    ...buildCrewStates(3).normal,
    states: buildCrewStates(3),
  },
  geo: {
    role: 'Nhà Địa chất Mặt Trăng (Lunar Geologist)',
    specialty: 'Khảo sát hố thiên thạch & Phân tích regolith',
    ...buildCrewStates(4).normal,
    states: buildCrewStates(4),
  },
};

export function getHailCrewState(
  member?: Partial<CrewMemberState> | null,
  hungryOverride = false
): HailCrewState {
  if (!member) {
    return hungryOverride ? 'hungry' : 'normal';
  }
  if (
    member.condition === 'injured' ||
    (typeof member.health === 'number' && member.health < 65) ||
    (typeof member.radiationMgy === 'number' && member.radiationMgy >= 50)
  ) {
    return 'sick';
  }
  if (
    hungryOverride ||
    (member.hungerState !== undefined && member.hungerState !== 'ok') ||
    (typeof member.satiety === 'number' && member.satiety < 55)
  ) {
    return 'hungry';
  }
  return 'normal';
}

const CREW_STATE_LABELS: Record<HailCrewState, string> = {
  normal: 'Ổn định',
  hungry: 'Đói',
  sick: 'Bệnh',
};

export function getHailCrewVisual(
  id: string,
  member?: Partial<CrewMemberState> | null,
  hungryOverride = false
): HailCrewVisual {
  const base = HAIL_CREW_VISUALS[id] ?? HAIL_CREW_VISUALS.cmd;
  const state = getHailCrewState(member, hungryOverride);
  const stateSprites = base.states[state];
  return {
    ...base,
    state,
    stateLabel: CREW_STATE_LABELS[state],
    portrait: stateSprites.portrait,
    seated: stateSprites.seated,
  };
}

export function getHailSystemSprite(id: SystemId, integrity: number): {
  sprite: string;
  overlay: string | null;
  state: 'ok' | 'degraded' | 'broken';
} {
  const state: 'ok' | 'degraded' | 'broken' =
    integrity < 0.45 ? 'broken' : integrity < 0.85 ? 'degraded' : 'ok';

  if (id === 'scrubber') {
    return {
      sprite: HAIL_EQUIPMENT.oxygenBase,
      overlay: state === 'broken' ? HAIL_FX.broken : state === 'degraded' ? HAIL_FX.degraded : null,
      state,
    };
  }
  if (id === 'recycler') {
    return {
      sprite: HAIL_EQUIPMENT.waterBase,
      overlay: state === 'broken' ? HAIL_FX.broken : state === 'degraded' ? HAIL_FX.degraded : null,
      state,
    };
  }
  if (id === 'solar') {
    return {
      sprite: HAIL_EQUIPMENT.powerBase,
      overlay: state === 'broken' ? HAIL_FX.broken : state === 'degraded' ? HAIL_FX.degraded : null,
      state,
    };
  }
  if (id === 'fabricator') {
    return {
      sprite: state === 'broken' ? HAIL_EQUIPMENT.fabricatorDamaged : HAIL_EQUIPMENT.fabricatorIdle,
      overlay: state === 'broken' ? HAIL_FX.broken : state === 'degraded' ? HAIL_FX.degraded : null,
      state,
    };
  }
  return {
    sprite: HAIL_EQUIPMENT.comms,
    overlay: state === 'broken' ? HAIL_FX.broken : state === 'degraded' ? HAIL_FX.degraded : null,
    state,
  };
}

export const EVENT_ART_IDS: readonly EventArtId[] = [
  'tech-fault',
  'airlock-leak',
  'solar-particle',
  'robot-signal-loss',
];

export const HAIL_EVENT_ART: Readonly<Record<EventArtId, string>> = {
  'tech-fault': hailUrl('events/PH_EVT_TECHNICAL_FAULT_BASE_V01.webp'),
  'airlock-leak': hailUrl('events/PH_EVT_AIRLOCK_LEAK_BASE_V01.webp'),
  'solar-particle': hailUrl('events/PH_EVT_SOLAR_PARTICLE_BASE_V01.webp'),
  'robot-signal-loss': hailUrl('events/PH_EVT_ROBOT_SIGNAL_LOSS_BASE_V01.webp'),
};

export function getHailEventScene(artOrEventId: EventArtId | string | null | undefined): string {
  if (artOrEventId && artOrEventId in HAIL_EVENT_ART) {
    return HAIL_EVENT_ART[artOrEventId as EventArtId];
  }
  switch (artOrEventId) {
    case 'solar-particles':
    case 'sol15-lunar-nightfall':
      return HAIL_EVENT_ART['solar-particle'];
    case 'airlock-leak':
    case 'sol3-airlock-seal-alert':
      return HAIL_EVENT_ART['airlock-leak'];
    case 'regolith-filter':
    case 'sol1-arrival-check':
      return HAIL_EVENT_ART['tech-fault'];
    default:
      return HAIL_EVENT_ART['robot-signal-loss'];
  }
}
