import React from 'react';
import { CheckCircle2, Compass, Lock } from 'lucide-react';
import { selectMissionProgress } from '../domain/selectors.ts';
import { useGameStore } from '../store/gameStore.ts';

export const MissionProgressionPanel: React.FC = () => {
  const { gameState, bundle } = useGameStore();
  const evaluation = selectMissionProgress(gameState, bundle);
  const metCount = evaluation.checks.filter((c) => c.met).length;
  const totalCount = evaluation.checks.length;
  const progressPct = Math.round((metCount / totalCount) * 100);

  return (
    <div className="hud-panel-glow rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2">
        <h2 className="text-sm font-bold tracking-wider text-cyan-300 flex items-center gap-2">
          <Compass className="w-4 h-4 text-yellow-400" />
          TIẾN TRÌNH SINH TỒN ARTEMIS (32 SOL MẶT TRĂNG)
        </h2>
        <span className="text-[11px] font-mono bg-slate-950 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded font-bold">
          {metCount}/{totalCount} ({progressPct}%)
        </span>
      </div>

      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
        <div
          className="h-full transition-all duration-500 bg-gradient-to-r from-cyan-500 to-emerald-400"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] font-mono">
        {evaluation.checks.map((check) => (
          <div
            key={check.id}
            className={`p-2 rounded-lg border flex flex-col justify-between gap-1 ${
              check.met
                ? 'bg-emerald-950/25 border-emerald-600/50 text-emerald-200'
                : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] leading-tight font-sans font-semibold text-slate-200">
                {check.label}
              </span>
              {check.met ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/70">
              <span className={check.met ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {check.currentText}
              </span>
              <span className="text-slate-500">Mục tiêu: {check.targetText}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
