import { selectFiveSolResourceTrend, selectResourceForecast } from './selectors.ts';
import type { ContentBundle, GameState } from '../types/index.ts';

export function selectTrainingReport(state: GameState, bundle: ContentBundle) {
  const config = bundle.campaign.training;
  const summary = state.history.summaries.find((entry) => entry.sol === config.reportSol);
  if (!summary) return null;
  const checkpoint = summary.checkpoint;
  const activeCrew = checkpoint ? Object.values(checkpoint.crew).filter((crew) => crew.condition !== 'evacuated').length : null;
  return { sol: config.reportSol, checkpoint,
    checks: [
      { label: `Crew hoạt động ≥ ${config.minActiveCrew}`, met: activeCrew === null ? null : activeCrew >= config.minActiveCrew },
      { label: `Expedition hoàn thành ≥ ${config.minExpeditions}`, met: checkpoint ? checkpoint.completedExpeditions >= config.minExpeditions : null },
    ],
  };
}

export function selectCampaignReport(state: GameState, bundle: ContentBundle) {
  const summaries = state.history.summaries;
  const measured = summaries.filter((summary) => summary.checkpoint !== null);
  const processed = measured.reduce((sum, summary) => sum + summary.checkpoint!.wrsProcessedWasteWaterL, 0);
  const recovered = measured.reduce((sum, summary) => sum + summary.wrsRecoveredWaterL, 0);
  return {
    outcome: state.campaign.outcome,
    lesson: state.campaign.outcome?.reasonCode === 'oxygen-depleted' ? 'Theo dõi dự báo O₂ và ETA cargo oxy. Airlock hỏng làm rò khí; cần kiểm tra và sửa khi có thể.'
      : state.campaign.outcome?.reasonCode === 'water-depleted' ? 'Lập lịch nước dự trữ, cargo nước và WRS. WRS cần cả điện lẫn greywater để thu hồi nước.'
      : state.campaign.outcome?.reasonCode === 'crew-collapse' ? 'Theo dõi Health, Morale và Satiety; chuẩn bị MRE, nghỉ ngơi và Medkit trước khi crew không còn làm việc được.'
      : state.campaign.outcome?.reasonCode === 'final-requirements-unmet' ? 'Xem các điều kiện chưa đạt; dự trữ O₂ và nước phải còn dương sau khi chốt Sol cuối.'
      : 'Dự trữ điện có giới hạn; cargo đến theo lịch. WRS đổi điện lấy nước thu hồi, còn rover cần thiết bị và crew sẵn sàng.',
    seed: state.campaign.seed, difficulty: state.campaign.difficulty, profile: state.campaign.donkiProfileId,
    training: selectTrainingReport(state, bundle),
    crew: Object.values(state.crew), resources: state.resources, systems: Object.values(state.systems),
    expeditions: state.rover.missionHistory, sciencePoints: state.campaign.sciencePoints,
    blackouts: summaries.filter((summary) => summary.blackout).length,
    wrs: { measuredSols: measured.length, totalSols: summaries.length, processedL: processed, recoveredL: recovered,
      efficiency: processed > 0 ? recovered / processed : null },
    // Explicitly recorded highlights, rather than inferring a player's choices from final resources.
    timeline: summaries.filter((summary) => summary.highlights.length > 0).map((summary) => ({ sol: summary.sol, highlights: summary.highlights })),
    choices: state.events.occurrenceHistory,
    rubric: bundle.campaign.ranking,
  };
}

export function selectNightReadiness(state: GameState, bundle: ContentBundle) {
  const night = bundle.campaign.milestones.lunarNight;
  const forecast = selectResourceForecast(state, bundle);
  const trend = selectFiveSolResourceTrend(state, bundle);
  const activeCrew = Object.values(state.crew).filter((crew) => crew.condition !== 'evacuated').length;
  const warnings: string[] = [];
  if (forecast.blackout) warnings.push('Kế hoạch hiện tại không cấp đủ điện tải thiết yếu. Giảm tải tùy chọn hoặc chuẩn bị cargo điện.');
  if (trend.some((point) => point.waterL <= 0)) warnings.push('Dự báo có Sol hết nước: xem lịch WRS, nước dự trữ và cargo nước.');
  if (trend.some((point) => point.oxygenKg <= 0)) warnings.push('Dự báo có Sol hết O₂: kiểm tra airlock và cargo oxy.');
  return { night, warnings, forecast, checks: [
    { label: 'Pin', value: `${state.resources.batteryKWh}/${bundle.balance.storages.batteryKWh.max} kWh` },
    { label: 'Nước / O₂', value: `${state.resources.waterL} L / ${state.resources.oxygenKg} kg` },
    { label: 'MRE', value: `${state.resources.mrePacks} gói · ${activeCrew} crew` },
    { label: 'WRS', value: `${state.dailyPlan.wrsEnabled ? 'Bật' : 'Tắt'} · Lv${state.systems.recycler.level}` },
    { label: 'Cargo', value: state.logistics.activeOrder ? `Đến End-Sol ${state.logistics.activeOrder.arrivalSol}` : 'Chưa có chuyến đang bay' },
  ], assumption: 'Dự báo giữ các setting hiện tại, chỉ tính cargo đã đặt; không giả định đặt cargo mới hay biết lựa chọn event tương lai.' };
}
