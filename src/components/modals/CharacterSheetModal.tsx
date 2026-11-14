import { useState } from 'react';
import { HeartPulse, Coffee, ShieldAlert, Undo2 } from 'lucide-react';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId } from '../../types/index.ts';
import { getHailCrewVisual } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface CharacterSheetModalProps {
  onClose: () => void;
}

const HUNGER_BADGE = {
  ok: 'text-emerald-300 bg-emerald-950/50 border-emerald-500/40',
  hungry: 'text-amber-300 bg-amber-950/60 border-amber-500/40',
  starving: 'text-rose-300 bg-rose-950/70 border-rose-500/60',
} as const;

export function CharacterSheetModal({ onClose }: CharacterSheetModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [note, setNote] = useState<string | null>(null);
  const [medTarget, setMedTarget] = useState<CrewId>('cmd');
  const canAssign = gameState.clock.phase === 'engineering' || gameState.clock.phase === 'comms';

  const handleAssign = async (crewId: CrewId, task: 'rest' | 'emergency-response' | 'medical-care') => {
    const res = await dispatch({
      type: 'crew/assign',
      crewId,
      task,
      targetCrewId: task === 'medical-care' ? medTarget : undefined,
    });
    setNote(res.ok ? res.effects[0]?.message ?? 'Đã phân công.' : res.error.message);
  };

  const handleUnassign = async (crewId: CrewId) => {
    const res = await dispatch({ type: 'crew/unassign', crewId });
    setNote(res.ok ? res.effects[0]?.message ?? 'Đã hủy lệnh.' : res.error.message);
  };

  const handleMedkit = async (withMarcus: boolean) => {
    const res = await dispatch({
      type: 'crew/use-medkit',
      targetCrewId: medTarget,
      administeredByCrewId: withMarcus ? 'doc' : undefined,
    });
    setNote(res.ok ? res.effects[0]?.message ?? 'Đã dùng Medkit.' : res.error.message);
  };

  return (
    <MissionDialog
      title="Hồ sơ & Phân công Phi hành đoàn (1 người – 1 việc – 1 Sol)"
      eyebrow="TRUNG TÂM · HEALTH / MORALE / HUNGER FSM"
      panelType="character"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        {note && (
          <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
            {note}
          </div>
        )}

        <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-wrap items-center gap-2 text-xs">
          <HeartPulse className="w-4 h-4 text-rose-300" />
          <strong>Medkit tức thời: {gameState.resources.medkits} liều</strong>
          <select value={medTarget} onChange={(event) => setMedTarget(event.target.value as CrewId)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1">
            {(['cmd', 'eng', 'doc', 'geo'] as const).map((id) => <option key={id} value={id}>{gameState.crew[id].name}</option>)}
          </select>
          <button type="button" onClick={() => handleMedkit(false)} className="hail-btn">Tự dùng (+{gameState.resources.medkitLevel === 2 ? 50 : 30})</button>
          <button type="button" onClick={() => handleMedkit(true)} className="hail-btn hail-btn--accent">Marcus tiêm (+20, chiếm task)</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(['cmd', 'eng', 'doc', 'geo'] as const).map((crewId) => {
            const member = gameState.crew[crewId];
            const profile = bundle.crewCatalog.find((p) => p.id === crewId);
            const visual = getHailCrewVisual(crewId);
            const isTired = member.morale < bundle.balance.crew.tiredBelowMorale;

            return (
              <div key={crewId} className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <img src={visual.portrait} alt={member.name} className="w-14 h-14 rounded-lg object-cover border border-slate-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="text-sm text-white truncate">{member.name}</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                        {member.roleTag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{profile?.perkDescription}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded border ${HUNGER_BADGE[member.hungerState]}`}>
                        Đói: {member.hungerState.toUpperCase()} ({member.satiety}%)
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border ${member.condition === 'fit' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40' : 'text-rose-300 border-rose-500/50 bg-rose-950/50'}`}>
                        {member.condition.toUpperCase()}
                      </span>
                      {isTired && (
                        <span className="px-1.5 py-0.5 rounded border text-amber-300 border-amber-500/40 bg-amber-950/50">
                          TIRED
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3 KISS bars + radiation */}
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-950/80 p-2 rounded">
                  <div>
                    <div className="text-slate-400">Health</div>
                    <strong className="text-emerald-300">{member.health}/100</strong>
                  </div>
                  <div>
                    <div className="text-slate-400">Morale</div>
                    <strong className="text-sky-300">{member.morale}/100</strong>
                  </div>
                  <div>
                    <div className="text-slate-400">Bức xạ</div>
                    <strong className="text-amber-300">{member.radiationMgy.toFixed(1)} mGy</strong>
                  </div>
                </div>

                {/* Task row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
                  {member.assignedTask ? (
                    <>
                      <span className="text-cyan-300 font-mono">Nhiệm vụ: {member.assignedTask.type}</span>
                      <button type="button" disabled={!canAssign} onClick={() => handleUnassign(crewId)} className="hail-btn flex items-center gap-1">
                        <Undo2 className="w-3 h-3" /> Hủy
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 w-full">
                      <button type="button" disabled={!canAssign || member.condition === 'evacuated'} onClick={() => handleAssign(crewId, 'rest')} className="hail-btn flex items-center gap-1">
                        <Coffee className="w-3 h-3" /> Nghỉ (+30 Morale)
                      </button>
                      {crewId === 'cmd' && (
                        <button type="button" disabled={!canAssign || member.condition !== 'fit' || isTired} onClick={() => handleAssign(crewId, 'emergency-response')} className="hail-btn hail-btn--accent flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> Trực CAPCOM
                        </button>
                      )}
                      {crewId === 'doc' && (
                        <div className="flex items-center gap-1">
                          <select
                            value={medTarget}
                            onChange={(e) => setMedTarget(e.target.value as CrewId)}
                            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px]"
                          >
                            {(['cmd', 'eng', 'doc', 'geo'] as const).map((id) => (
                              <option key={id} value={id}>{gameState.crew[id].name.split(' ')[0]}</option>
                            ))}
                          </select>
                          <button type="button" disabled={!canAssign || member.condition === 'evacuated'} onClick={() => handleAssign(crewId, 'medical-care')} className="hail-btn hail-btn--accent flex items-center gap-1">
                            <HeartPulse className="w-3 h-3" /> Chăm sóc
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MissionDialog>
  );
}
