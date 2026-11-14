import type { ActiveEventView } from '../domain/eventSelectors.ts';
import type { EventNode, EventResourceKey } from '../types/index.ts';

export const EVENT_CATEGORY_LABELS: Record<EventNode['category'], string> = {
  ops: 'Vận hành', hazard: 'Hiểm họa', crisis: 'Khủng hoảng', milestone: 'Cột mốc',
};

export const EVENT_RESOURCE_LABELS: Record<EventResourceKey, string> = {
  batteryKWh: 'Pin (kWh)', oxygenKg: 'O₂ (kg)', waterL: 'Nước (L)',
  partsKg: 'Phụ tùng (kg)', mrePacks: 'MRE (gói)', medkits: 'Medkit (liều)',
};

export function eventDeadlineText(view: ActiveEventView, currentSol: number): string {
  if (currentSol > view.deadlineSol) return `Đã quá hạn Sol ${view.deadlineSol}`;
  if (currentSol === view.deadlineSol) return `Hạn hôm nay · trước khi chốt Sol ${view.deadlineSol}`;
  return `Hạn Sol ${view.deadlineSol} · còn ${view.solsToDeadline} Sol`;
}

/** Translate selector labels for display without interpreting effects or recomputing gameplay. */
export function formatEventEffectSummary(text: string): string {
  const labels: Record<string, string> = {
    ...EVENT_RESOURCE_LABELS, core_drill: 'máy khoan lõi', sealant_tape: 'băng keo làm kín',
    solar_lantern: 'đèn năng lượng mặt trời', dust_shield: 'tấm chắn bụi',
    radio_repeater: 'bộ tiếp sóng', cryo_thermal_rig: 'bộ giữ nhiệt',
    fabricator: 'xưởng in 3D', recycler: 'máy tái chế nước', scrubber: 'bộ lọc CO₂',
    airlock: 'cửa điều áp', solar: 'pin mặt trời',
    Science: 'Khoa học', Health: 'Sức khỏe', Morale: 'Tinh thần', Satiety: 'Độ no',
  };
  return text.replace(/\b(?:batteryKWh|oxygenKg|waterL|partsKg|mrePacks|medkits|core_drill|sealant_tape|solar_lantern|dust_shield|radio_repeater|cryo_thermal_rig|fabricator|recycler|scrubber|airlock|solar|Science|Health|Morale|Satiety)\b/g,
    (token) => labels[token]);
}
