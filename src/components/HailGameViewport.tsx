import { useEffect } from 'react';
import { AlertTriangle, CircleHelp, Languages, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { playSfx, startMusic, syncMusicMuted } from '../audio/sfx.ts';
import { playSfx as playSynthSfx, syncAmbientAudio } from '../audio/soundEngine.ts';
import { selectActiveEventView } from '../domain/eventSelectors.ts';
import { EventPriorityBanner } from './EventPriorityBanner.tsx';
import { selectCanAdvancePhase, selectMissionProgress, selectRoverSamples, selectWeatherOutlook } from '../domain/selectors.ts';
import { useGameStore } from '../store/gameStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { downloadArtifact } from '../persistence/downloadArtifact.ts';
import { SAVE_STORAGE_KEY } from '../persistence/saveAdapter.ts';
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
import { JournalModal } from './modals/JournalModal.tsx';
import { MissionDialog } from './modals/MissionDialog.tsx';
import { MissionLaunchModal } from './modals/MissionLaunchModal.tsx';
import { NightCutsceneModal } from './modals/NightCutsceneModal.tsx';
import { StarlogModal } from './modals/StarlogModal.tsx';
import { TutorialModal } from './modals/TutorialModal.tsx';
import { AmbientCanvasLayer } from './cabin/AmbientCanvasLayer.tsx';
import { useI18n } from '../i18n/useI18n.ts';

const EQUIPMENT_RACK_META: ReadonlyArray<{
  id: EquipmentId;
  label: string;
  img: string;
}> = [
  { id: 'core_drill', label: 'Core Drill', img: HAIL_INVENTORY.sampleDrill },
  { id: 'sealant_tape', label: 'Sealant Tape', img: HAIL_INVENTORY.sealantTape },
  { id: 'solar_lantern', label: 'Solar Lantern', img: HAIL_INVENTORY.solarLantern },
  { id: 'dust_shield', label: 'Dust Shield', img: HAIL_INVENTORY.dustShield },
  { id: 'radio_repeater', label: 'Radio Repeater', img: HAIL_INVENTORY.radioRepeater },
  { id: 'cryo_thermal_rig', label: 'Cryo Thermal Rig', img: HAIL_INVENTORY.cryoThermalRig },
];

const CREW_SLOTS: ReadonlyArray<{
  crewId: CrewId;
  depth: 'foreground' | 'rear';
  style: { left: string; top: string; width: string; height: string };
}> = [
  { crewId: 'cmd', depth: 'foreground', style: { left: '13.5%', top: '39%', width: '21.5%', height: '53%' } },
  { crewId: 'eng', depth: 'rear', style: { left: '34.5%', top: '35.5%', width: '13%', height: '42.5%' } },
  { crewId: 'doc', depth: 'rear', style: { left: '52.5%', top: '34.5%', width: '12.5%', height: '43.5%' } },
  { crewId: 'geo', depth: 'foreground', style: { left: '67.5%', top: '39%', width: '18.5%', height: '53%' } },
];

export function HailGameViewport() {
  const { gameState, bundle, dispatch, saveRecoveryError, resetCampaign, lastError, dismissError, migrationNotice, dismissMigrationNotice } = useGameStore();
  const roverSamples = selectRoverSamples(gameState);
  const {
    activeModal,
    openModal,
    closeModal,
    selectCrew,
    audioMuted,
    toggleAudioMute,
    reducedMotion,
    locale,
    setLocale,
  } = useUiStore();
  const { t } = useI18n();
  const [sysModalOpen, setSysModalOpen] = [activeModal === 'menu', () => openPanel('menu')];

  useEffect(() => {
    const bootMusic = () => {
      startMusic(0.28);
      playSynthSfx('click');
    };
    window.addEventListener('pointerdown', bootMusic, { once: true });
    return () => window.removeEventListener('pointerdown', bootMusic);
  }, []);

  const progress = selectMissionProgress(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const advancePerm = selectCanAdvancePhase(gameState, bundle);
  const activeEventView = selectActiveEventView(gameState, bundle);
  const requiresBriefingChoice = gameState.clock.phase === 'briefing' && activeEventView?.mandatory === true;

  useEffect(() => {
    syncAmbientAudio({
      isLunarNight: progress.isLunarNight,
      weatherLevel: weather.level,
      muted: audioMuted,
    });
    syncMusicMuted(audioMuted);
  }, [progress.isLunarNight, weather.level, audioMuted]);

  useEffect(() => {
    if ((activeEventView?.priority ?? 0) >= 4) playSynthSfx('alert');
  }, [activeEventView?.event.id, activeEventView?.priority]);

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
        : activeModal === 'journal' || activeModal === 'starlog' || activeModal === 'end'
          ? 'is-focus-console'
          : '';

  const openPanel = (m: ActiveModalType) => {
    startMusic(0.28);
    if (m) {
      playSfx(m === 'comms' ? 'radioOn' : 'open', 0.55);
      playSynthSfx('click');
    }
    openModal(m);
  };

  const handlePrimaryAction = async () => {
    startMusic(0.28);
    if (requiresBriefingChoice) {
      openPanel('starlog');
      return;
    }
    if (gameState.clock.phase === 'rationing') {
      openPanel('end');
      return;
    }
    if (advancePerm.allowed) {
      playSfx('click', 0.45);
      playSynthSfx('phase-advance');
      await dispatch({ type: 'phase/advance' });
    }
  };

  return (
    <main className="hail-viewport">
      {migrationNotice && <div role="status" className="campaign-migration-notice">
        <p>{migrationNotice}</p><button type="button" className="hail-btn" onClick={dismissMigrationNotice}>{t('cockpit.understood')}</button>
      </div>}
      {/* Fail-Closed Save Recovery Banner */}
      {saveRecoveryError && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92%] p-3 rounded-xl bg-rose-950/95 border border-rose-500 text-rose-100 shadow-2xl flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <div>
              <strong>{t('cockpit.recoveryError')} [{saveRecoveryError.code}]:</strong> {saveRecoveryError.message}
            </div>
          </div>
          <button type="button" className="hail-btn" onClick={() => { try {
            const raw = localStorage.getItem(SAVE_STORAGE_KEY);
            if (raw) downloadArtifact('moon32-original-save.json', raw, true);
          } catch { /* Storage errors are already displayed by recovery. */ } }}>{t('cockpit.exportOriginal')}</button>
          <button
            type="button"
            onClick={() => resetCampaign()}
            className="hail-btn hail-btn--warn shrink-0 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('cockpit.newCampaign')}
          </button>
        </div>
      )}

      {lastError && !saveRecoveryError && (
        <div
          role="status"
          onClick={dismissError}
          className="fixed top-20 right-4 z-50 max-w-sm p-2.5 rounded-lg bg-amber-950/95 border border-amber-400/60 text-amber-100 text-xs cursor-pointer shadow-lg"
        >
          <strong>[{lastError.code}]</strong> {lastError.message} ({t('cockpit.tapToClose')})
        </div>
      )}

      <div className="hail-stage">
        <TelemetryTopBar />

        <nav className="hail-utility-controls" aria-label={t('hud.settingsAria')}>
          <button
            type="button"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            aria-label={t('hud.language')}
            title={t('hud.language')}
          >
            <Languages aria-hidden="true" />
            <span>{locale.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              toggleAudioMute();
              if (audioMuted) playSynthSfx('confirm');
            }}
            aria-label={audioMuted ? t('hud.unmuteAudio') : t('hud.muteAudio')}
            title={audioMuted ? t('hud.unmuteAudio') : t('hud.muteAudio')}
          >
            {audioMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => openPanel('tutorial')}
            aria-label={t('hud.tutorial')}
            title={t('hud.tutorial')}
          >
            <CircleHelp aria-hidden="true" />
          </button>
        </nav>

        <div
          className={`hail-camera-rig ${focusClass} ${progress.isLunarNight ? 'is-lunar-night' : ''} ${weather.level === 'storm' || weather.level === 'extreme' ? 'is-storm' : ''}`.trim()}
        >
          {/* Observation Window Backdrop */}
          <div className="hail-window-aperture" aria-hidden="true">
            <img src={HAIL_ENV.spaceDeep} alt="" className="hail-l00-space" draggable={false} />
            <img
              src={progress.isLunarNight ? HAIL_ENV.lunarNight : HAIL_ENV.lunarDay}
              alt=""
              className="hail-l01-lunar"
              draggable={false}
            />
            <AmbientCanvasLayer
              isLunarNight={progress.isLunarNight}
              weatherLevel={weather.level}
              reducedMotion={reducedMotion}
            />
          </div>

          <img src={HAIL_ENV.cockpitShell} alt={t('cockpit.shellAlt')} className="hail-l02-shell" draggable={false} />
          <div className="hail-cabin-lighting" aria-hidden="true" />

          {/* UL: Food & Aid Wall Rack */}
          <div className="hail-bay-rack hail-bay-rack--ul" aria-label={t('cockpit.foodAidRack')}>
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
                  aria-label={t('cockpit.packCount', { name: 'MRE', count: gameState.resources.mrePacks })}
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
                  aria-label={t('cockpit.medkitCount', { count: gameState.resources.medkits })}
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
                  aria-label={t('cockpit.waterAmount', { amount: gameState.resources.waterL.toFixed(0) })}
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
            aria-label={t('cockpit.openFabricator')}
          >
            <img src={fabSprite} alt="3D Fabricator" className="hail-sprite-contain" draggable={false} />
            <span className="hail-station-tag">
              3D FAB Lv{gameState.systems.fabricator.level}{' '}
              · {gameState.fabricator.activeJob ? t('cockpit.printing') : t('cockpit.ready')}
            </span>
          </button>

          {/* UR: CAPCOM & Rover Comms */}
          <button
            type="button"
            data-slot="right-wall"
            className="hail-station hail-station--wall"
            style={{ left: '81.1005%', top: '14.9841%', width: '15.9091%', height: '31.4559%' }}
            onClick={() => openPanel('comms')}
            aria-label={t('cockpit.openComms')}
          >
            <img src={HAIL_EQUIPMENT.comms} alt="CAPCOM" className="hail-sprite-contain" draggable={false} />
            <span className="hail-station-tag">
              CAPCOM · {gameState.logistics.activeOrder ? `CARGO S${gameState.logistics.activeOrder.arrivalSol}` : '80KG READY'}
            </span>
          </button>

          {/* LR: Inventory (6 Equipment) & 3 Samples */}
          <div className="hail-bay-rack hail-bay-rack--lr" aria-label={t('cockpit.inventoryRack')}>
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
                      title={`${item.label}: ${eq.owned ? `${eq.state} (${eq.durability}%)` : t('cockpit.notCrafted')}`}
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
                      title={sampleName ?? t('cockpit.sampleBay', { slot: slotIdx + 1 })}
                    >
                      <img
                        src={HAIL_INVENTORY.lunarSample}
                        alt="Sample"
                        className={`hail-rack-item ${!sampleName ? 'is-empty-slot' : ''}`}
                        draggable={false}
                      />
                      <span className="hail-rack-cell-tag">{sampleName ? t('cockpit.sampleReady') : `S${slotIdx + 1}`}</span>
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
              const visual = getHailCrewVisual(slot.crewId, member);
              const stateLabel = t(`crew.visual.${visual.state}`);
              const impaired = visual.state === 'sick' || member.condition === 'evacuated';
              return (
                <button
                  key={slot.crewId}
                  type="button"
                  onClick={() => {
                    selectCrew(slot.crewId);
                    openPanel('character');
                  }}
                  className={`hail-crew-member ${slot.depth === 'rear' ? 'is-rear' : 'is-foreground'} ${impaired ? 'is-impaired' : ''}`}
                  style={slot.style}
                  aria-label={t('cockpit.astronaut', { name: member.name, state: stateLabel })}
                >
                  <img
                    src={visual.seated}
                    alt={`${member.name} · ${stateLabel}`}
                    className="hail-crew-figure"
                    draggable={false}
                  />
                  <span className={`hail-crew-pill ${slot.depth === 'rear' ? 'is-rear-pill' : ''}`}>
                    {member.name.split(' ')[0]} · ♥{member.health} · {stateLabel.toUpperCase()}
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
            <img src={HAIL_EQUIPMENT.consoleDesk} alt={t('cockpit.consoleAlt')} className="hail-console-art" draggable={false} />
            <div className="hail-console-screens">
              <button
                type="button"
                className="hail-console-screen"
                onClick={() => openPanel('journal')}
                aria-label={t('cockpit.openJournal')}
              >
                <span className="hail-screen-code">SOL</span>
                <strong>{String(gameState.clock.sol).padStart(2, '0')}/{bundle.campaign.targetSol}</strong>
              </button>
              <button
                type="button"
                className={`hail-console-screen ${gameState.events.activeEventId || weather.level === 'storm' || weather.level === 'extreme' ? 'is-alert' : ''}`}
                onClick={() => openPanel('starlog')}
                aria-label={t('cockpit.openDecision')}
              >
                <span className="hail-screen-code">DECISION</span>
                <strong>{gameState.events.activeEventId ? t('cockpit.incident') : weather.level.toUpperCase()}</strong>
              </button>
              <button
                type="button"
                className={`hail-console-screen ${gameState.clock.phase === 'rationing' ? 'is-alert' : ''}`}
                onClick={() => openPanel('end')}
                aria-label={t('cockpit.openRationing')}
              >
                <span className="hail-screen-code">{t('cockpit.rationing')}</span>
                <strong>{gameState.clock.phase === 'rationing' ? t('cockpit.distributeMre') : t('cockpit.closeSol')}</strong>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar */}
        <footer className="hail-action-band">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => openPanel('journal')}>
              <img src={HAIL_SVG.frameCorner} alt="" />
              <span>{t('hud.journal')}</span>
            </button>
            <button type="button" onClick={() => openPanel('starlog')}>
              <img src={HAIL_SVG.sysComms} alt="" />
              <span>{t('hud.briefing')}{gameState.events.activeEventId ? ' (!)' : ''}</span>
            </button>
            <button type="button" onClick={() => setSysModalOpen()}>
              <img src={HAIL_SVG.sysPower} alt="" />
              <span>{t('hud.systems')}</span>
            </button>
            <button type="button" onClick={() => openPanel('crafting')}>
              <img src={HAIL_SVG.resParts} alt="" />
              <span>{t('hud.fabricator')}</span>
            </button>
            <button type="button" onClick={() => openPanel('character')}>
              <img src={HAIL_SVG.sysMed} alt="" />
              <span>{t('hud.crew')}</span>
            </button>
            <button type="button" onClick={() => openPanel('comms')}>
              <img src={HAIL_SVG.sysComms} alt="" />
              <span>{t('hud.comms')}</span>
            </button>
            <button type="button" onClick={() => openPanel('expedition')}>
              <img src={HAIL_SVG.sysRobot} alt="" />
              <span>{t('hud.rover')}</span>
            </button>
            <button type="button" onClick={() => openPanel('launch')}>
              <img src={HAIL_SVG.badgeNasaStem} alt="" />
              <span>{t('hud.campaign')}</span>
            </button>
          </div>

          <div className="hail-action-band-right">
            <span className="hail-phase-hint">
              {advancePerm.allowed ? t('hud.readyAdvance') : advancePerm.message}
            </span>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="is-primary"
            >
              <img src={HAIL_SVG.actExplore} alt="" />
              <span>
                {requiresBriefingChoice
                  ? t('hud.handleEvent')
                  : gameState.clock.phase === 'rationing'
                    ? t('hud.endSol')
                    : t('hud.nextPhase')}
              </span>
            </button>
          </div>
        </footer>
      </div>

      {/* Modals */}
      {gameState.campaign.status === 'active' && (
        <EventPriorityBanner
          view={activeEventView}
          currentSol={gameState.clock.sol}
          onOpen={() => openPanel('starlog')}
        />
      )}
      {activeModal === 'journal' && (
        <JournalModal
          onClose={closeModal}
          onOpenDecision={() => openPanel('starlog')}
          onOpenPanel={(panel) => openPanel(panel)}
        />
      )}
      {activeModal === 'starlog' && (
        <StarlogModal onClose={closeModal} onOpenJournal={() => openPanel('journal')} />
      )}
      {activeModal === 'character' && <CharacterSheetModal onClose={closeModal} />}
      {activeModal === 'crafting' && <CraftingModal onClose={closeModal} />}
      {activeModal === 'expedition' && <ExpeditionModal onClose={closeModal} />}
      {activeModal === 'comms' && <CommsLogisticsModal onClose={closeModal} />}
      {activeModal === 'end' && (
        <EndOfDayModal
          onClose={closeModal}
          onStarlog={() => openPanel('starlog')}
          onComms={() => openPanel('comms')}
        />
      )}
      {activeModal === 'launch' && <MissionLaunchModal onClose={closeModal} />}
      {activeModal === 'tutorial' && <TutorialModal onClose={closeModal} />}
      {sysModalOpen && (
        <MissionDialog
          title={t('systems.dialogTitle')}
          eyebrow={t('systems.dialogEyebrow')}
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
