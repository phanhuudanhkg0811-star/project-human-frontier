import { AlertTriangle, RefreshCw } from 'lucide-react';
import { selectCanAdvancePhase, selectMissionProgress, selectRoverSamples, selectWeatherOutlook } from '../domain/selectors.ts';
import { useGameStore } from '../store/gameStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { ActiveModalType, CrewId, EquipmentId } from '../types/index.ts';
import { SystemControls } from './SystemControls.tsx';
import {
  HAIL_ENV,
  HAIL_EQUIPMENT,
  HAIL_INVENTORY,
  HAIL_SVG,
  getHailCrewVisual,
} from './cabin/hailAssets.ts';
import { TelemetryTopBar } from './hud/TelemetryTopBar.tsx';
import { CharacterSheetModal } from './modals/CharacterSheetModal.tsx';
import { CommsLogisticsModal } from './modals/CommsLogisticsModal.tsx';
import { CraftingModal } from './modals/CraftingModal.tsx';
import { EndOfDayModal } from './modals/EndOfDayModal.tsx';
import { ExpeditionModal } from './modals/ExpeditionModal.tsx';
import { MissionDialog } from './modals/MissionDialog.tsx';
import { MissionLaunchModal } from './modals/MissionLaunchModal.tsx';
import { NightCutsceneModal } from './modals/NightCutsceneModal.tsx';
import { StarlogModal } from './modals/StarlogModal.tsx';

const EQUIPMENT_RACK_META: ReadonlyArray<{
  id: EquipmentId;
  label: string;
  img: string;
}> = [
  { id: 'core_drill', label: 'Core Drill', img: HAIL_INVENTORY.sampleDrill },
  { id: 'sealant_tape', label: 'Sealant Tape', img: HAIL_INVENTORY.sealantTape },
  { id: 'solar_lantern', label: 'Solar Lantern', img: HAIL_INVENTORY.specialBeacon },
  { id: 'dust_shield', label: 'Dust Shield', img: HAIL_INVENTORY.dustShield },
  { id: 'radio_repeater', label: 'Radio Repeater', img: HAIL_INVENTORY.radioRepeater },
  { id: 'cryo_thermal_rig', label: 'Cryo Thermal Rig', img: HAIL_INVENTORY.filterSeal },
];

const CREW_SLOTS: ReadonlyArray<{
  crewId: CrewId;
  depth: 'foreground' | 'rear';
  style: { left: string; top: string; width: string; height: string };
}> = [
  { crewId: 'cmd', depth: 'foreground', style: { left: '14%', top: '38%', width: '16%', height: '55%' } },
  { crewId: 'eng', depth: 'rear', style: { left: '36%', top: '42%', width: '12%', height: '38%' } },
  { crewId: 'doc', depth: 'rear', style: { left: '52%', top: '42%', width: '12%', height: '38%' } },
  { crewId: 'geo', depth: 'foreground', style: { left: '70%', top: '38%', width: '16%', height: '55%' } },
];

