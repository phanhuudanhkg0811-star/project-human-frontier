import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import type { GameState, ScienceBrief, SolSummary } from '../../types/index.ts';
import { HAIL_ENV, HAIL_SVG } from '../cabin/hailAssets.ts';

function DebriefDialogBody({
  gameState,
  summary,
  brief,
  onDismiss,
  onReset,
}: {
  gameState: GameState;
  summary: SolSummary;
  brief: ScienceBrief | undefined;
  onDismiss: () => void;
  onReset: () => void;
}) {
  const fullText = brief?.content ?? '';
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [length, setLength] = useState(prefersReduced ? fullText.length : 0);
  const [skip, setSkip] = useState(prefersReduced);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) {
      el.showModal();
    }
    if (prefersReduced) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const count = Math.min(fullText.length, Math.floor((performance.now() - start) / 14));
      setLength(count);
      if (count >= fullText.length) clearInterval(timer);
    }, 30);
    return () => {
      clearInterval(timer);
      if (el?.open) el.close();
    };
  }, [fullText, prefersReduced]);

  const isTerminal = gameState.clock.phase === 'terminal';

  return (
    <dialog
      ref={dialog}
      className="night-cutscene hail-night-cutscene"
      aria-labelledby="night-title"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="hail-night-backdrop" aria-hidden="true">
        <img src={HAIL_ENV.spaceDeep} alt="" className="hail-night-space" draggable={false} />
        <img src={HAIL_ENV.lunarNight} alt="" className="hail-night-lunar" draggable={false} />
      </div>

      <div className="night-content">
        <p className="mission-kicker flex items-center gap-2">
          <img src={HAIL_SVG.badgeNasaStem} alt="" className="w-4 h-4" />
          <span>ARTEMIS MOON 32 · BÁO CÁO END-SOL {String(summary.sol).padStart(2, '0')}</span>
        </p>

        <h2 id="night-title">
          {isTerminal
            ? gameState.campaign.status === 'victory'
              ? 'HOÀN THÀNH SỨ MỆNH 32 SOL!'
              : 'CHIẾN DỊCH DỪNG KHẨN CẤP'
            : `Sol ${String(summary.sol).padStart(2, '0')} `}
          {!isTerminal && <span>đã khép lại ({summary.surfaceTempC}°C).</span>}
        </h2>

        {gameState.campaign.endReason && (
          <p className="text-sm text-amber-300 font-semibold mt-1">{gameState.campaign.endReason}</p>
        )}

        <dl className="night-stats">
          {[
            ['Điện tích trữ', summary.resourceDeltas.batteryKWh, 'kWh'],
            ['Dưỡng khí O₂', summary.resourceDeltas.oxygenKg, 'kg'],
            ['Nước trong kho', summary.resourceDeltas.waterL, 'L'],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>
                {Number(value) > 0 ? '+' : ''}
                {value}
                <small>{unit}</small>
              </dd>
            </div>
          ))}
        </dl>

        <div className="text-xs font-mono text-slate-300 bg-slate-950/60 border border-slate-700/60 rounded p-2.5 my-2">
          <div>
            NASA DONKI ({summary.weather.solDate}):{' '}
            <strong className="text-cyan-300">{summary.weather.level.toUpperCase()}</strong> · Bức xạ +
            {summary.weather.radiationDoseMgy} mGy · Tỉ lệ sửa chữa:{' '}
            {Math.round(summary.weather.repairSuccessProb * 100)}%
          </div>
          {summary.highlights.slice(0, 3).map((h, i) => (
            <div key={i} className="text-amber-200 mt-1">• {h}</div>
          ))}
        </div>

        <section className="night-brief">
          <p className="mission-kicker">NASA STEM Science Brief</p>
          <h3>{brief?.title}</h3>
          <p aria-hidden="true" className="night-typewriter">
            {skip ? fullText : fullText.slice(0, length)}
            <span className="typewriter-cursor" />
          </p>
          <p className="sr-only">{fullText}</p>
          <small>
            {brief?.source} · Provenance: {brief?.provenance}
          </small>
        </section>

        <div className="night-actions">
          {!skip && length < fullText.length && (
            <button type="button" onClick={() => setSkip(true)} className="night-skip">
              Hiện toàn bộ nội dung
            </button>
          )}
          {isTerminal ? (
            <button type="button" className="mission-button" onClick={onReset}>
              Khởi động Chiến dịch 32 Sol Mới →
            </button>
          ) : (
            <button type="button" className="mission-button" onClick={onDismiss}>
              Thức dậy vào Sol {summary.sol + 1} →
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function NightCutsceneModal() {
  const { gameState, bundle, dispatch, resetCampaign } = useGameStore();
  const isDebrief = gameState.clock.phase === 'debrief' || gameState.clock.phase === 'terminal';
  const summary = gameState.debrief.lastSummary;
  if (!isDebrief || !summary) return null;

  const brief = bundle.briefs.find((b) => b.id === summary.briefId) ?? bundle.briefs[0];
  return (
    <DebriefDialogBody
      key={`${summary.sol}-${gameState.clock.phase}`}
      gameState={gameState}
      summary={summary}
      brief={brief}
      onDismiss={() => {
        dispatch({ type: 'debrief/dismiss' });
      }}
      onReset={() => {
        resetCampaign();
      }}
    />
  );
}
