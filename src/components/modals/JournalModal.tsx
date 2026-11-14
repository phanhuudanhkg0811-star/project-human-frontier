import { useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import {
  selectAvailableCrew,
  selectCanAdvancePhase,
  selectRoverStatus,
  selectWeatherOutlook,
} from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId, SolPhase, SystemId } from '../../types/index.ts';
import { getHailCrewVisual, HAIL_SVG, HAIL_TACTILE_UI } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

export type JournalTabId = 'log' | 'crew' | 'systems' | 'cargo';

const JOURNAL_TABS: ReadonlyArray<{
  id: JournalTabId;
  code: string;
  title: string;
  icon: string;
  top: string;
}> = [
  { id: 'log', code: 'TAB 01 // LOG', title: 'NHẬT KÝ VẬN HÀNH TRẠM', icon: HAIL_SVG.sysComms, top: '18.95%' },
  { id: 'crew', code: 'TAB 02 // CREW', title: 'HỒ SƠ Y TẾ PHI HÀNH ĐOÀN', icon: HAIL_SVG.sysMed, top: '34.76%' },
  { id: 'systems', code: 'TAB 03 // ECLSS', title: 'GIÁM SÁT HỆ THỐNG KỸ THUẬT', icon: HAIL_SVG.sysPower, top: '50.65%' },
  { id: 'cargo', code: 'TAB 04 // CARGO', title: 'KHO TÀI NGUYÊN & ROVER', icon: HAIL_SVG.sysRobot, top: '66.53%' },
];

const CREW_IDS: readonly CrewId[] = ['cmd', 'eng', 'doc', 'geo'];
const SYSTEM_IDS: readonly SystemId[] = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'];

const SYSTEM_NAMES: Record<SystemId, string> = {
  solar: 'Mảng Pin Mặt Trời (Solar)',
  recycler: 'Hệ thống Tái chế Nước (WRS)',
  scrubber: 'Máy lọc CO₂ & Bức xạ (Scrubber)',
  airlock: 'Khóa khí & Cửa EVA (Airlock)',
  fabricator: 'Xưởng in 3D Fabricator',
};

const PHASE_LABELS: Record<SolPhase, string> = {
  briefing: 'Pha 1 · Giao ban & Sự kiện',
  engineering: 'Pha 2 · Kỹ thuật & Xưởng 3D',
  comms: 'Pha 3 · Liên lạc CAPCOM & Rover',
  rationing: 'Pha 4 · Khẩu phần & Điện',
  resolving: 'Đang tính toán End-Sol',
  debrief: 'Pha 5 · Báo cáo Đêm',
  terminal: 'Kết thúc Chiến dịch',
};

