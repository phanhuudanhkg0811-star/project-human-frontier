import type { ActiveEventView } from '../domain/eventSelectors.ts';
import type { Locale } from '../i18n/types.ts';
import { translate } from '../i18n/useI18n.ts';
import type { EventNode, EventResourceKey } from '../types/index.ts';

export const EVENT_CATEGORY_LABELS: Record<EventNode['category'], string> = {
  ops: 'Vận hành', hazard: 'Hiểm họa', crisis: 'Khủng hoảng', milestone: 'Cột mốc',
};

export const EVENT_RESOURCE_LABELS: Record<EventResourceKey, string> = {
  batteryKWh: 'Pin (kWh)', oxygenKg: 'O₂ (kg)', waterL: 'Nước (L)',
  partsKg: 'Phụ tùng (kg)', mrePacks: 'MRE (gói)', medkits: 'Medkit (liều)',
};

export function getEventCategoryLabel(category: EventNode['category'], locale: Locale = 'vi'): string {
  return translate(locale, `events.category.${category}`);
}

export function getEventResourceLabel(resource: EventResourceKey, locale: Locale = 'vi'): string {
  return translate(locale, `events.resource.${resource}`);
}

export function eventDeadlineText(view: ActiveEventView, currentSol: number, locale: Locale = 'vi'): string {
  if (currentSol > view.deadlineSol) {
    return translate(locale, 'events.deadline.expired', { sol: view.deadlineSol });
  }
  if (currentSol === view.deadlineSol) {
    return translate(locale, 'events.deadline.today', { sol: view.deadlineSol });
  }
  return translate(locale, 'events.deadline.remaining', {
    sol: view.deadlineSol,
    remaining: view.solsToDeadline,
  });
}

const VI_TOKENS: Record<string, string> = {
  ...EVENT_RESOURCE_LABELS,
  core_drill: 'máy khoan lõi',
  sealant_tape: 'băng keo làm kín',
  solar_lantern: 'đèn năng lượng mặt trời',
  dust_shield: 'tấm chắn bụi',
  radio_repeater: 'bộ tiếp sóng',
  cryo_thermal_rig: 'bộ giữ nhiệt',
  fabricator: 'xưởng in 3D',
  recycler: 'máy tái chế nước',
  scrubber: 'bộ lọc CO₂',
  airlock: 'cửa điều áp',
  solar: 'pin mặt trời',
  Science: 'Khoa học',
  Health: 'Sức khỏe',
  Morale: 'Tinh thần',
  Satiety: 'Độ no',
  'emergency-response': 'xử lý khẩn cấp',
  'repair-system': 'sửa hệ thống',
  'upgrade-system': 'nâng cấp hệ thống',
  'medical-care': 'chăm sóc y tế',
  'rover-operate': 'vận hành Rover',
  'fail-expedition': 'hủy chuyến thám hiểm',
  'restore-signal': 'khôi phục tín hiệu',
  'continue-expedition': 'tiếp tục thám hiểm',
  'delay-expedition': 'trì hoãn thám hiểm',
  rest: 'nghỉ ngơi',
};

const EN_TOKENS: Record<string, string> = {
  batteryKWh: 'Battery (kWh)',
  oxygenKg: 'O₂ (kg)',
  waterL: 'Water (L)',
  partsKg: 'Parts (kg)',
  mrePacks: 'MRE (packs)',
  medkits: 'Medkit (doses)',
  core_drill: 'Core Drill',
  sealant_tape: 'Sealant Tape',
  solar_lantern: 'Solar Lantern',
  dust_shield: 'Dust Shield',
  radio_repeater: 'Radio Repeater',
  cryo_thermal_rig: 'Cryo Thermal Rig',
  fabricator: '3D Fabricator',
  recycler: 'Water Recycler',
  scrubber: 'CO₂ Scrubber',
  airlock: 'Airlock',
  solar: 'Solar Array',
  Science: 'Science',
  Health: 'Health',
  Morale: 'Morale',
  Satiety: 'Satiety',
  'emergency-response': 'emergency response',
  'repair-system': 'repair system',
  'upgrade-system': 'upgrade system',
  'medical-care': 'medical care',
  'rover-operate': 'rover operations',
  'fail-expedition': 'abort expedition',
  'restore-signal': 'restore signal',
  'continue-expedition': 'continue expedition',
  'delay-expedition': 'delay expedition',
  rest: 'rest',
};

const TOKEN_PATTERN = new RegExp(
  `\\b(?:${Object.keys(EN_TOKENS)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g'
);

/** Translate selector labels for display without interpreting effects or recomputing gameplay. */
export function formatEventEffectSummary(text: string, locale: Locale = 'vi'): string {
  let formatted = text;
  if (locale === 'en') {
    formatted = formatted
      .replace(/^Yêu cầu thiết bị (.+?) còn tốt\.$/, 'Requires functional $1.')
      .replace(/^Yêu cầu điều kiện (.+)\.$/, 'Requires condition: $1.')
      .replace(/ đã rời trạm\.$/, ' has evacuated.')
      .replace(/ cần ở trạng thái Fit\.$/, ' must be Fit.')
      .replace(/ đang bận nhiệm vụ khác\.$/, ' is busy with another task.')
      .replace(/\bToàn đội\b/g, 'All crew')
      .replace(/^Hao mòn /g, 'Wear ')
      .replace(/^Hệ thống /g, 'System ')
      .replace(/^WRS hôm nay: BẬT$/g, 'WRS today: ON')
      .replace(/^WRS hôm nay: TẮT$/g, 'WRS today: OFF')
      .replace(/^Phân công /g, 'Assign ')
      .replace(/^Hệ quả sau /g, 'Follow-up in ');
  }
  const labels = locale === 'en' ? EN_TOKENS : VI_TOKENS;
  return formatted.replace(TOKEN_PATTERN, (token) => labels[token] ?? token);
}

const KNOWN_LOADS = new Set(['eclss', 'wrs', 'fabricator', 'rover']);

/** Translate comma-separated or array power-load IDs for UI badges and hints. */
export function formatPowerLoadList(
  loads: string | readonly string[],
  locale: Locale = 'vi'
): string {
  const items = typeof loads === 'string' ? loads.split(',') : loads;
  return items
    .map((raw) => {
      const id = raw.trim().toLowerCase();
      return KNOWN_LOADS.has(id) ? translate(locale, `enum.load.${id}`) : raw.trim();
    })
    .filter(Boolean)
    .join(', ');
}
