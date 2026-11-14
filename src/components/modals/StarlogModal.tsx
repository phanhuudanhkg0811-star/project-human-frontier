import { useRef, useState } from 'react';
import { CheckCircle2, ScrollText } from 'lucide-react';
import { selectActiveEventView, selectEventChoicePreviews } from '../../domain/eventSelectors.ts';
import { selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { EVENT_CATEGORY_LABELS, EVENT_RESOURCE_LABELS, eventDeadlineText, formatEventEffectSummary } from '../eventPresentation.ts';
import type { EventResourceKey } from '../../types/index.ts';
import { getHailEventScene } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface StarlogModalProps {
  onClose: () => void;
}

export function StarlogModal({ onClose }: StarlogModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);
  const activeView = selectActiveEventView(gameState, bundle);
  const activeEvent = activeView?.event ?? null;
  const previews = activeEvent ? selectEventChoicePreviews(gameState, activeEvent.id, bundle) : [];
  const planningPhase = ['briefing', 'engineering', 'comms', 'rationing'].includes(gameState.clock.phase);
  const canRespondNow = planningPhase && gameState.campaign.status === 'active'
    && activeView !== null && gameState.clock.sol <= activeView.deadlineSol;
  const weather = selectWeatherOutlook(gameState, bundle);

  const handleChoice = async (choiceId: string) => {
    if (!activeEvent || inFlight.current || !canRespondNow) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setChoiceError(null);
    setFeedback(null);
    try {
      const res = await dispatch({ type: 'event/resolve', eventId: activeEvent.id, choiceId });
      if (res.ok) setFeedback(res.effects[0]?.message ?? 'Đã xử lý.');
      else setChoiceError(res.error.message);
    } catch {
      setChoiceError('Chưa thể xử lý lựa chọn. Hãy thử lại.');
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <MissionDialog
      title={`Starlog & Sự kiện Sol ${gameState.clock.sol}`}
      eyebrow="PHA 1 · MORNING BRIEFING & DONKI WEATHER"
      art={getHailEventScene(activeEvent?.art)}
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
          <div role="status" className="text-xs px-3 py-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback}
          </div>
        )}
        {choiceError && <p role="alert" className="hail-event-error">{choiceError}</p>}

        {/* Active Mandatory Event */}
        {activeEvent && activeView ? (
          <section className={`hail-event-banner hail-event-detail--${activeEvent.category}`} aria-busy={isSubmitting}>
            <img src={getHailEventScene(activeEvent.art)} alt="" className="hail-event-banner-img" />
            <div className="p-3 flex flex-col gap-2">
              <span className="hail-event-banner-badge">{EVENT_CATEGORY_LABELS[activeEvent.category]}</span>
              <h3 className="text-base font-bold text-white">{activeEvent.title}</h3>
              <div className="hail-event-metadata">
                <span>{activeView.mandatory ? 'Bắt buộc · xử lý trước khi rời giao ban' : 'Tùy chọn · có thể xử lý trong các pha của ngày'}</span>
                <span>Ưu tiên {activeView.priority}</span>
                <strong className="hail-event-deadline">{eventDeadlineText(activeView, gameState.clock.sol)}</strong>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{activeEvent.prompt}</p>
              {!canRespondNow && <p className="hail-event-error">Sự kiện không còn nhận lựa chọn ở thời điểm này.</p>}
              <div className="flex flex-col gap-2 mt-2">
                {previews.map((preview) => {
                  const ch = preview.choice;
                  const reasonsId = `event-choice-${ch.id}-reasons`;
                  return (
                    <article key={ch.id} className={`hail-event-choice ${!preview.allowed ? 'is-blocked' : ''}`}>
                      <h4>{ch.label}</h4>
                      <div className="hail-event-costs" aria-label="Thay đổi tài nguyên dự kiến">
                        {Object.entries(preview.resourceDeltas).map(([resource, delta]) => {
                          return <span key={resource}>{EVENT_RESOURCE_LABELS[resource as EventResourceKey]}: <strong>{Number(delta) > 0 ? '+' : ''}{delta}</strong></span>;
                        })}
                        {preview.scienceDelta !== 0 && <span>Khoa học: <strong>{preview.scienceDelta > 0 ? '+' : ''}{preview.scienceDelta}</strong></span>}
                        {Object.keys(preview.resourceDeltas).length === 0 && preview.scienceDelta === 0 && <span>Không thay đổi trực tiếp vật tư/khoa học.</span>}
                      </div>
                      {preview.effectsSummary.length > 0 && <ul className="hail-event-effects" aria-label="Hệ quả dự kiến">
                        {preview.effectsSummary.map((effect, index) => <li key={index}>{formatEventEffectSummary(effect)}</li>)}
                      </ul>}
                      {preview.blockedReasons.length > 0 && <ul id={reasonsId} className="hail-event-blocked" aria-label="Lý do chưa thể chọn">
                        {preview.blockedReasons.map((reason, index) => <li key={index}>{formatEventEffectSummary(reason)}</li>)}
                      </ul>}
                      <button type="button" className="hail-btn hail-choice-card"
                        disabled={!preview.allowed || !canRespondNow || isSubmitting}
                        aria-describedby={preview.blockedReasons.length > 0 ? reasonsId : undefined}
                        onClick={() => handleChoice(ch.id)}>
                        {isSubmitting ? 'Đang xử lý…' : `Chọn: ${ch.label}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            Không có sự kiện nào đang chờ xử lý.
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
