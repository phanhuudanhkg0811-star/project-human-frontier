import { useEffect, useRef, useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import { selectFiveSolResourceTrend, selectResourceForecast } from '../../domain/selectors.ts';
import { selectDynamicDebrief } from '../../domain/eventSelectors.ts';
import { DynamicSTEMBrief } from '../DynamicSTEMBrief.tsx';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId, PowerConsumerId } from '../../types/index.ts';
import { getHailCrewVisual, HAIL_TACTILE_UI } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

const CREW_IDS: readonly CrewId[] = ['cmd', 'eng', 'doc', 'geo'];

const SHORT_LOAD_LABEL: Record<PowerConsumerId, string> = {
  eclss: 'ECLSS',
  wrs: 'WRS',
  fabricator: 'FAB',
  rover: 'ROVER',
};

export function EndOfDayModal({
  onStarlog,
  onComms,
  onClose,
}: {
  onStarlog?: () => void;
  onComms?: () => void;
  onClose: () => void;
}) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [leverPulled, setLeverPulled] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const sol = gameState.clock.sol;
  const ended = gameState.campaign.status !== 'active' || gameState.clock.phase === 'terminal';
  const pendingEvent = gameState.events.activeEventId
    ? bundle.events.find((e) => e.id === gameState.events.activeEventId) ?? null
    : null;
  const mustResolveEvent = Boolean(pendingEvent?.mandatory && gameState.clock.phase === 'briefing');
  const inRationing = gameState.clock.phase === 'rationing' && !ended;
  const canPullLever = inRationing && !mustResolveEvent && !leverPulled && !isSubmitting;

  useEffect(() => {
    inFlight.current = false;
    setIsSubmitting(false);
    setLeverPulled(false);
    setErrorMsg(null);
  }, [sol]);

  const preview = selectResourceForecast(gameState, bundle);
  const fiveSolTrend = selectFiveSolResourceTrend(gameState, bundle, 5);
  const debriefView = selectDynamicDebrief(gameState, bundle);

  const prepareRations = async () => {
    playSfx('click', 0.45);
    setErrorMsg(null);
    for (let i = 0; i < 3; i += 1) {
      const state = useGameStore.getState().gameState;
      if (state.clock.phase === 'rationing' || state.clock.phase === 'terminal') {
        break;
      }
      const res = await dispatch({ type: 'phase/advance' });
      if (!res.ok) {
        setErrorMsg(res.error.message);
        break;
      }
    }
  };

  const promotePriority = async (idx: number) => {
    if (!inRationing || isSubmitting || idx <= 0) return;
    playSfx('click', 0.4);
    const copy = [...gameState.dailyPlan.powerPriority];
    const tmp = copy[idx - 1];
    copy[idx - 1] = copy[idx];
    copy[idx] = tmp;
    const res = await dispatch({ type: 'rationing/set-power-priority', order: copy });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handleToggleMre = async (crewId: CrewId) => {
    if (!inRationing || isSubmitting) return;
    playSfx('click', 0.45);
    const res = await dispatch({ type: 'rationing/toggle-mre', crewId });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handleToggleWrs = async () => {
    if (!inRationing || isSubmitting) return;
    playSfx('click', 0.45);
    const res = await dispatch({
      type: 'rationing/set-wrs',
      enabled: !gameState.dailyPlan.wrsEnabled,
    });
    if (!res.ok) setErrorMsg(res.error.message);
  };

  const handlePullLever = async () => {
    if (!canPullLever || inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setLeverPulled(true);
    setErrorMsg(null);
    playSfx('endSol', 0.7);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const res = await dispatch({ type: 'sol/end' });
      if (res.ok) {
        onClose();
      } else {
        setLeverPulled(false);
        setErrorMsg(res.error.message);
      }
    } catch {
      setLeverPulled(false);
      setErrorMsg('Chưa thể chốt Sol. Hãy thử lại.');
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <MissionDialog
      title={`Phân phối Khẩu phần & Chốt Sol ${sol}`}
      eyebrow="ALLOCATION"
      panelType="end"
      tactileFrame
      onClose={onClose}
    >
      <section
        className="hail-tactile-frame hail-tactile-frame--allocation"
        aria-label="Phân bổ Tài nguyên và Kết thúc Sol"
      >
        <img
          src={HAIL_TACTILE_UI.allocationFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Left Main Screen: 4-Astronaut MRE Allocation & Predictor */}
        <div className="hail-alloc-main-screen">
          <header className="hail-term-topbar">
            <div className="hail-term-title-group">
              <span className="hail-term-code">
                PHÂN BỔ KHẨU PHẦN · MRE KHO: {gameState.resources.mrePacks} GÓI
              </span>
              <h2 className="hail-term-title">ĐỊNH MỨC SINH TỒN 4 PHI HÀNH GIA</h2>
            </div>

            <div className="hail-alloc-phase-cmds">
              {mustResolveEvent && (
                <button
                  type="button"
                  className="hail-term-inline-cmd is-warn"
                  onClick={() => {
                    playSfx('click', 0.45);
                    onStarlog?.();
                  }}
                >
                  [XỬ LÝ SỰ CỐ TRƯỚC]
                </button>
              )}
              {!mustResolveEvent && !inRationing && !ended && (
                <>
                  <button
                    type="button"
                    className="hail-term-inline-cmd"
                    onClick={() => {
                      playSfx('radioOn', 0.45);
                      onComms?.();
                    }}
                  >
                    [LIÊN LẠC]
                  </button>
                  <button
                    type="button"
                    className="hail-term-inline-cmd is-primary"
                    onClick={prepareRations}
                  >
                    [CHỐT PHA → CHIA KHẨU PHẦN]
                  </button>
                </>
              )}
            </div>
          </header>

          {errorMsg && (
            <p className="hail-term-plain-line is-warn">&gt; LỖI: {errorMsg}</p>
          )}

          {/* 4-Crew Columns with Dynamic 3-State Portraits + Square Checkboxes */}
          <div className="hail-alloc-crew-grid">
            {CREW_IDS.map((crewId) => {
              const member = gameState.crew[crewId];
              const evacuated = member.condition === 'evacuated';
              const giveMre = !evacuated && gameState.dailyPlan.mreTargets.includes(crewId);
              const isRationCut = inRationing && !giveMre;
              const vis = getHailCrewVisual(crewId, member, isRationCut);

              return (
                <div
                  key={crewId}
                  className={`hail-alloc-crew-col ${evacuated ? 'is-evacuated' : ''}`}
                >
                  <div className="hail-alloc-crew-head">
                    <img
                      src={vis.portrait}
                      alt={`${member.name} (${vis.stateLabel})`}
                      className="hail-alloc-avatar"
                      draggable={false}
                    />
                    <div className="hail-alloc-crew-meta">
                      <strong>{member.name.split(' ')[0]}</strong>
                      <span>
                        {evacuated
                          ? 'ĐÃ SƠ TÁN'
                          : `HP ${member.health}% · ${vis.stateLabel}`}
                      </span>
                    </div>
                  </div>

                  <div className="hail-alloc-checks">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={giveMre}
                      aria-label={`Phát MRE cho ${member.name}`}
                      className="hail-alloc-check-btn"
                      disabled={!inRationing || evacuated || isSubmitting}
                      onClick={() => handleToggleMre(crewId)}
                    >
                      <img
                        src={
                          giveMre
                            ? HAIL_TACTILE_UI.checkboxChecked
                            : HAIL_TACTILE_UI.checkboxUnchecked
                        }
                        alt=""
                        className="hail-alloc-checkbox-img"
                        draggable={false}
                      />
                      <span>{giveMre ? 'Phát MRE ✓' : 'Cắt MRE'}</span>
                    </button>

                    <div className="hail-alloc-crew-statline">
                      <span>No: {member.satiety}%</span>
                      <span className={member.hungerState === 'starving' ? 'is-crit' : ''}>
                        {member.hungerState.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom WRS + Power Priority + End-Sol Forecast */}
          <footer className="hail-alloc-footer">
            <div className="hail-alloc-toggles">
              <button
                type="button"
                role="checkbox"
                aria-checked={gameState.dailyPlan.wrsEnabled}
                className="hail-alloc-sys-check"
                disabled={!inRationing || isSubmitting}
                onClick={handleToggleWrs}
              >
                <img
                  src={
                    gameState.dailyPlan.wrsEnabled
                      ? HAIL_TACTILE_UI.checkboxChecked
                      : HAIL_TACTILE_UI.checkboxUnchecked
                  }
                  alt=""
                  draggable={false}
                />
                <span>WRS {gameState.dailyPlan.wrsEnabled ? '90% ON' : 'OFF'}</span>
              </button>

              <div className="hail-alloc-priority-row" aria-label="Thứ tự ưu tiên điện">
                <span className="hail-alloc-priority-lbl">ƯU TIÊN ĐIỆN:</span>
                {gameState.dailyPlan.powerPriority.map((id, idx) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!inRationing || idx === 0 || isSubmitting}
                    onClick={() => promotePriority(idx)}
                    title={idx === 0 ? `${SHORT_LOAD_LABEL[id]} ưu tiên #1` : `Đẩy ${SHORT_LOAD_LABEL[id]} lên mức #${idx}`}
                    className="hail-alloc-priority-pill"
                  >
                    {idx + 1}.{SHORT_LOAD_LABEL[id]}
                    {idx > 0 ? '↑' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="hail-alloc-predictor-row">
              <p className="hail-alloc-summary-line">
                Dự báo Cuối Sol {sol}: PIN {preview.resourceDeltas.batteryKWh >= 0 ? '+' : ''}
                {preview.resourceDeltas.batteryKWh}kWh · O₂ {preview.resourceDeltas.oxygenKg}kg · NƯỚC{' '}
                {preview.resourceDeltas.waterL}L
                {preview.blackout ? ' · [CẢNH BÁO BLACKOUT!]' : ''}
              </p>
              <div className="hail-alloc-trend-chips">
                {fiveSolTrend.slice(0, 4).map((pt) => (
                  <span key={pt.sol}>
                    S{pt.sol}:⚡{pt.batteryKWh.toFixed(0)}/💧{pt.waterL.toFixed(0)}
                  </span>
                ))}
              </div>
            </div>

            <details className="hail-alloc-debrief-drawer">
              <summary>
                {debriefView.summary
                  ? `NASA STEM · Báo cáo đã hoàn thành Sol ${debriefView.summary.sol} ▾`
                  : 'NASA STEM · Nhật ký Sol gần nhất ▾'}
              </summary>
              <DynamicSTEMBrief view={debriefView} bundle={bundle} />
            </details>
          </footer>
        </div>

        {/* Right Top Sol Counter Display */}
        <div className="hail-alloc-sol-box">
          <span className="hail-mini-label">CHU KỲ SOL</span>
          <strong className="hail-alloc-sol-num">
            {ended ? 'HOÀN TẤT' : `${String(sol).padStart(2, '0')} → ${String(sol + 1).padStart(2, '0')}`}
          </strong>
        </div>

        {/* Right End-Sol Physical Lever Bay */}
        <div className="hail-alloc-lever-bay">
          <button
            type="button"
            className={`hail-lever-btn ${leverPulled ? 'is-pulled' : ''}`}
            disabled={!canPullLever}
            aria-label="Gạt cần kết thúc Sol"
            title={
              canPullLever
                ? `Gạt cần Chốt Sol ${sol}`
                : mustResolveEvent
                  ? 'Hãy xử lý sự cố trước khi gạt cần'
                  : 'Chốt pha chuẩn bị để kích hoạt cần gạt'
            }
            onClick={handlePullLever}
          >
            <img
              src={leverPulled ? HAIL_TACTILE_UI.leverDown : HAIL_TACTILE_UI.leverUp}
              alt={leverPulled ? 'Cần gạt đang đóng Sol' : 'Cần gạt Kết thúc Sol'}
              draggable={false}
            />
            <span className="hail-lever-caption">
              {isSubmitting || leverPulled
                ? 'ĐANG QUA ĐÊM...'
                : canPullLever
                  ? `Chốt Sol ${sol}`
                  : 'KHÓA AN TOÀN'}
            </span>
          </button>
        </div>

        {/* Close Frame Button */}
        <button
          type="button"
          className="hail-tactile-corner-close"
          aria-label="Đóng Bảng Phân bổ"
          onClick={() => {
            playSfx('click', 0.4);
            onClose();
          }}
        >
          <img src={HAIL_TACTILE_UI.btnClose} alt="×" draggable={false} />
        </button>
      </section>
    </MissionDialog>
  );
}
