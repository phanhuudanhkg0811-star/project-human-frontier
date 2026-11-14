import { useState } from 'react';
import { ArrowDownUp, BatteryCharging, Droplets, HeartPulse, Power, Utensils } from 'lucide-react';
import { selectFiveSolResourceTrend, selectResourceForecast } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId, PowerConsumerId } from '../../types/index.ts';
import { HAIL_EQUIPMENT, HAIL_SVG } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface EndOfDayModalProps {
  onClose: () => void;
}

const LOAD_LABELS: Record<PowerConsumerId, string> = {
  eclss: 'Hệ thống Sống (O₂/Nhiệt 12 kWh)',
  wrs: 'Máy lọc nước WRS (4/3 kWh)',
  fabricator: 'Xưởng in 3D Fabricator',
  rover: 'Trạm sạc Rover',
};

export function EndOfDayModal({ onClose }: EndOfDayModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inRationing = gameState.clock.phase === 'rationing';

  const preview = selectResourceForecast(gameState, bundle);
  const fiveSolTrend = selectFiveSolResourceTrend(gameState, bundle, 5);

  const movePriority = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= gameState.dailyPlan.powerPriority.length) return;
    const copy = [...gameState.dailyPlan.powerPriority];
    const tmp = copy[idx];
    copy[idx] = copy[nextIdx];
    copy[nextIdx] = tmp;
    dispatch({ type: 'rationing/set-power-priority', order: copy });
  };

  const handleEndSol = async () => {
    const res = await dispatch({ type: 'sol/end' });
    if (res.ok) {
      onClose();
    } else {
      setErrorMsg(res.error.message);
    }
  };

  return (
    <MissionDialog
      title={`Phân phối Khẩu phần & Chốt Sol ${gameState.clock.sol}`}
      eyebrow="PHA 4 · RATIONING & RESOURCE PREDICTOR"
      art={HAIL_EQUIPMENT.endDayConsole}
      panelType="end"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        {!inRationing && (
          <div className="text-xs px-3 py-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200">
            Hãy chuyển qua Pha 1 → 2 → 3 → Pha 4 (Phân phối) để chỉnh khẩu phần và gạt cần End-Sol.
          </div>
        )}
        {errorMsg && (
          <div className="text-xs px-3 py-2 rounded bg-rose-950/70 border border-rose-500/50 text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* MRE & Medkit Crew Strip */}
        <section className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70">
          <div className="flex items-center justify-between text-xs mb-2">
            <strong className="text-amber-300 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5" />
              Phát MRE ({gameState.resources.mrePacks} gói) & Medkit ({gameState.resources.medkits} liều)
            </strong>
            <span className="text-slate-400">Tự động -25% Satiety/Sol · 1 MRE hồi +75%</span>
          </div>

          <div className="hail-crew-ration-strip">
            {(['cmd', 'eng', 'doc', 'geo'] as const).map((crewId: CrewId) => {
              const c = gameState.crew[crewId];
              const giveMre = gameState.dailyPlan.mreTargets.includes(crewId);
              const giveMed = gameState.dailyPlan.medkitTargets.includes(crewId);
              return (
                <div key={crewId} className="hail-ration-crew-pill flex flex-col gap-1.5 p-2">
                  <div className="flex items-center justify-between text-xs">
                    <strong className="text-white">{c.name.split(' ')[0]}</strong>
                    <span className="font-mono text-[10px] text-amber-300">No: {c.satiety}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      disabled={!inRationing || c.condition === 'evacuated'}
                      onClick={() => dispatch({ type: 'rationing/toggle-mre', crewId })}
                      className={`hail-btn flex-1 ${giveMre ? 'hail-btn--accent' : ''}`}
                    >
                      {giveMre ? '✓ Phát MRE' : '+ MRE'}
                    </button>
                    <button
                      type="button"
                      disabled={!inRationing || c.condition === 'evacuated'}
                      onClick={() => dispatch({ type: 'rationing/toggle-medkit', crewId })}
                      className={`hail-btn flex-1 flex items-center justify-center gap-1 ${giveMed ? 'hail-btn--warn' : ''}`}
                    >
                      <HeartPulse className="w-3 h-3" /> {giveMed ? '✓ Med' : 'Med'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* WRS & Power Priority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <section className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <strong className="text-cyan-300 flex items-center gap-1.5">
                <ArrowDownUp className="w-3.5 h-3.5" />
                Thứ tự Cắt tải Điện (Load Shedding)
              </strong>
              <button
                type="button"
                disabled={!inRationing}
                onClick={() => dispatch({ type: 'rationing/set-wrs', enabled: !gameState.dailyPlan.wrsEnabled })}
                className={`hail-btn text-[11px] flex items-center gap-1 ${gameState.dailyPlan.wrsEnabled ? 'hail-btn--accent' : ''}`}
              >
                <Droplets className="w-3 h-3" />
                {gameState.dailyPlan.wrsEnabled ? 'WRS: ON' : 'WRS: OFF'}
              </button>
            </div>
            {gameState.dailyPlan.powerPriority.map((id, idx) => (
              <div key={id} className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded bg-slate-950/80 border border-slate-800">
                <span>
                  {idx + 1}. {LOAD_LABELS[id]}
                </span>
                <div className="flex gap-1">
                  <button type="button" disabled={!inRationing || idx === 0} onClick={() => movePriority(idx, -1)} className="hail-btn px-1.5 py-0.5 text-[10px]">↑</button>
                  <button type="button" disabled={!inRationing || idx === 3} onClick={() => movePriority(idx, 1)} className="hail-btn px-1.5 py-0.5 text-[10px]">↓</button>
                </div>
              </div>
            ))}
          </section>

          {/* Resource Predictor (Single Source of Truth from resolveSol preview) */}
          <section className="p-3 rounded-lg bg-slate-900/75 border border-cyan-500/30 flex flex-col gap-2">
            <strong className="text-xs text-cyan-300 flex items-center gap-1.5">
              <BatteryCharging className="w-3.5 h-3.5" />
              Dự báo Cuối Sol (Pure TS Resolver Preview)
            </strong>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-slate-950/80 p-2 rounded">
              <div>
                <div className="text-slate-400">Pin ròng</div>
                <strong className={preview.resourceDeltas.batteryKWh < 0 ? 'text-amber-300' : 'text-emerald-300'}>
                  {preview.resourceDeltas.batteryKWh >= 0 ? '+' : ''}{preview.resourceDeltas.batteryKWh} kWh
                </strong>
              </div>
              <div>
                <div className="text-slate-400">O₂ ròng</div>
                <strong className="text-sky-300">{preview.resourceDeltas.oxygenKg} kg</strong>
              </div>
              <div>
                <div className="text-slate-400">Nước ròng</div>
                <strong className="text-cyan-300">{preview.resourceDeltas.waterL} L</strong>
              </div>
            </div>
            <div className="text-[11px] font-mono text-slate-300">
              Xu hướng 5 Sol tới:
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {fiveSolTrend.map((pt) => (
                  <span key={pt.sol} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                    S{pt.sol}: ⚡{pt.batteryKWh.toFixed(0)} · 💧{pt.waterL.toFixed(0)}
                  </span>
                ))}
              </div>
            </div>
            {preview.blackout && (
              <p className="text-xs text-rose-300 font-semibold">
                CẢNH BÁO: Dự báo thiếu điện thiết yếu (Blackout) vào đêm nay!
              </p>
            )}
          </section>
        </div>

        <button
          type="button"
          disabled={!inRationing}
          onClick={handleEndSol}
          className="hail-btn hail-btn--accent py-2.5 flex items-center justify-center gap-2 font-bold"
        >
          <Power className="w-4 h-4" />
          <img src={HAIL_SVG.actEndDay} alt="" className="w-4 h-4" />
          Gạt cần Chốt Sol {gameState.clock.sol} (End-Sol)
        </button>
      </div>
    </MissionDialog>
  );
}