export function HailGameViewport() {
  const { gameState, bundle, dispatch, saveRecoveryError, resetCampaign, lastError, dismissError } = useGameStore();
  const roverSamples = selectRoverSamples(gameState);
  const { activeModal, openModal, closeModal } = useUiStore();
  const [sysModalOpen, setSysModalOpen] = [activeModal === 'menu', () => openModal('menu')];

  const progress = selectMissionProgress(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const advancePerm = selectCanAdvancePhase(gameState);

  const fabSprite =
    gameState.systems.fabricator.status === 'offline'
      ? HAIL_EQUIPMENT.fabricatorDamaged
      : gameState.fabricator.activeJob
        ? HAIL_EQUIPMENT.fabricatorWorking
        : HAIL_EQUIPMENT.fabricatorIdle;

  const focusClass =
    activeModal === 'crafting'
      ? 'is-focus-left-floor'
      : activeModal === 'comms' || activeModal === 'expedition'
        ? 'is-focus-right-wall'
        : activeModal === 'starlog' || activeModal === 'end'
          ? 'is-focus-console'
          : '';

  const openPanel = (m: ActiveModalType) => openModal(m);

  const handlePrimaryAction = async () => {
    if (gameState.clock.phase === 'briefing' && gameState.events.activeEventId) {
      openPanel('starlog');
      return;
    }
    if (gameState.clock.phase === 'rationing') {
      openPanel('end');
      return;
    }
    if (advancePerm.allowed) {
      await dispatch({ type: 'phase/advance' });
    }
  };

  return (
    <main className="hail-viewport">
      {/* Fail-Closed Save Recovery Banner */}
      {saveRecoveryError && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92%] p-3 rounded-xl bg-rose-950/95 border border-rose-500 text-rose-100 shadow-2xl flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <div>
              <strong>Lỗi Khôi phục Save [{saveRecoveryError.code}]:</strong> {saveRecoveryError.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => resetCampaign()}
            className="hail-btn hail-btn--warn shrink-0 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tạo Chiến dịch Mới
          </button>
        </div>
      )}

      {lastError && !saveRecoveryError && (
        <div
          role="status"
          onClick={dismissError}
          className="fixed top-20 right-4 z-50 max-w-sm p-2.5 rounded-lg bg-amber-950/95 border border-amber-400/60 text-amber-100 text-xs cursor-pointer shadow-lg"
        >
          <strong>[{lastError.code}]</strong> {lastError.message} (Chạm để đóng)
        </div>
      )}

      <div className="hail-stage">
        <TelemetryTopBar />

        <div className={`hail-camera-rig ${focusClass}`}>
          {/* Observation Window Backdrop */}
          <div className="hail-window-aperture" aria-hidden="true">
            <img src={HAIL_ENV.spaceDeep} alt="" className="hail-l00-space" draggable={false} />
            <img
              src={progress.isLunarNight ? HAIL_ENV.lunarNight : HAIL_ENV.lunarDay}
              alt=""
              className="hail-l01-lunar"
              draggable={false}
            />
          </div>

          <img src={HAIL_ENV.cockpitShell} alt="Khoang chỉ huy trạm Artemis" className="hail-l02-shell" draggable={false} />

          {/* UL: Food & Aid Wall Rack */}
          <div className="hail-bay-rack hail-bay-rack--ul" aria-label="Tủ Thực phẩm MRE và Y tế">
            <div className="hail-bay-rack-shell">
              <div className="hail-rack-header" aria-hidden="true">
                <span className="hail-rack-header-stripe" />
                <span className="hail-rack-header-rivet" />
              </div>
              <div className="hail-rack-grid hail-rack-grid--2x2">
                <button
                  type="button"
                  className="hail-rack-cell"
                  onClick={() => openPanel('end')}
                  aria-label={`MRE (${gameState.resources.mrePacks} gói)`}
                >
                  <img
                    src={HAIL_INVENTORY.mrePack}
                    alt="MRE"
                    className={`hail-rack-item ${gameState.resources.mrePacks <= 0 ? 'is-empty-slot' : ''}`}
                    draggable={false}
                  />
                  <span className="hail-rack-cell-tag">MRE ×{gameState.resources.mrePacks}</span>
                </button>
                <button
                  type="button"
                  className="hail-rack-cell"
                  onClick={() => openPanel('character')}
                  aria-label={`Medkit (${gameState.resources.medkits} bộ)`}
                >
                  <img
                    src={HAIL_INVENTORY.medicalKit}
                    alt="Medkit"
                    className={`hail-rack-item ${gameState.resources.medkits <= 0 ? 'is-empty-slot' : ''}`}
                    draggable={false}
                  />
                  <span className="hail-rack-cell-tag">MED ×{gameState.resources.medkits}</span>
                </button>
                <button
                  type="button"
                  className="hail-rack-cell"
                  onClick={() => openPanel('end')}
                  aria-label={`Nước (${gameState.resources.waterL.toFixed(0)}L)`}
                >
                  <img
                    src={HAIL_INVENTORY.waterPack}
                    alt="Water"
                    className={`hail-rack-item ${gameState.resources.waterL <= 0 ? 'is-empty-slot' : ''}`}
                    draggable={false}
                  />
                  <span className="hail-rack-cell-tag">{gameState.resources.waterL.toFixed(0)}L</span>
                </button>
                <button
                  type="button"
                  className="hail-rack-cell"
                  onClick={() => setSysModalOpen()}
                  aria-label={`O2 (${gameState.resources.oxygenKg.toFixed(0)}kg)`}
                >
                  <img
                    src={HAIL_INVENTORY.oxygenCell}
                    alt="O2"
                    className={`hail-rack-item ${gameState.resources.oxygenKg <= 0 ? 'is-empty-slot' : ''}`}
                    draggable={false}
                  />
                  <span className="hail-rack-cell-tag">{gameState.resources.oxygenKg.toFixed(0)}kg</span>
                </button>
              </div>
            </div>
          </div>

          {/* LL: 3D Fabricator Bay */}
          <button
            type="button"
            data-slot="left-floor"
            className="hail-station hail-station--floor is-primary-focus"
            style={{ left: '2.8708%', top: '53.56%', width: '16.2081%', height: '31.1371%' }}
            onClick={() => openPanel('crafting')}
            aria-label="Mở Xưởng in 3D Fabricator"
          >
            <img src={fabSprite} alt="3D Fabricator" className="hail-sprite-contain" draggable={false} />
            <span className="hail-station-tag">
              3D FAB Lv{gameState.systems.fabricator.level}{' '}
              {gameState.fabricator.activeJob ? '· ĐANG IN' : '· SẴN SÀNG'}
            </span>
          </button>

          {/* UR: CAPCOM & Rover Comms */}
          <button
            type="button"
            data-slot="right-wall"
            className="hail-station hail-station--wall"
            style={{ left: '81.1005%', top: '14.9841%', width: '15.9091%', height: '31.4559%' }}
            onClick={() => openPanel('comms')}
            aria-label="Mở Trạm liên lạc CAPCOM & Tàu hàng"
          >
            <img src={HAIL_EQUIPMENT.comms} alt="CAPCOM" className="hail-sprite-contain" draggable={false} />
            <span className="hail-station-tag">
              CAPCOM · {gameState.logistics.activeOrder ? `CARGO S${gameState.logistics.activeOrder.arrivalSol}` : '80KG READY'}
            </span>
          </button>

          {/* LR: Inventory (6 Equipment) & 3 Samples */}
          <div className="hail-bay-rack hail-bay-rack--lr" aria-label="Kho 6 Thiết bị & 3 Mẫu thám hiểm Rover">
            <div className="hail-bay-rack-shell">
              <div className="hail-rack-header" aria-hidden="true">
                <span className="hail-rack-header-stripe" />
                <span className="hail-rack-header-rivet" />
              </div>
              <div className="hail-rack-grid hail-rack-grid--3x3">
                {EQUIPMENT_RACK_META.map((item) => {
                  const eq = gameState.equipment[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="hail-rack-cell"
                      onClick={() => openPanel('expedition')}
                      title={`${item.label}: ${eq.owned ? `${eq.state} (${eq.durability}%)` : 'Chưa chế tạo'}`}
                    >
                      <img
                        src={item.img}
                        alt={item.label}
                        className={`hail-rack-item ${!eq.owned ? 'is-empty-slot' : ''}`}
                        draggable={false}
                      />
                      <span className="hail-rack-cell-tag">
                        {eq.owned ? `${eq.durability}%` : 'LOCK'}
                      </span>
                    </button>
                  );
                })}
                {[0, 1, 2].map((slotIdx) => {
                  const sampleName = roverSamples[slotIdx];
                  return (
                    <button
                      key={`sample-${slotIdx}`}
                      type="button"
                      className="hail-rack-cell is-sample-slot"
                      onClick={() => openPanel('expedition')}
                      title={sampleName ?? `Khoang mẫu ${slotIdx + 1}`}
                    >
                      <img
                        src={HAIL_INVENTORY.lunarSample}
                        alt="Sample"
                        className={`hail-rack-item ${!sampleName ? 'is-empty-slot' : ''}`}
                        draggable={false}
                      />
                      <span className="hail-rack-cell-tag">{sampleName ? 'MẪU ✓' : `S${slotIdx + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Center Crew Seats */}
          <div className="hail-crew-stage">
            {CREW_SLOTS.map((slot) => {
              const member = gameState.crew[slot.crewId];
              const visual = getHailCrewVisual(slot.crewId);
              const impaired = member.condition !== 'fit' || member.hungerState === 'starving';
              return (
                <button
                  key={slot.crewId}
                  type="button"
                  onClick={() => openPanel('character')}
                  className={`hail-crew-member ${slot.depth === 'rear' ? 'is-rear' : 'is-foreground'} ${impaired ? 'is-impaired' : ''}`}
                  style={slot.style}
                  aria-label={`Phi hành gia ${member.name}`}
                >
                  <img src={visual.seated} alt={member.name} className="hail-crew-figure" draggable={false} />
                  <span className={`hail-crew-pill ${slot.depth === 'rear' ? 'is-rear-pill' : ''}`}>
                    {member.name.split(' ')[0]} · ♥{member.health} · {member.hungerState.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Center Telemetry Console */}
          <div
            className="hail-decision-console"
            style={{ left: '27.5%', top: '55.6%', width: '45%', height: '37.1%' }}
          >
            <img src={HAIL_EQUIPMENT.consoleDesk} alt="Bàn điều khiển trung tâm" className="hail-console-art" draggable={false} />
            <div className="hail-console-screens">
              <button
                type="button"
                className={`hail-console-screen ${gameState.events.activeEventId ? 'is-alert' : ''}`}
                onClick={() => openPanel('starlog')}
                aria-label="Mở Giao ban & Sự kiện"
              >
                <span className="hail-screen-code">SOL</span>
                <strong>{String(gameState.clock.sol).padStart(2, '0')}/32</strong>
              </button>
              <button
                type="button"
                className={`hail-console-screen ${weather.level === 'storm' || weather.level === 'extreme' ? 'is-alert' : ''}`}
                onClick={() => openPanel('launch')}
                aria-label="Mở Chiến dịch & NASA DONKI"
              >
                <span className="hail-screen-code">DONKI</span>
                <strong>{weather.level.toUpperCase()}</strong>
              </button>
              <button
                type="button"
                className="hail-console-screen"
                onClick={() => setSysModalOpen()}
                aria-label="Mở Telemetry 5 Hệ thống & WRS"
              >
                <span className="hail-screen-code">WRS</span>
                <strong>{gameState.dailyPlan.wrsEnabled ? '90% ON' : 'OFF'}</strong>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <footer className="hail-action-band">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => openPanel('starlog')}>
              <img src={HAIL_SVG.sysComms} alt="" />
              <span>Giao ban{gameState.events.activeEventId ? ' (!)' : ''}</span>
            </button>
            <button type="button" onClick={() => setSysModalOpen()}>
              <img src={HAIL_SVG.sysPower} alt="" />
              <span>Hệ thống</span>
            </button>
            <button type="button" onClick={() => openPanel('crafting')}>
              <img src={HAIL_SVG.resParts} alt="" />
              <span>3D Fab</span>
            </button>
            <button type="button" onClick={() => openPanel('character')}>
              <img src={HAIL_SVG.sysMed} alt="" />
              <span>Crew</span>
            </button>
            <button type="button" onClick={() => openPanel('comms')}>
              <img src={HAIL_SVG.sysComms} alt="" />
              <span>CAPCOM</span>
            </button>
            <button type="button" onClick={() => openPanel('expedition')}>
              <img src={HAIL_SVG.sysRobot} alt="" />
              <span>Rover</span>
            </button>
            <button type="button" onClick={() => openPanel('launch')}>
              <img src={HAIL_SVG.badgeNasaStem} alt="" />
              <span>Chiến dịch</span>
            </button>
          </div>

          <div className="hail-action-band-right">
            <span className="hail-phase-hint">
              {advancePerm.allowed ? 'Sẵn sàng sang pha tiếp theo' : advancePerm.message}
            </span>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="is-primary"
            >
              <img src={HAIL_SVG.actExplore} alt="" />
              <span>
                {gameState.clock.phase === 'briefing' && gameState.events.activeEventId
                  ? 'Xử lý Sự kiện'
                  : gameState.clock.phase === 'rationing'
                    ? 'End-Sol'
                    : 'Pha tiếp →'}
              </span>
            </button>
          </div>
        </footer>
      </div>

      {/* Modals */}
      {activeModal === 'starlog' && <StarlogModal onClose={closeModal} />}
      {activeModal === 'character' && <CharacterSheetModal onClose={closeModal} />}
      {activeModal === 'crafting' && <CraftingModal onClose={closeModal} />}
      {activeModal === 'expedition' && <ExpeditionModal onClose={closeModal} />}
      {activeModal === 'comms' && <CommsLogisticsModal onClose={closeModal} />}
      {activeModal === 'end' && <EndOfDayModal onClose={closeModal} />}
      {activeModal === 'launch' && <MissionLaunchModal onClose={closeModal} />}
      {sysModalOpen && (
        <MissionDialog
          title="Telemetry Console · 5 Hệ thống Trạm & WRS"
          eyebrow="PHA 2 · ENGINEERING & LIFE SUPPORT"
          art={HAIL_EQUIPMENT.consoleDesk}
          panelType="menu"
          dockSide="left"
          onClose={closeModal}
        >
          <SystemControls />
        </MissionDialog>
      )}
      <NightCutsceneModal />
    </main>
  );
}
