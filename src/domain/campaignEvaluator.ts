import type { CampaignConfig, CampaignEvaluation, CampaignReason, GameState } from '../types/index.ts';

/** Evaluate the post-resolve snapshot. Failure always takes priority on the final Sol. */
export function evaluateCampaign(state: GameState, config: CampaignConfig, resolvedSol: number): CampaignEvaluation {
  const active = Object.values(state.crew).filter((crew) => crew.condition !== 'evacuated').length;
  const fit = Object.values(state.crew).filter((crew) => crew.condition === 'fit').length;
  const expeditions = new Set(state.rover.missionHistory.filter((mission) => mission.outcome === 'completed').map((mission) => mission.expeditionId)).size;
  const requirements = [
    { id: 'end-sol', met: resolvedSol >= config.victory.reachSol, actual: resolvedSol, target: config.victory.reachSol },
    { id: 'active-crew', met: active >= config.victory.minActiveCrew, actual: active, target: config.victory.minActiveCrew },
    { id: 'positive-oxygen', met: !config.victory.requirePositiveOxygen || state.resources.oxygenKg > 0, actual: state.resources.oxygenKg, target: 0 },
    { id: 'positive-water', met: !config.victory.requirePositiveWater || state.resources.waterL > 0, actual: state.resources.waterL, target: 0 },
  ];
  let reasonCode: CampaignReason | null = null;
  if (active < config.defeat.minActiveCrew) reasonCode = 'crew-collapse';
  else if (state.resources.oxygenZeroStreak >= config.defeat.o2ZeroConsecutiveSols) reasonCode = 'oxygen-depleted';
  else if (state.resources.waterZeroStreak >= config.defeat.waterZeroConsecutiveSols) reasonCode = 'water-depleted';
  else if (resolvedSol >= config.victory.reachSol) {
    reasonCode = requirements.every((requirement) => requirement.met) ? 'moon-victory' : 'final-requirements-unmet';
  }
  const status = reasonCode === null ? 'active' : reasonCode === 'moon-victory' ? 'victory' : 'defeat';
  const rank = status !== 'victory' ? null
    : fit >= config.ranking.S.minFitCrew && expeditions >= config.ranking.S.minExpeditions ? 'S'
    : active >= config.ranking.A.minActiveCrew && expeditions >= config.ranking.A.minExpeditions ? 'A' : 'B';
  return { status, reasonCode, requirements, rank, rankingVersion: config.ranking.version };
}

export function campaignReasonText(reason: CampaignReason | null, config: CampaignConfig): string | null {
  switch (reason) {
    case 'moon-victory': return `Hoàn thành ${config.victory.reachSol} Sol sinh tồn tại Căn cứ Mặt Trăng Artemis!`;
    case 'crew-collapse': return `Đội phi hành gia dưới ngưỡng ${config.defeat.minActiveCrew} người hoạt động.`;
    case 'oxygen-depleted': return `Cạn dưỡng khí ${config.defeat.o2ZeroConsecutiveSols} Sol liên tiếp.`;
    case 'water-depleted': return `Cạn nước sạch ${config.defeat.waterZeroConsecutiveSols} Sol liên tiếp.`;
    case 'final-requirements-unmet': return 'Đã tới Sol cuối nhưng chưa đủ điều kiện an toàn về crew, O₂ hoặc nước.';
    case 'legacy-outcome': return 'Kết quả được giữ từ phiên bản cũ; không áp ngược rubric mới.';
    default: return null;
  }
}
