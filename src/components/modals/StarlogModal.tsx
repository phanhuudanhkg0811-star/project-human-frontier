import { useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import { selectActiveEventView, selectEventChoicePreviews } from '../../domain/eventSelectors.ts';
import { selectCanAdvancePhase, selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { EquipmentId, EventChoice } from '../../types/index.ts';
import { HAIL_INVENTORY, HAIL_SVG, HAIL_TACTILE_UI } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

interface ChoiceVisual {
  tone: 'green' | 'red';
  icon: string;
  shortCode: string;
}

const REJECT_CHOICE_IDS = new Set([
  'defer',
  'isolate',
  'shelter',
  'ignore',
  'skip',
  'abort',
  'do-nothing',
]);

const EQUIPMENT_ICON_MAP: Record<EquipmentId, string> = {
  core_drill: HAIL_INVENTORY.sampleDrill,
  sealant_tape: HAIL_INVENTORY.sealantTape,
  solar_lantern: HAIL_INVENTORY.solarLantern,
  dust_shield: HAIL_INVENTORY.dustShield,
  radio_repeater: HAIL_INVENTORY.radioRepeater,
  cryo_thermal_rig: HAIL_INVENTORY.cryoThermalRig,
};

function getChoiceVisual(choice: EventChoice): ChoiceVisual {
  if (REJECT_CHOICE_IDS.has(choice.id)) {
    return {
      tone: 'red',
      icon: HAIL_TACTILE_UI.stencilRejectX,
      shortCode: 'TỪ CHỐI [X]',
    };
  }
  if (choice.requiresEquipment) {
    return {
      tone: 'green',
      icon: EQUIPMENT_ICON_MAP[choice.requiresEquipment] ?? HAIL_INVENTORY.spareParts,
      shortCode: 'THIẾT BỊ',
    };
  }
  const hasPartsCost = choice.effects.some(
    (e) => e.kind === 'resource' && e.resource === 'partsKg' && e.delta < 0
  );
  if (hasPartsCost) {
    return {
      tone: 'green',
      icon: HAIL_INVENTORY.spareParts,
      shortCode: 'PHỤ TÙNG',
    };
  }
  const hasMedCost = choice.effects.some(
    (e) => e.kind === 'resource' && e.resource === 'medkits' && e.delta < 0
  );
  if (hasMedCost) {
    return {
      tone: 'green',
      icon: HAIL_INVENTORY.medicalKit,
      shortCode: 'Y TẾ',
    };
  }
  return {
    tone: 'green',
    icon: HAIL_SVG.actExplore,
    shortCode: 'THỰC THI',
  };
}

export function StarlogModal({
  onClose,
  onOpenJournal,
}: {
  onClose: () => void;
  onOpenJournal: () => void;
}) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeView = selectActiveEventView(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const advancePerm = selectCanAdvancePhase(gameState, bundle);

  const event = activeView?.event ?? null;
  const choicePreviews = event
    ? selectEventChoicePreviews(gameState, event.id, bundle)
    : [];

  const phaseAllowed = event
    ? event.mandatory
      ? gameState.clock.phase === 'briefing'
      : ['briefing', 'engineering', 'comms', 'rationing'].includes(gameState.clock.phase)
    : false;

  const triggerChoice = async (choiceId: string) => {
    if (!event) return;
    setPressedKey(choiceId);
    playSfx('click', 0.55);
    window.setTimeout(async () => {
      const res = await dispatch({
        type: 'event/resolve',
        eventId: event.id,
        choiceId,
      });
      setPressedKey(null);
      if (res.ok) {
        playSfx('open', 0.45);
        setFeedback(res.effects[0]?.message ?? 'Đã ghi nhận quyết định.');
      } else {
        playSfx('alert', 0.45);
        setFeedback(res.error.message);
      }
    }, 130);
  };

  const triggerContinue = async () => {
    setPressedKey('continue');
    playSfx('click', 0.5);
    window.setTimeout(async () => {
      setPressedKey(null);
      if (gameState.clock.phase === 'briefing' && advancePerm.allowed) {
        const res = await dispatch({ type: 'phase/advance' });
        if (!res.ok) {
          setFeedback(res.error.message);
          return;
        }
      }
      onClose();
    }, 130);
  };

  const triggerCancel = () => {
    setPressedKey('cancel');
    playSfx('click', 0.4);
    window.setTimeout(() => {
      setPressedKey(null);
      onClose();
    }, 120);
  };

  const promptText =
    event?.prompt ??
    (weather.headline
      ? `Thời tiết DONKI (${weather.level.toUpperCase()}): "${weather.headline}". Không còn sự kiện bắt buộc chờ xử lý.`
      : 'Không phát hiện sự cố khẩn cấp. Máy tính sẵn sàng chuyển pha kỹ thuật hoặc đóng terminal.');

  return (
    <MissionDialog
      title={`Decision Terminal Sol ${gameState.clock.sol}`}
      eyebrow="DECISION"
      panelType="starlog"
      tactileFrame
      onClose={onClose}
    >
      <section className="hail-tactile-frame hail-tactile-frame--decision" aria-label="Terminal Quyết định Sự cố">
        <img
          src={HAIL_TACTILE_UI.decisionFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Main Left Neutral Screen */}
        <div className="hail-dec-main-screen">
          {/* Upper Half: Strictly Pure Terminal Text Lines */}
          <div className="hail-dec-text-pane">
            <div className="hail-term-topbar">
              <span className="hail-term-code">
                {event
                  ? `DECISION TERMINAL // ${event.mandatory ? 'SỰ CỐ BẮT BUỘC' : `HẠN SOL ${activeView?.deadlineSol ?? gameState.clock.sol}`}`
                  : 'DECISION TERMINAL // GIÁM SÁT TRẠM'}
              </span>
              <span className="hail-term-sol">
                SOL {String(gameState.clock.sol).padStart(2, '0')} // {weather.level.toUpperCase()}
              </span>
            </div>

            <ol className="hail-term-lines hail-dec-lines">
              <li>
                <span className="hail-term-prompt">&gt;</span>
                <span>
                  SỰ KIỆN: <strong>{event?.title ?? 'Hệ thống Trạm ổn định'}</strong>
                </span>
              </li>
              <li>
                <span className="hail-term-prompt">&gt;</span>
                <span>PHÂN TÍCH: {promptText}</span>
              </li>
              {feedback && (
                <li className="is-active-line">
                  <span className="hail-term-prompt">&gt;</span>
                  <span>KẾT QUẢ: {feedback}</span>
                </li>
              )}
              {event && choicePreviews.length > 0 ? (
                choicePreviews.map((pv, idx) => {
                  const vis = getChoiceVisual(pv.choice);
                  const effLine = pv.effectsSummary.length > 0 ? ` (${pv.effectsSummary.slice(0, 3).join(', ')})` : '';
                  const blockNote = !pv.allowed && pv.blockedReasons[0] ? ` [KHÓA: ${pv.blockedReasons[0]}]` : '';
                  return (
                    <li key={pv.choice.id}>
                      <span className="hail-term-prompt">&gt;</span>
                      <span>
                        [{vis.tone === 'red' ? 'X' : `0${idx + 1}`} · {vis.shortCode}]: {pv.choice.label}
                        {effLine}
                        {blockNote}
                      </span>
                    </li>
                  );
                })
              ) : (
                <>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      [01 · XÁC NHẬN]:{' '}
                      {gameState.clock.phase === 'briefing' && advancePerm.allowed
                        ? 'Chuyển sang Pha 2 (Kỹ thuật & Xưởng 3D)'
                        : 'Xác nhận tiếp tục vận hành trạm'}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>[X · ĐÓNG]: Đóng bảng điều khiển và giữ nguyên trạng thái</span>
                  </li>
                </>
              )}
            </ol>
          </div>

          {/* Lower Half: Icon-Only Cards + 1-to-1 Square Green/Red Keys */}
          <div
            className="hail-dec-actions-grid"
            style={{
              gridTemplateColumns: `repeat(${Math.max(2, event ? choicePreviews.length : 2)}, minmax(0, 1fr))`,
            }}
          >
            {event && choicePreviews.length > 0 ? (
              choicePreviews.map((pv) => {
                const vis = getChoiceVisual(pv.choice);
                const disabled = !phaseAllowed || !pv.allowed;
                const isPressed = pressedKey === pv.choice.id;
                const btnArt =
                  vis.tone === 'green'
                    ? isPressed
                      ? HAIL_TACTILE_UI.btnSqGreenPressed
                      : HAIL_TACTILE_UI.btnSqGreenIdle
                    : isPressed
                      ? HAIL_TACTILE_UI.btnSqRedPressed
                      : HAIL_TACTILE_UI.btnSqRedIdle;

                return (
                  <div key={pv.choice.id} className="hail-dec-col">
                    <div
                      className={`hail-dec-icon-card is-${vis.tone}`}
                      title={!pv.allowed ? pv.blockedReasons.join('; ') : pv.choice.label}
                    >
                      <img src={vis.icon} alt={vis.shortCode} className="hail-dec-card-icon" draggable={false} />
                    </div>

                    <button
                      type="button"
                      className={`hail-sq-push-btn is-${vis.tone}`}
                      disabled={disabled}
                      aria-label={pv.choice.label}
                      title={!pv.allowed ? pv.blockedReasons.join('; ') : pv.choice.label}
                      onClick={() => triggerChoice(pv.choice.id)}
                    >
                      <img src={btnArt} alt="" draggable={false} />
                    </button>
                  </div>
                );
              })
            ) : (
              <>
                <div className="hail-dec-col">
                  <div className="hail-dec-icon-card is-green" title="Xác nhận vận hành">
                    <img src={HAIL_SVG.actRepair} alt="Công cụ kỹ thuật" className="hail-dec-card-icon" draggable={false} />
                  </div>
                  <button
                    type="button"
                    className="hail-sq-push-btn is-green"
                    aria-label="Xác nhận và tiếp tục"
                    onClick={triggerContinue}
                  >
                    <img
                      src={
                        pressedKey === 'continue'
                          ? HAIL_TACTILE_UI.btnSqGreenPressed
                          : HAIL_TACTILE_UI.btnSqGreenIdle
                      }
                      alt=""
                      draggable={false}
                    />
                  </button>
                </div>

                <div className="hail-dec-col">
                  <div className="hail-dec-icon-card is-red" title="Đóng bảng">
                    <img
                      src={HAIL_TACTILE_UI.stencilRejectX}
                      alt="Từ chối X"
                      className="hail-dec-card-icon"
                      draggable={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="hail-sq-push-btn is-red"
                    aria-label="Đóng bảng quyết định"
                    onClick={triggerCancel}
                  >
                    <img
                      src={
                        pressedKey === 'cancel'
                          ? HAIL_TACTILE_UI.btnSqRedPressed
                          : HAIL_TACTILE_UI.btnSqRedIdle
                      }
                      alt=""
                      draggable={false}
                    />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side Auxiliary Boxes */}
        <div className="hail-dec-right-box" style={{ top: '22.47%' }}>
          <p className="hail-dec-aux-line">&gt; TRẠNG THÁI:</p>
          <p className={`hail-dec-aux-line ${event ? 'is-warn' : 'is-ok'}`}>
            {event ? 'CẦN QUYẾT ĐỊNH' : 'TRẠM ỔN ĐỊNH'}
          </p>
          <p className="hail-dec-aux-line">
            SỬA: {Math.round(weather.repairSuccessProb * 100)}%
          </p>
        </div>

        <div className="hail-dec-right-box" style={{ top: '39.89%' }}>
          <p className="hail-dec-aux-line">&gt; PHỤ TÙNG: {gameState.resources.partsKg.toFixed(1)} KG</p>
          <p className="hail-dec-aux-line">&gt; O₂: {gameState.resources.oxygenKg.toFixed(1)} KG</p>
          <p className="hail-dec-aux-line">&gt; NƯỚC: {gameState.resources.waterL.toFixed(1)} L</p>
        </div>

        <div className="hail-dec-right-box" style={{ top: '57.37%' }}>
          <p className="hail-dec-aux-line">&gt; ĐIỀU HƯỚNG:</p>
          <button
            type="button"
            className="hail-term-text-link"
            onClick={() => {
              playSfx('click', 0.45);
              onOpenJournal();
            }}
          >
            [MỞ NHẬT KÝ 4-TAB &gt;&gt;]
          </button>
        </div>

        {/* Top-Right Close Button */}
        <button
          type="button"
          className="hail-tactile-corner-close"
          aria-label="Đóng Terminal Quyết định"
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
