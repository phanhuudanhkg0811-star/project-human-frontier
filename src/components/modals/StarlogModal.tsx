import { useState } from 'react';
import { CheckCircle2, ScrollText } from 'lucide-react';
import { selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { getHailEventScene } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface StarlogModalProps {
  onClose: () => void;
}

export function StarlogModal({ onClose }: StarlogModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeEvent = gameState.events.activeEventId
    ? bundle.events.find((e) => e.id === gameState.events.activeEventId) ?? null
    : null;
  const weather = selectWeatherOutlook(gameState, bundle);

  const handleChoice = async (choiceId: string) => {
    if (!activeEvent) return;
    const res = await dispatch({
      type: 'event/resolve',
      eventId: activeEvent.id,
      choiceId,
    });
    setFeedback(res.ok ? res.effects[0]?.message ?? 'Đã xử lý.' : res.error.message);
  };

  return (
    <MissionDialog
      title={`Starlog & Sự kiện Sol ${gameState.clock.sol}`}
      eyebrow="PHA 1 · MORNING BRIEFING & DONKI WEATHER"
      art={getHailEventScene(activeEvent?.id)}
      panelType="starlog"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        {/* DONKI Space Weather Card */}
        <section className="p-3 rounded-lg bg-slate-900/75 border border-cyan-500/35 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <strong className="text-cyan-300">
              NASA DONKI Space Weather ({weather.date}) — Mức: {weather.level.toUpperCase()}
            </strong>
            <span className="font-mono text-[11px] text-slate-400">
              Mẫu: {gameState.campaign.donkiProfileId}
            </span>
          </div>
          {weather.headline && <p className="text-amber-200 italic mb-1.5">"{weather.headline}"</p>}
          <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-slate-950/75 p-2 rounded">
            <div>Tỉ lệ sửa: <strong className="text-emerald-300">{Math.round(weather.repairSuccessProb * 100)}%</strong></div>
            <div>Rủi ro Rover: <strong className="text-amber-300">{Math.round(weather.roverIncidentProb * 100)}%</strong></div>
            <div>Bức xạ nền: <strong className="text-sky-300">+{weather.crewWeatherRisk.radiationDoseMgy} mGy</strong></div>
          </div>
        </section>

        {feedback && (
          <div className="text-xs px-3 py-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback}
          </div>
        )}

        {/* Active Mandatory Event */}
        {activeEvent ? (
          <section className="hail-event-banner">
            <img src={getHailEventScene(activeEvent.id)} alt="" className="hail-event-banner-img" />
            <div className="p-3 flex flex-col gap-2">
              <span className="hail-event-banner-badge">{activeEvent.category.toUpperCase()}</span>
              <h3 className="text-base font-bold text-white">{activeEvent.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{activeEvent.prompt}</p>
              <div className="flex flex-col gap-2 mt-2">
                {activeEvent.choices.map((ch) => {
                  const missingEq =
                    ch.requiresEquipment &&
                    (!gameState.equipment[ch.requiresEquipment].owned ||
                      gameState.equipment[ch.requiresEquipment].state === 'damaged');
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={Boolean(missingEq) || gameState.clock.phase !== 'briefing'}
                      onClick={() => handleChoice(ch.id)}
                      className="hail-choice-card text-left p-2.5 rounded border border-cyan-500/40 bg-slate-900/90 hover:bg-slate-800 disabled:opacity-45"
                    >
                      <div className="text-xs font-semibold text-cyan-200">{ch.label}</div>
                      {missingEq && (
                        <div className="text-[10px] text-rose-300 mt-0.5">
                          (Yêu cầu thiết bị {ch.requiresEquipment} còn tốt trên LR Rack)
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            Không còn sự kiện khẩn cấp nào chờ xử lý trong Morning Briefing hôm nay.
          </div>
        )}

        {/* History Logs */}
        <section className="crt-terminal-screen p-3 rounded-lg">
          <div className="text-xs font-bold text-cyan-300 mb-2 flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            Nhật ký Vận hành Trạm Artemis
          </div>
          <div className="max-h-36 overflow-y-auto flex flex-col gap-1 text-[11px] font-mono">
            {gameState.history.logs.slice(-8).reverse().map((log, i) => (
              <div key={i} className="text-slate-300">
                <span className="text-cyan-400">[Sol {log.sol} · {log.phase}]</span> {log.message}
              </div>
            ))}
          </div>
        </section>
      </div>
    </MissionDialog>
  );
}