export function JournalModal({
  initialTab = 'log',
  onClose,
  onOpenDecision,
  onOpenPanel,
}: {
  initialTab?: JournalTabId;
  onClose: () => void;
  onOpenDecision: () => void;
  onOpenPanel: (panel: 'comms' | 'expedition' | 'launch') => void;
}) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [tab, setTab] = useState<JournalTabId>(initialTab);
  const [logPage, setLogPage] = useState(0);
  const [crewIdx, setCrewIdx] = useState(0);
  const [sysIdx, setSysIdx] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const weather = selectWeatherOutlook(gameState, bundle);
  const advancePerm = selectCanAdvancePhase(gameState, bundle);
  const availableCrew = selectAvailableCrew(gameState);
  const roverStatus = selectRoverStatus(gameState);

  const logs = [...gameState.history.logs].reverse();
  const logsPerPage = 6;
  const totalLogPages = Math.max(1, Math.ceil(logs.length / logsPerPage));
  const safePage = Math.min(logPage, totalLogPages - 1);
  const pageLogs = logs.slice(safePage * logsPerPage, (safePage + 1) * logsPerPage);

  const activeTabMeta = JOURNAL_TABS.find((t) => t.id === tab) ?? JOURNAL_TABS[0];
  const selectedCrewId = CREW_IDS[crewIdx] ?? 'cmd';
  const selectedCrew = gameState.crew[selectedCrewId];
  const rationCut =
    gameState.clock.phase === 'rationing' &&
    !gameState.dailyPlan.mreTargets.includes(selectedCrewId);
  const selectedCrewVisual = selectedCrew
    ? getHailCrewVisual(selectedCrewId, selectedCrew, rationCut)
    : null;

  const selectedSysId = SYSTEM_IDS[sysIdx] ?? 'solar';
  const selectedSys = gameState.systems[selectedSysId];
  const pendingEvent = gameState.events.activeEventId
    ? bundle.events.find((e) => e.id === gameState.events.activeEventId) ?? null
    : null;

  const repairCost = bundle.balance.systems.repairPartsCost;
  const targetLvl = selectedSys.level < 3 ? (String(selectedSys.level + 1) as '2' | '3') : null;
  const baseUpCost = targetLvl ? bundle.balance.systems.upgradePartsByTargetLevel[targetLvl] : 0;

  const findFitWorker = () =>
    availableCrew.find((c) => c.id === 'eng' && c.condition === 'fit') ??
    availableCrew.find((c) => c.condition === 'fit');

  const handleSystemTask = async (task: 'repair-system' | 'upgrade-system') => {
    const worker = findFitWorker();
    if (!worker) {
      setStatusNote('Không có phi hành gia Fit rảnh (1 người/1 việc/Sol).');
      return;
    }
    const res = await dispatch({
      type: 'crew/assign',
      crewId: worker.id,
      task,
      targetSystemId: selectedSysId,
    });
    if (res.ok) {
      playSfx(task === 'upgrade-system' ? 'upgrade' : 'repair', 0.55);
      setStatusNote(res.effects[0]?.message ?? 'Đã phân công.');
    } else {
      setStatusNote(res.error.message);
    }
  };

  const handleAdvancePhase = async () => {
    const res = await dispatch({ type: 'phase/advance' });
    if (res.ok) {
      playSfx('click', 0.45);
      setStatusNote(res.effects[0]?.message ?? 'Đã chuyển pha.');
    } else {
      setStatusNote(res.error.message);
    }
  };

  const handlePrevArrow = () => {
    playSfx('click', 0.35);
    if (tab === 'log') {
      setLogPage((p) => (p > 0 ? p - 1 : totalLogPages - 1));
    } else if (tab === 'crew') {
      setCrewIdx((i) => (i - 1 + CREW_IDS.length) % CREW_IDS.length);
    } else if (tab === 'systems') {
      setSysIdx((i) => (i - 1 + SYSTEM_IDS.length) % SYSTEM_IDS.length);
    }
  };

  const handleNextArrow = () => {
    playSfx('click', 0.35);
    if (tab === 'log') {
      setLogPage((p) => (p + 1) % totalLogPages);
    } else if (tab === 'crew') {
      setCrewIdx((i) => (i + 1) % CREW_IDS.length);
    } else if (tab === 'systems') {
      setSysIdx((i) => (i + 1) % SYSTEM_IDS.length);
    }
  };

  const waitingRadioCount = gameState.logistics.radioMessages.filter(
    (m) => m.status === 'transmitting'
  ).length;

  return (
    <MissionDialog
      title="Nhật ký Vận hành Trạm Artemis"
      eyebrow="STATION JOURNAL"
      panelType="journal"
      tactileFrame
      onClose={onClose}
    >
      <section className="hail-tactile-frame hail-tactile-frame--journal" aria-label="Nhật ký Trạm">
        <img
          src={HAIL_TACTILE_UI.journalFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Left Bezel 4 Square Lit Tab Buttons */}
        {JOURNAL_TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              className={`hail-jnl-tab-btn ${active ? 'is-active' : ''}`}
              style={{ top: item.top }}
              aria-pressed={active}
              aria-label={item.title}
              title={item.title}
              onClick={() => {
                playSfx('click', 0.4);
                setTab(item.id);
                setStatusNote(null);
              }}
            >
              <img
                src={active ? HAIL_TACTILE_UI.journalTabOn : HAIL_TACTILE_UI.journalTabOff}
                alt=""
                className="hail-jnl-tab-plate"
                draggable={false}
              />
              <img src={item.icon} alt="" className="hail-jnl-tab-icon" draggable={false} />
            </button>
          );
        })}

        {/* Neutral #263746 Terminal Cavity */}
        <div className="hail-jnl-screen">
          <header className="hail-term-topbar">
            <div className="hail-term-title-group">
              <span className="hail-term-code">{activeTabMeta.code}</span>
              <h2 className="hail-term-title">{activeTabMeta.title}</h2>
            </div>

            <span className="hail-term-sol">
              SOL {String(gameState.clock.sol).padStart(2, '0')}/{gameState.campaign.targetSol} //{' '}
              {tab === 'log'
                ? `TRANG ${safePage + 1}/${totalLogPages}`
                : tab === 'crew'
                  ? `CREW 0${crewIdx + 1}/0${CREW_IDS.length}`
                  : tab === 'systems'
                    ? `HỆ THỐNG 0${sysIdx + 1}/0${SYSTEM_IDS.length}`
                    : `DONKI ${weather.level.toUpperCase()}`}
            </span>
          </header>

          <div className="hail-term-body">
            {statusNote && (
              <p className="hail-term-plain-line is-ok">&gt; [HỆ THỐNG]: {statusNote}</p>
            )}

            {tab === 'log' && (
              <div className="hail-term-text-flow">
                <p className="hail-term-plain-line">
                  &gt; {PHASE_LABELS[gameState.clock.phase]} // DONKI: {weather.level.toUpperCase()} (Sửa{' '}
                  {Math.round(weather.repairSuccessProb * 100)}%)
                </p>

                {pendingEvent && (
                  <p className="hail-term-plain-line is-warn">
                    &gt; [SỰ CỐ]: {pendingEvent.title} —{' '}
                    <button
                      type="button"
                      className="hail-term-text-link"
                      onClick={() => {
                        playSfx('click', 0.45);
                        onOpenDecision();
                      }}
                    >
                      [MỞ DECISION TERMINAL &gt;&gt;]
                    </button>
                  </p>
                )}

                <ol className="hail-term-lines">
                  {pageLogs.length === 0 ? (
                    <li>
                      <span className="hail-term-prompt">&gt;</span>
                      <span>Chưa có nhật ký ghi nhận trong ngày.</span>
                    </li>
                  ) : (
                    pageLogs.map((entry, idx) => (
                      <li key={`${safePage}-${idx}`}>
                        <span className="hail-term-prompt">&gt;</span>
                        <span>
                          [Sol {entry.sol} · {entry.phase}] {entry.message}
                        </span>
                      </li>
                    ))
                  )}
                </ol>
              </div>
            )}

            {tab === 'crew' && selectedCrew && (
              <div className="hail-term-text-flow">
                <ol className="hail-term-lines">
                  {CREW_IDS.map((cid, idx) => {
                    const member = gameState.crew[cid];
                    return (
                      <li
                        key={cid}
                        className={idx === crewIdx ? 'is-active-line' : ''}
                        onClick={() => setCrewIdx(idx)}
                      >
                        <span className="hail-term-prompt">{idx === crewIdx ? '>>' : '>'}</span>
                        <span>
                          0{idx + 1} · {member.name} — HP {member.health}% · Đói:{' '}
                          {member.hungerState.toUpperCase()} ({member.satiety}%) ·{' '}
                          {member.condition.toUpperCase()}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <div className="hail-term-detail-lines">
                  <p>
                    &gt; HỒ SƠ: <strong>{selectedCrew.name}</strong> ({selectedCrewVisual?.role ?? selectedCrew.roleTag})
                  </p>
                  <p>&gt; CHUYÊN MÔN: {selectedCrewVisual?.specialty ?? 'Vận hành trạm'}</p>
                  <p>
                    &gt; SINH HIỆU: HP {selectedCrew.health}/100 | Tinh thần {selectedCrew.morale}/100 | No{' '}
                    {selectedCrew.satiety}% | Bức xạ {selectedCrew.radiationMgy.toFixed(1)} mGy | Việc:{' '}
                    {selectedCrew.assignedTask ? selectedCrew.assignedTask.type : 'Rảnh'}
                  </p>
                </div>
              </div>
            )}

            {tab === 'systems' && (
              <div className="hail-term-text-flow">
                <p className="hail-term-plain-line">
                  &gt; PHỤ TÙNG: {gameState.resources.partsKg.toFixed(1)} kg //{' '}
                  {PHASE_LABELS[gameState.clock.phase]}
                  {gameState.clock.phase === 'briefing' && advancePerm.allowed && (
                    <>
                      {' — '}
                      <button type="button" className="hail-term-text-link" onClick={handleAdvancePhase}>
                        [CHUYỂN PHA KỸ THUẬT &gt;&gt;]
                      </button>
                    </>
                  )}
                </p>

                <ol className="hail-term-lines">
                  {SYSTEM_IDS.map((sysId, idx) => {
                    const sys = gameState.systems[sysId];
                    return (
                      <li
                        key={sysId}
                        className={idx === sysIdx ? 'is-active-line' : ''}
                        onClick={() => setSysIdx(idx)}
                      >
                        <span className="hail-term-prompt">{idx === sysIdx ? '>>' : '>'}</span>
                        <span>
                          {SYSTEM_NAMES[sysId]} — CẤP {sys.level} · ĐỘ BỀN {Math.round(sys.integrity * 100)}%
                          {sys.status === 'offline' ? ' [OFFLINE]' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <p className="hail-term-plain-line">
                  &gt; LỆNH ({SYSTEM_NAMES[selectedSysId]}):{' '}
                  <button
                    type="button"
                    className="hail-term-text-link"
                    disabled={
                      gameState.clock.phase !== 'engineering' ||
                      selectedSys.integrity >= 1 ||
                      gameState.resources.partsKg < repairCost
                    }
                    onClick={() => handleSystemTask('repair-system')}
                  >
                    [SỬA -{repairCost}kg]
                  </button>
                  {targetLvl && (
                    <>
                      {'  '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        disabled={
                          gameState.clock.phase !== 'engineering' ||
                          gameState.resources.partsKg < baseUpCost
                        }
                        onClick={() => handleSystemTask('upgrade-system')}
                      >
                        [NÂNG CẤP {targetLvl} (-{baseUpCost}kg)]
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}

            {tab === 'cargo' && (
              <div className="hail-term-text-flow">
                <ol className="hail-term-lines">
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      DƯỠNG KHÍ O₂: {gameState.resources.oxygenKg.toFixed(1)} kg // NƯỚC SẠCH:{' '}
                      {gameState.resources.waterL.toFixed(1)} L (XÁM: {gameState.resources.wasteWaterL.toFixed(1)} L)
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      MRE: {gameState.resources.mrePacks} gói · MEDKIT: {gameState.resources.medkits} liều · PHỤ TÙNG:{' '}
                      {gameState.resources.partsKg.toFixed(1)} kg · PIN: {gameState.resources.batteryKWh.toFixed(1)} kWh
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      ROVER: {roverStatus.toUpperCase()} · ĐỘ TRỄ CAPCOM: 1.3s/chiều · RADIO CHỜ: {waitingRadioCount}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      TÀU TIẾP TẾ:{' '}
                      {gameState.logistics.activeOrder
                        ? `Đang bay (Hạ cánh Sol ${gameState.logistics.activeOrder.arrivalSol})`
                        : gameState.logistics.padCooldownSols > 0
                          ? `Hồi bãi đáp (${gameState.logistics.padCooldownSols} Sol)`
                          : 'Bãi đáp 80 kg sẵn sàng'}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      ĐIỀU HƯỚNG:{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('comms')}
                      >
                        [LIÊN LẠC CAPCOM &gt;&gt;]
                      </button>{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('expedition')}
                      >
                        [BẢN ĐỒ ROVER &gt;&gt;]
                      </button>{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('launch')}
                      >
                        [DONKI / CHIẾN DỊCH &gt;&gt;]
                      </button>
                    </span>
                  </li>
                </ol>
              </div>
            )}
          </div>

          {(tab === 'log' || tab === 'crew' || tab === 'systems') && (
            <footer className="hail-jnl-bottombar">
              <span className="hail-term-meta-line">
                DÙNG PHÍM MŨI TÊN ĐỂ CHUYỂN MỤC / TRANG
              </span>
              <div className="hail-keycap-pair">
                <button
                  type="button"
                  className="hail-keycap-btn"
                  aria-label="Mục trước"
                  onClick={handlePrevArrow}
                >
                  <img
                    src={HAIL_TACTILE_UI.keycapArrow}
                    alt="<"
                    className="is-flipped"
                    draggable={false}
                  />
                </button>
                <button
                  type="button"
                  className="hail-keycap-btn"
                  aria-label="Mục tiếp theo"
                  onClick={handleNextArrow}
                >
                  <img src={HAIL_TACTILE_UI.keycapArrow} alt=">" draggable={false} />
                </button>
              </div>
            </footer>
          )}
        </div>

        {/* Top-Right Frame Corner Close Button */}
        <button
          type="button"
          className="hail-tactile-corner-close"
          aria-label="Đóng Nhật ký"
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
