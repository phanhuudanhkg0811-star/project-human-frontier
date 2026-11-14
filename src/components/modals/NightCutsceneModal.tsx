import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { selectDynamicDebrief, type DynamicDebriefView } from '../../domain/eventSelectors.ts';
import type { ContentBundle, GameState, SolSummary } from '../../types/index.ts';
import { DynamicSTEMBrief } from '../DynamicSTEMBrief.tsx';
import { CampaignReportCard, TrainingReport } from '../CampaignReportCard.tsx';
import { HAIL_ENV, HAIL_SVG } from '../cabin/hailAssets.ts';

function DebriefDialogBody({
  gameState,
  summary,
  debriefView,
  bundle,
  onDismiss,
  onReset,
  onReplay,
}: {
  gameState: GameState;
  summary: SolSummary;
  debriefView: DynamicDebriefView;
  bundle: ContentBundle;
  onDismiss: () => void;
  onReset: () => void;
  onReplay: () => void;
}) {
  const fullText = debriefView.scienceBrief?.content ?? '';
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [length, setLength] = useState(prefersReduced ? fullText.length : 0);
  const [skip, setSkip] = useState(prefersReduced);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
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
      previous?.focus();
    };
  }, [fullText, prefersReduced]);

  const isTerminal = gameState.clock.phase === 'terminal';

  return (
    <dialog
      ref={dialog}
      className="night-cutscene hail-night-cutscene"
      aria-labelledby="night-title"
      onCancel={(e) => { e.preventDefault(); if (!isTerminal) onDismiss(); }}
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
              ? `HOÀN THÀNH SỨ MỆNH ${bundle.campaign.targetSol} SOL!`
              : 'CHIẾN DỊCH DỪNG KHẨN CẤP'
            : `Sol ${String(summary.sol).padStart(2, '0')} `}
          {!isTerminal && <span>đã khép lại ({summary.surfaceTempC}°C).</span>}
        </h2>

        {gameState.campaign.endReason && (
          <p className="text-sm text-amber-300 font-semibold mt-1">{gameState.campaign.endReason}</p>
        )}
        {isTerminal ? <CampaignReportCard state={gameState} bundle={bundle} />
          : summary.sol === bundle.campaign.training.reportSol && <TrainingReport state={gameState} bundle={bundle} />}

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

        <DynamicSTEMBrief view={debriefView} bundle={bundle} content={<>
          <p aria-hidden="true" className="night-typewriter">
            {skip ? fullText : fullText.slice(0, length)}
            <span className="typewriter-cursor" />
          </p>
          <p className="sr-only">{fullText}</p>
        </>} />

        <div className="night-actions">
          {!skip && length < fullText.length && (
            <button type="button" onClick={() => setSkip(true)} className="night-skip">
              Hiện toàn bộ nội dung
            </button>
          )}
          {isTerminal ? (
            <>
            <button type="button" className="mission-button" onClick={onReplay}>Chơi lại cùng seed, difficulty và weather →</button>
            <button type="button" className="mission-button" onClick={onReset}>
              Chọn cấu hình cho ván mới →
            </button>
            <p>Cùng seed tạo cùng kịch bản; lựa chọn khác có thể cho kết quả khác.</p>
            </>
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
  const activeModal = useUiStore((state) => state.activeModal);
  const isDebrief = gameState.clock.phase === 'debrief' || gameState.clock.phase === 'terminal';
  const debriefView = selectDynamicDebrief(gameState, bundle);
  const summary = debriefView.summary;
  if (!isDebrief || !summary || activeModal === 'launch') return null;

  return (
    <DebriefDialogBody
      key={`${summary.sol}-${gameState.clock.phase}`}
      gameState={gameState}
      summary={summary}
      debriefView={debriefView}
      bundle={bundle}
      onDismiss={() => {
        dispatch({ type: 'debrief/dismiss' });
      }}
      onReset={() => {
        useUiStore.getState().openModal('launch');
      }}
      onReplay={() => { resetCampaign({ seed: gameState.campaign.seed, difficulty: gameState.campaign.difficulty,
        donkiProfileId: gameState.campaign.donkiProfileId, spaceWeatherOverride: gameState.campaign.spaceWeatherOverride }); }}
    />
  );
}
