import { useState } from 'react';
import { selectAvailableCrew, selectCanRepair, selectWeatherOutlook } from '../domain/selectors.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { CrewId, SystemId } from '../types/index.ts';
import { HAIL_SVG, getHailSystemSprite } from './cabin/hailAssets.ts';

const SYSTEM_META: ReadonlyArray<{ id: SystemId; name: string; role: string }> = [
  { id: 'solar', name: 'Pin Mặt Trời (Solar)', role: '24 / 30 / 36 kWh ngày (0 kWh Đêm Trăng)' },
  { id: 'recycler', name: 'Máy lọc nước (WRS)', role: 'Thu hồi 90% → 95% nước xám (Max 20 L/mẻ)' },
  { id: 'scrubber', name: 'Lọc CO₂ & Che chắn', role: 'Giảm tác hại bức xạ SEP / bão hạt DONKI' },
  { id: 'airlock', name: 'Khoang điều áp Airlock', role: 'Giữ kín áp suất (hỏng rò -1 kg O₂/Sol)' },
  { id: 'fabricator', name: 'Xưởng in 3D Fabricator', role: 'Mở khóa công thức Lv1–Lv3 (0 slot crew)' },
];

export function SystemControls() {
  const { gameState, bundle, dispatch } = useGameStore();
  const [selectedWorker, setSelectedWorker] = useState<CrewId>('eng');
  const [feedback, setFeedback] = useState<string | null>(null);
  const availableCrew = selectAvailableCrew(gameState);
  const weather = selectWeatherOutlook(gameState, bundle, selectedWorker);
  const canEdit = gameState.clock.phase === 'engineering';

  const handleAssignTask = async (task: 'repair-system' | 'upgrade-system', systemId: SystemId) => {
    const res = await dispatch({
      type: 'crew/assign',
      crewId: selectedWorker,
      task,
      targetSystemId: systemId,
    });
    setFeedback(res.ok ? res.effects[0]?.message ?? 'Đã nhận lệnh.' : res.error.message);
  };

  return (
    <section className="hail-sys-panel" aria-label="Điều khiển 5 Hệ thống Trạm">
      <div className="hail-sys-header">
        <div>
          <h3>Bảng Telemetry 5 Hệ thống & WRS</h3>
          <p className="text-xs text-slate-300">
            Xác suất sửa thành công hôm nay (theo bão DONKI{' '}
            <strong>{weather.level.toUpperCase()}</strong>):{' '}
            <strong className="text-cyan-300">{Math.round(weather.repairSuccessProb * 100)}%</strong>
          </p>
        </div>
        <span className={`hail-phase-tag ${canEdit ? 'is-ready' : ''}`}>
          {canEdit ? 'Đang mở Kỹ thuật' : `Pha hiện tại: ${gameState.clock.phase}`}
        </span>
      </div>

      {/* WRS Toggle + Worker Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-900/70 border border-slate-700/70">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-cyan-200">Tái chế nước WRS</div>
            <div className="text-[11px] text-slate-400">
              Nước xám chờ xử lý: {gameState.resources.wasteWaterL.toFixed(1)} L
            </div>
          </div>
          <button
            type="button"
            disabled={!canEdit && gameState.clock.phase !== 'rationing'}
            onClick={() => dispatch({ type: 'rationing/set-wrs', enabled: !gameState.dailyPlan.wrsEnabled })}
            className={`hail-btn ${gameState.dailyPlan.wrsEnabled ? 'hail-btn--accent' : ''}`}
          >
            {gameState.dailyPlan.wrsEnabled ? 'WRS: BẬT' : 'WRS: TẮT'}
          </button>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-200">
          <span>Người thực thi:</span>
          <select
            value={selectedWorker}
            onChange={(e) => setSelectedWorker(e.target.value as CrewId)}
            className="bg-slate-950 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100"
          >
            {Object.values(gameState.crew).map((c) => (
              <option key={c.id} value={c.id} disabled={c.condition === 'evacuated'}>
                {c.name} ({c.roleTag}) {c.assignedTask ? '· Đã bận' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {feedback && (
        <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {SYSTEM_META.map((meta) => {
          const sys = gameState.systems[meta.id];
          const sprite = getHailSystemSprite(meta.id, sys.integrity);
          const repairPerm = selectCanRepair(gameState, meta.id, bundle);
          const targetLvl = sys.level < 3 ? (String(sys.level + 1) as '2' | '3') : null;
          const baseUpCost = targetLvl ? bundle.balance.systems.upgradePartsByTargetLevel[targetLvl] : 0;
          const discount = selectedWorker === 'eng' && meta.id !== 'fabricator' ? 1 : 0;
          const upCost = targetLvl ? Math.max(1, baseUpCost - discount) : 0;
          const workerBusy = !availableCrew.some((c) => c.id === selectedWorker);

          return (
            <div key={meta.id} className={`hail-sys-card ${sys.integrity < 0.85 ? 'is-damaged' : ''}`}>
              <img src={sprite.sprite} alt="" className="hail-sys-thumb" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-white truncate">{meta.name}</strong>
                  <span className="hail-level-pill">Lv{sys.level}/3</span>
                  <span className="text-[11px] font-mono text-slate-300">
                    {Math.round(sys.integrity * 100)}%
                  </span>
                </div>
                <p className="text-xs text-slate-400">{meta.role}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!canEdit || !repairPerm.allowed || workerBusy}
                  title={repairPerm.allowed ? 'Sửa hệ thống (-2 Parts)' : repairPerm.message}
                  onClick={() => handleAssignTask('repair-system', meta.id)}
                  className="hail-btn hail-btn--warn"
                >
                  <img src={HAIL_SVG.actRepair} alt="" className="w-3.5 h-3.5" />
                  Sửa (2P)
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !targetLvl || gameState.resources.partsKg < upCost || workerBusy}
                  onClick={() => handleAssignTask('upgrade-system', meta.id)}
                  className="hail-btn hail-btn--accent"
                >
                  <img src={HAIL_SVG.actUpgrade} alt="" className="w-3.5 h-3.5" />
                  {targetLvl ? `Nâng (${upCost}P)` : 'Tối đa'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
