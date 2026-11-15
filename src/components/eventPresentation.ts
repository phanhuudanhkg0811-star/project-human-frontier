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
};

/** Translate selector labels for display without interpreting effects or recomputing gameplay. */
export function formatEventEffectSummary(text: string, locale: Locale = 'vi'): string {
  let formatted = text;
  if (locale === 'en') {
    formatted = formatted
      .replace(/^Yêu cầu thiết bị (.+?) còn tốt\.$/, 'Requires functional $1.')
      .replace(/^Yêu cầu một quyết định trước đó chưa được thực hiện\.$/, 'Requires an earlier decision that was not made.')
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
  return formatted.replace(
    /\b(?:batteryKWh|oxygenKg|waterL|partsKg|mrePacks|medkits|core_drill|sealant_tape|solar_lantern|dust_shield|radio_repeater|cryo_thermal_rig|fabricator|recycler|scrubber|airlock|solar|Science|Health|Morale|Satiety)\b/g,
    (token) => labels[token] ?? token
  );
}
