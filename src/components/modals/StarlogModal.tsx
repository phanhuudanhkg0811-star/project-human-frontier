import { useRef, useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import { selectActiveEventView, selectEventChoicePreviews } from '../../domain/eventSelectors.ts';
import { selectCanAdvancePhase, selectWeatherOutlook } from '../../domain/selectors.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import type { Locale } from '../../i18n/types.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { EquipmentId, EventChoice, EventResourceKey } from '../../types/index.ts';
import {
  eventDeadlineText,
  formatEventEffectSummary,
  getEventCategoryLabel,
  getEventResourceLabel,
} from '../eventPresentation.ts';
import { HAIL_INVENTORY, HAIL_SVG, HAIL_TACTILE_UI, getHailEventScene } from '../cabin/hailAssets.ts';
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

function getChoiceVisual(choice: EventChoice, locale: Locale): ChoiceVisual {
  if (REJECT_CHOICE_IDS.has(choice.id)) {
    return {
      tone: 'red',
      icon: HAIL_TACTILE_UI.stencilRejectX,
      shortCode: locale === 'en' ? 'REJECT [X]' : 'TỪ CHỐI [X]',
    };
  }
  if (choice.requiresEquipment) {
    return {
      tone: 'green',
      icon: EQUIPMENT_ICON_MAP[choice.requiresEquipment] ?? HAIL_INVENTORY.spareParts,
      shortCode: locale === 'en' ? 'GEAR' : 'THIẾT BỊ',
    };
  }
  const hasPartsCost = choice.effects.some(
    (e) => e.kind === 'resource' && e.resource === 'partsKg' && e.delta < 0
  );
  if (hasPartsCost) {
    return {
      tone: 'green',
      icon: HAIL_INVENTORY.spareParts,
      shortCode: locale === 'en' ? 'PARTS' : 'PHỤ TÙNG',
    };
  }
  const hasMedCost = choice.effects.some(
    (e) => e.kind === 'resource' && e.resource === 'medkits' && e.delta < 0
  );
  if (hasMedCost) {
    return {
      tone: 'green',
      icon: HAIL_INVENTORY.medicalKit,
      shortCode: locale === 'en' ? 'MEDKIT' : 'Y TẾ',
    };
  }
  return {
    tone: 'green',
    icon: HAIL_SVG.actExplore,
    shortCode: locale === 'en' ? 'EXECUTE' : 'THỰC THI',
  };
}

export function StarlogModal({
  onClose,
  onOpenJournal,
}: {
  onClose: () => void;
  onOpenJournal?: () => void;
}) {
  const { gameState, bundle, dispatch } = useGameStore();
  const { locale, t, pickText, localize } = useI18n();
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const activeView = selectActiveEventView(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const advancePerm = selectCanAdvancePhase(gameState, bundle);

  const event = activeView?.event ?? null;
  const choicePreviews = event
    ? selectEventChoicePreviews(gameState, event.id, bundle)
    : [];

  const planningPhase = ['briefing', 'engineering', 'comms', 'rationing'].includes(gameState.clock.phase);
  const canRespondNow =
    planningPhase &&
    gameState.campaign.status === 'active' &&
    activeView !== null &&
    gameState.clock.sol <= activeView.deadlineSol;

  const phaseAllowed = event
    ? event.mandatory
      ? gameState.clock.phase === 'briefing' && canRespondNow
      : canRespondNow
    : false;

  const triggerChoice = async (choiceId: string) => {
    if (!event || inFlight.current || !phaseAllowed) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setChoiceError(null);
    setFeedback(null);
    setPressedKey(choiceId);
    playSfx('click', 0.55);
    try {
      const res = await dispatch({
        type: 'event/resolve',
        eventId: event.id,
        choiceId,
      });
      if (res.ok) {
        playSfx('open', 0.45);
        setFeedback(res.effects[0]?.message ?? t('starlog.resolvedOk'));
      } else {
        playSfx('alert', 0.45);
        setChoiceError(res.error.message);
      }
    } catch {
      playSfx('alert', 0.45);
      setChoiceError(t('starlog.resolveFail'));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
      setPressedKey(null);
    }
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

  const promptText = event
    ? pickText(event.prompt, event.promptEn)
    : weather.headline
      ? pickText(
          `Thời tiết DONKI (${weather.level.toUpperCase()}): "${weather.headline}". Không còn sự kiện bắt buộc chờ xử lý.`,
          `DONKI Weather (${weather.level.toUpperCase()}): "${weather.headline}". No mandatory events awaiting response.`
        )
      : pickText(
          'Không phát hiện sự cố khẩn cấp. Máy tính sẵn sàng chuyển pha kỹ thuật hoặc đóng terminal.',
          'No urgent incidents detected. Terminal ready to advance to Engineering or close.'
        );

  return (
    <MissionDialog
      title={t('starlog.title', { sol: gameState.clock.sol })}
      eyebrow="DECISION"
      panelType="starlog"
      tactileFrame
      onClose={onClose}
    >
      <section
        className="hail-tactile-frame hail-tactile-frame--decision"
        aria-label={pickText('Terminal Quyết định Sự cố', 'Incident Decision Terminal')}
        aria-busy={isSubmitting}
      >
        <img
          src={HAIL_TACTILE_UI.decisionFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Main Left Neutral Screen */}
        <div className="hail-dec-main-screen">
          {/* Upper Half: Strictly Pure Terminal Text Lines & Event Metadata */}
          <div className="hail-dec-text-pane">
            <div className="hail-term-topbar">
              <span className="hail-term-code">
                {event && activeView
                  ? `${getEventCategoryLabel(event.category, locale)} // ${
                      activeView.mandatory ? t('events.mandatoryShort') : t('events.optionalShort')
                    } · ${t('events.priorityLabel', { priority: activeView.priority })}`
                  : pickText('DECISION TERMINAL // GIÁM SÁT TRẠM', 'DECISION TERMINAL // HABITAT MONITOR')}
              </span>
              <span className="hail-term-sol">
                {activeView
                  ? eventDeadlineText(activeView, gameState.clock.sol, locale)
                  : `SOL ${String(gameState.clock.sol).padStart(2, '0')} // ${t(`donki.${weather.level}`)}`}
              </span>
            </div>

            {event && activeView && (
              <div className={`hail-dec-event-head hail-event-detail--${event.category}`}>
                <img
                  src={getHailEventScene(event.art)}
                  alt=""
                  className="hail-dec-event-thumb"
                  draggable={false}
                />
                <div className="hail-dec-event-meta">
                  <strong className="hail-dec-event-title">
                    {pickText(event.title, event.titleEn)}
                  </strong>
                  <span className="hail-dec-event-sub">
                    {activeView.mandatory ? t('starlog.mandatoryDetail') : t('starlog.optionalDetail')}
                  </span>
                </div>
              </div>
            )}

            {event && !canRespondNow && (
              <p className="hail-event-error">{t('starlog.cannotRespond')}</p>
            )}
            {choiceError && (
              <p role="alert" className="hail-event-error">
                {localize(choiceError, bundle)}
              </p>
            )}

            <ol className="hail-term-lines hail-dec-lines">
              {!event && (
                <li>
                  <span className="hail-term-prompt">&gt;</span>
                  <span>
                    {pickText('SỰ KIỆN:', 'EVENT:')}{' '}
                    <strong>{pickText('Hệ thống Trạm ổn định', 'Habitat Systems Nominal')}</strong>
                  </span>
                </li>
              )}
              <li>
                <span className="hail-term-prompt">&gt;</span>
                <span>
                  {pickText('PHÂN TÍCH:', 'ANALYSIS:')} {promptText}
                </span>
              </li>
              {feedback && (
                <li className="is-active-line">
                  <span className="hail-term-prompt">&gt;</span>
                  <span>
                    {pickText('KẾT QUẢ:', 'RESULT:')} {localize(feedback, bundle)}
                  </span>
                </li>
              )}
              {event && choicePreviews.length > 0 ? (
                choicePreviews.map((pv, idx) => {
                  const vis = getChoiceVisual(pv.choice, locale);
                  const choiceLabel = pickText(pv.choice.label, pv.choice.labelEn);
                  const reasonsId = `event-choice-${pv.choice.id}-reasons`;
                  const deltaParts = [
                    ...Object.entries(pv.resourceDeltas).map(
                      ([res, delta]) =>
                        `${getEventResourceLabel(res as EventResourceKey, locale)}: ${
                          Number(delta) > 0 ? '+' : ''
                        }${delta}`
                    ),
                    ...(pv.scienceDelta !== 0
                      ? [`${t('starlog.scienceLabel')} ${pv.scienceDelta > 0 ? '+' : ''}${pv.scienceDelta}`]
                      : []),
                  ];
                  const effText = pv.effectsSummary
                    .map((effect) => formatEventEffectSummary(effect, locale))
                    .join(', ');

                  return (
                    <li
                      key={pv.choice.id}
                      className={`hail-dec-choice-item ${!pv.allowed ? 'is-blocked' : ''}`}
                    >
                      <span className="hail-term-prompt">&gt;</span>
                      <div className="hail-dec-choice-body">
                        <div className="hail-dec-choice-top">
                          <span className="hail-dec-choice-tag">
                            [{vis.tone === 'red' ? 'X' : `0${idx + 1}`} · {vis.shortCode}]
                          </span>
                          <button
                            type="button"
                            className="hail-btn hail-choice-card"
                            disabled={!phaseAllowed || !pv.allowed || isSubmitting}
                            aria-describedby={pv.blockedReasons.length > 0 ? reasonsId : undefined}
                            onClick={() => triggerChoice(pv.choice.id)}
                          >
                            {isSubmitting
                              ? t('starlog.submitting')
                              : t('starlog.choosePrefix', { label: choiceLabel })}
                          </button>
                        </div>
                        {(deltaParts.length > 0 || effText) && (
                          <span className="hail-dec-costs-line">
                            {[deltaParts.join(' · '), effText].filter(Boolean).join(' — ')}
                          </span>
                        )}
                        {pv.blockedReasons.length > 0 && (
                          <ul
                            id={reasonsId}
                            className="hail-event-blocked hail-dec-inline-list"
                            aria-label={t('starlog.blockedAria')}
                          >
                            {pv.blockedReasons.map((reason, index) => (
                              <li key={index}>{formatEventEffectSummary(reason, locale)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })
              ) : (
                <>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {pickText('[01 · XÁC NHẬN]:', '[01 · CONFIRM]:')}{' '}
                      {gameState.clock.phase === 'briefing' && advancePerm.allowed
                        ? pickText(
                            'Chuyển sang Pha 2 (Kỹ thuật & Xưởng 3D)',
                            'Advance to Phase 2 (Engineering & 3D Fabricator)'
                          )
                        : pickText('Xác nhận tiếp tục vận hành trạm', 'Confirm continued station operations')}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {pickText(
                        '[X · ĐÓNG]: Đóng bảng điều khiển và giữ nguyên trạng thái',
                        '[X · CLOSE]: Close console and keep current state'
                      )}
                    </span>
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
                const vis = getChoiceVisual(pv.choice, locale);
                const choiceLabel = pickText(pv.choice.label, pv.choice.labelEn);
                const disabled = !phaseAllowed || !pv.allowed || isSubmitting;
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
                      title={
                        !pv.allowed
                          ? pv.blockedReasons
                              .map((reason) => formatEventEffectSummary(reason, locale))
                              .join('; ')
                          : choiceLabel
                      }
                    >
                      <img src={vis.icon} alt={vis.shortCode} className="hail-dec-card-icon" draggable={false} />
                    </div>

                    <button
                      type="button"
                      className={`hail-sq-push-btn is-${vis.tone}`}
                      disabled={disabled}
                      aria-label={choiceLabel}
                      title={
                        !pv.allowed
                          ? pv.blockedReasons
                              .map((reason) => formatEventEffectSummary(reason, locale))
                              .join('; ')
                          : choiceLabel
                      }
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
                  <div
                    className="hail-dec-icon-card is-green"
                    title={pickText('Xác nhận vận hành', 'Confirm operations')}
                  >
                    <img
                      src={HAIL_SVG.actRepair}
                      alt={pickText('Công cụ kỹ thuật', 'Engineering tool')}
                      className="hail-dec-card-icon"
                      draggable={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="hail-sq-push-btn is-green"
                    aria-label={pickText('Xác nhận và tiếp tục', 'Confirm and continue')}
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
                  <div className="hail-dec-icon-card is-red" title={pickText('Đóng bảng', 'Close panel')}>
                    <img
                      src={HAIL_TACTILE_UI.stencilRejectX}
                      alt={pickText('Từ chối X', 'Cancel X')}
                      className="hail-dec-card-icon"
                      draggable={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="hail-sq-push-btn is-red"
                    aria-label={pickText('Đóng bảng quyết định', 'Close decision terminal')}
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
          <p className="hail-dec-aux-line">&gt; {pickText('TRẠNG THÁI:', 'STATUS:')}</p>
          <p className={`hail-dec-aux-line ${event ? 'is-warn' : 'is-ok'}`}>
            {event ? pickText('CẦN QUYẾT ĐỊNH', 'ACTION NEEDED') : pickText('TRẠM ỔN ĐỊNH', 'NOMINAL')}
          </p>
          <p className="hail-dec-aux-line">
            {pickText('SỬA:', 'REPAIR:')} {Math.round(weather.repairSuccessProb * 100)}%
          </p>
        </div>

        <div className="hail-dec-right-box" style={{ top: '39.89%' }}>
          <p className="hail-dec-aux-line">
            &gt; {pickText('PHỤ TÙNG:', 'PARTS:')} {gameState.resources.partsKg.toFixed(1)} KG
          </p>
          <p className="hail-dec-aux-line">&gt; O₂: {gameState.resources.oxygenKg.toFixed(1)} KG</p>
          <p className="hail-dec-aux-line">
            &gt; {pickText('NƯỚC:', 'WATER:')} {gameState.resources.waterL.toFixed(1)} L
          </p>
        </div>

        <div className="hail-dec-right-box" style={{ top: '57.37%' }}>
          <p className="hail-dec-aux-line">&gt; {pickText('ĐIỀU HƯỚNG:', 'NAVIGATE:')}</p>
          <button
            type="button"
            className="hail-term-text-link"
            onClick={() => {
              playSfx('click', 0.45);
              onOpenJournal?.();
            }}
          >
            {pickText('[MỞ NHẬT KÝ 4-TAB >>]', '[OPEN 4-TAB JOURNAL >>]')}
          </button>
        </div>

        {/* Top-Right Close Button */}
        <button
          type="button"
          className="hail-tactile-corner-close"
          aria-label={t('common.closeDialog')}
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
