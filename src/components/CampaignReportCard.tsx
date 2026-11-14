import { selectCampaignReport, selectTrainingReport } from '../domain/campaignSelectors.ts';
import { buildSaveEnvelope } from '../persistence/saveAdapter.ts';
import { downloadArtifact } from '../persistence/downloadArtifact.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { ContentBundle, GameState } from '../types/index.ts';

export function ArtifactExportButtons() {
  const { gameState, replayTrace } = useGameStore();
  return <div className="campaign-export-actions">
    <button type="button" className="hail-btn" onClick={() => downloadArtifact(`moon32-save-${gameState.campaign.seed}-sol${gameState.clock.sol}.json`, buildSaveEnvelope(gameState))}>Export Save Snapshot</button>
    <button type="button" className="hail-btn" onClick={() => downloadArtifact(`moon32-replay-${gameState.campaign.seed}.json`, replayTrace)}>Export Replay Trace</button>
    <p>Snapshot lưu trạng thái hiện tại. Replay {replayTrace?.coverage === 'full-campaign' ? 'ghi từ đầu campaign' : 'ghi từ snapshot khởi đầu phiên ghi'} kèm command; dùng CLI replay để kiểm tra.</p>
  </div>;
}

export function TrainingReport({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const report = selectTrainingReport(state, bundle);
  if (!report) return null;
  return <section className="campaign-report" aria-label="Training Report">
    <h3>Training Report · End-Sol {report.sol}</h3>
    <p>Sơ kết học tập; tiếp tục campaign đến Sol {bundle.campaign.targetSol}.</p>
    <ul>{report.checks.map((check) => <li key={check.label}>{check.met === null ? 'Chưa có dữ liệu' : check.met ? 'Đạt' : 'Chưa đạt'} · {check.label}</li>)}</ul>
  </section>;
}

export function CampaignReportCard({ state, bundle }: { state: GameState; bundle: ContentBundle }) {
  const report = selectCampaignReport(state, bundle);
  const outcome = report.outcome;
  const requirementLabels: Record<string, string> = { 'end-sol': 'End-Sol mục tiêu', 'active-crew': 'Crew hoạt động', 'positive-oxygen': 'O₂ > 0 kg', 'positive-water': 'Nước > 0 L' };
  return <section className="campaign-report" aria-label="NASA Cadet Report Card">
    <h3>NASA Cadet Report Card · {state.campaign.status === 'victory' ? 'Victory' : 'Defeat'}</h3>
    <p className="campaign-rank">{outcome?.rank ? `Rank ${outcome.rank}` : 'Không xếp hạng'}</p>
    {outcome?.reasonCode === 'legacy-outcome' && <p>Giữ kết quả của phiên bản cũ; không áp ngược rubric mới cho ván đã kết thúc.</p>}
    <p>Seed {report.seed} · {report.difficulty} · {report.profile}</p>
    <ul>{outcome?.requirements.map((requirement) => <li key={requirement.id}>{requirement.met ? 'Đạt' : 'Chưa đạt'} · {requirementLabels[requirement.id] ?? requirement.id}: {requirement.actual}{requirement.id === 'end-sol' || requirement.id === 'active-crew' ? ` / ${requirement.target}` : ''}</li>)}</ul>
    <p>Expedition: {report.expeditions.filter((mission) => mission.outcome === 'completed').length}/{bundle.campaign.expeditions.length} · Science: {report.sciencePoints} · Blackout: {report.blackouts} Sol.</p>
    <ul>{report.crew.map((crew) => <li key={crew.id}>{crew.name}: {crew.condition} · Health {crew.health} · Morale {crew.morale} · Satiety {crew.satiety}</li>)}</ul>
    <p>Cuối campaign: Pin {report.resources.batteryKWh} kWh · O₂ {report.resources.oxygenKg} kg · Nước {report.resources.waterL} L · Parts {report.resources.partsKg} kg · MRE {report.resources.mrePacks}.</p>
    <details><summary>Hệ thống cuối campaign</summary><ul>{report.systems.map((system) => <li key={system.id}>{system.id}: Lv{system.level} · Integrity {(system.integrity * 100).toFixed(0)}% · {system.status}</li>)}</ul></details>
    <p>WRS: {report.wrs.efficiency === null ? 'Chưa có dữ liệu hiệu suất' : `${(report.wrs.efficiency * 100).toFixed(1)}% = ${report.wrs.recoveredL.toFixed(2)} L thu hồi / ${report.wrs.processedL.toFixed(2)} L greywater xử lý`}. Đo được {report.wrs.measuredSols}/{report.wrs.totalSols} Sol.</p>
    <details><summary>Rubric rank · {report.rubric.version}</summary>
      <p>S: ≥{report.rubric.S.minFitCrew} crew Fit và ≥{report.rubric.S.minExpeditions} expedition. A: ≥{report.rubric.A.minActiveCrew} crew hoạt động và ≥{report.rubric.A.minExpeditions} expedition. B: các victory còn lại. Defeat không có rank.</p>
      <p>WRS, system và tài nguyên được báo cáo để học tập; rubric hiện tại xếp rank theo crew và expedition.</p>
    </details>
    <TrainingReport state={state} bundle={bundle} />
    <details><summary>Timeline quyết định và sự cố</summary>
      <ol>{report.timeline.map((entry) => <li key={entry.sol}>Sol {entry.sol}: {entry.highlights.join(' ')}</li>)}</ol>
      <ul>{report.choices.map((choice, index) => {
        const event = bundle.events.find((entry) => entry.id === choice.eventId);
        const selected = event?.choices.find((entry) => entry.id === choice.choiceId);
        return <li key={`${choice.eventId}-${index}`}>Sol {choice.settledSol}: {event?.title ?? 'Sự kiện từ phiên bản cũ'} · {selected?.label ?? (choice.outcome === 'expired' ? 'Đã quá hạn' : 'Không có dữ liệu lựa chọn')}</li>;
      })}</ul>
    </details>
    <p>Bài học: {report.lesson}</p>
    <ArtifactExportButtons />
  </section>;
}
