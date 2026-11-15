import { useState } from 'react';
import { playSfx } from '../../audio/sfx.ts';
import {
  selectAvailableCrew,
  selectCanAdvancePhase,
  selectRoverStatus,
  selectWeatherOutlook,
} from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { CrewId, SystemId } from '../../types/index.ts';
import { getHailCrewVisual, HAIL_SVG, HAIL_TACTILE_UI } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';
import { useI18n } from '../../i18n/useI18n.ts';
import { localizeEnumLabel } from '../../i18n/domainText.ts';

export type JournalTabId = 'log' | 'crew' | 'systems' | 'cargo';

const JOURNAL_TABS: ReadonlyArray<{
  id: JournalTabId;
  code: string;
  titleKey: string;
  icon: string;
  top: string;
}> = [
  { id: 'log', code: 'TAB 01 // LOG', titleKey: 'journal.tab.log.title', icon: HAIL_SVG.sysComms, top: '18.95%' },
  { id: 'crew', code: 'TAB 02 // CREW', titleKey: 'journal.tab.crew.title', icon: HAIL_SVG.sysMed, top: '34.76%' },
  { id: 'systems', code: 'TAB 03 // ECLSS', titleKey: 'journal.tab.systems.title', icon: HAIL_SVG.sysPower, top: '50.65%' },
  { id: 'cargo', code: 'TAB 04 // CARGO', titleKey: 'journal.tab.cargo.title', icon: HAIL_SVG.sysRobot, top: '66.53%' },
];

const CREW_IDS: readonly CrewId[] = ['cmd', 'eng', 'doc', 'geo'];
const SYSTEM_IDS: readonly SystemId[] = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'];

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
  const { t, locale, pickText, localize } = useI18n();
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

  const activeTabMeta = JOURNAL_TABS.find((item) => item.id === tab) ?? JOURNAL_TABS[0];
  const selectedCrewId = CREW_IDS[crewIdx] ?? 'cmd';
  const selectedCrew = gameState.crew[selectedCrewId];
  const rationCut =
    gameState.clock.phase === 'rationing' &&
    !gameState.dailyPlan.mreTargets.includes(selectedCrewId);
  const selectedCrewVisual = selectedCrew
    ? getHailCrewVisual(selectedCrewId, selectedCrew, rationCut, locale)
    : null;

  const selectedSysId = SYSTEM_IDS[sysIdx] ?? 'solar';
  const selectedSys = gameState.systems[selectedSysId];
  const pendingEvent = gameState.events.activeEventId
    ? bundle.events.find((e) => e.id === gameState.events.activeEventId) ?? null
    : null;

  const repairCost = bundle.balance.systems.repairPartsCost;
  const pendingUpgrades = Object.values(gameState.crew).filter(
    (crew) => crew.condition !== 'evacuated'
      && crew.assignedTask?.type === 'upgrade-system'
      && crew.assignedTask.targetSystemId === selectedSysId
  ).length;
  const targetLvl = selectedSys.level + pendingUpgrades < bundle.balance.systems.maxLevel
    ? (String(selectedSys.level + pendingUpgrades + 1) as '2' | '3')
    : null;
  const baseUpCost = targetLvl ? bundle.balance.systems.upgradePartsByTargetLevel[targetLvl] : 0;

  const findFitWorker = () =>
    availableCrew.find((c) => c.id === 'eng' && c.condition === 'fit') ??
    availableCrew.find((c) => c.condition === 'fit');

  const handleSystemTask = async (task: 'repair-system' | 'upgrade-system') => {
    const worker = findFitWorker();
    if (!worker) {
      setStatusNote(t('journal.noFitWorker'));
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
      setStatusNote(res.effects[0]?.message ?? t('journal.assignedOk'));
    } else {
      setStatusNote(res.error.message);
    }
  };

  const handleAdvancePhase = async () => {
    const res = await dispatch({ type: 'phase/advance' });
    if (res.ok) {
      playSfx('click', 0.45);
      setStatusNote(res.effects[0]?.message ?? t('journal.advancedOk'));
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

  const phaseLabel = t(`phase.${gameState.clock.phase}`);

  return (
    <MissionDialog
      title={t('journal.title')}
      eyebrow="STATION JOURNAL"
      panelType="journal"
      tactileFrame
      onClose={onClose}
    >
      <section className="hail-tactile-frame hail-tactile-frame--journal" aria-label={t('journal.aria')}>
        <img
          src={HAIL_TACTILE_UI.journalFrame}
          alt=""
          className="hail-tactile-bg"
          draggable={false}
        />

        {/* Left Bezel 4 Square Lit Tab Buttons */}
        {JOURNAL_TABS.map((item) => {
          const active = item.id === tab;
          const tabTitle = t(item.titleKey);
          return (
            <button
              key={item.id}
              type="button"
              className={`hail-jnl-tab-btn ${active ? 'is-active' : ''}`}
              style={{ top: item.top }}
              aria-pressed={active}
              aria-label={tabTitle}
              title={tabTitle}
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
              <h2 className="hail-term-title">{t(activeTabMeta.titleKey)}</h2>
            </div>

            <span className="hail-term-sol">
              SOL {String(gameState.clock.sol).padStart(2, '0')}/{gameState.campaign.targetSol} //{' '}
              {tab === 'log'
                ? t('journal.pageCounter', { current: safePage + 1, total: totalLogPages })
                : tab === 'crew'
                  ? t('journal.crewCounter', { current: crewIdx + 1, total: CREW_IDS.length })
                  : tab === 'systems'
                    ? t('journal.sysCounter', { current: sysIdx + 1, total: SYSTEM_IDS.length })
                    : `DONKI ${t(`donki.${weather.level}`)}`}
            </span>
          </header>

          <div className="hail-term-body">
            {statusNote && (
              <p className="hail-term-plain-line is-ok">{t('journal.systemPrefix', { note: localize(statusNote, bundle) })}</p>
            )}

            {tab === 'log' && (
              <div className="hail-term-text-flow">
                <p className="hail-term-plain-line">
                  {t('journal.logStatusLine', {
                    phase: phaseLabel,
                    level: t(`donki.${weather.level}`),
                    pct: Math.round(weather.repairSuccessProb * 100),
                  })}
                </p>

                {pendingEvent && (
                  <p className="hail-term-plain-line is-warn">
                    {t('journal.incidentPrefix', { title: pickText(pendingEvent.title, pendingEvent.titleEn) })}{' '}
                    <button
                      type="button"
                      className="hail-term-text-link"
                      onClick={() => {
                        playSfx('click', 0.45);
                        onOpenDecision();
                      }}
                    >
                      {t('journal.openDecisionCmd')}
                    </button>
                  </p>
                )}

                <ol className="hail-term-lines">
                  {pageLogs.length === 0 ? (
                    <li>
                      <span className="hail-term-prompt">&gt;</span>
                      <span>{t('journal.emptyLogs')}</span>
                    </li>
                  ) : (
                    pageLogs.map((entry, idx) => (
                      <li key={`${safePage}-${idx}`}>
                        <span className="hail-term-prompt">&gt;</span>
                        <span>
                          [Sol {entry.sol} · {entry.phase}] {localize(entry.message, bundle)}
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
                          {t('journal.crewLine', {
                            num: `0${idx + 1}`,
                            name: member.name,
                            health: Math.round(member.health),
                            hunger: localizeEnumLabel('hunger', member.hungerState, locale),
                            satiety: member.satiety,
                            condition: localizeEnumLabel('condition', member.condition, locale),
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <div className="hail-term-detail-lines">
                  <p>
                    &gt; {t('journal.crewProfile')} <strong>{selectedCrew.name}</strong> ({selectedCrewVisual?.role ?? selectedCrew.roleTag})
                  </p>
                  <p>
                    {t('journal.crewSpecialty', {
                      specialty: selectedCrewVisual?.specialty ?? t('journal.defaultSpecialty'),
                    })}
                  </p>
                  <p>
                    {t('journal.crewVitals', {
                      health: selectedCrew.health,
                      morale: selectedCrew.morale,
                      satiety: selectedCrew.satiety,
                      rad: selectedCrew.radiationMgy.toFixed(1),
                      task: selectedCrew.assignedTask ? selectedCrew.assignedTask.type : t('journal.taskIdle'),
                    })}
                  </p>
                </div>
              </div>
            )}

            {tab === 'systems' && (
              <div className="hail-term-text-flow">
                <p className="hail-term-plain-line">
                  {t('journal.partsLine', {
                    parts: gameState.resources.partsKg.toFixed(1),
                    phase: phaseLabel,
                  })}
                  {gameState.clock.phase === 'briefing' && advancePerm.allowed && (
                    <>
                      {' — '}
                      <button type="button" className="hail-term-text-link" onClick={handleAdvancePhase}>
                        {t('journal.advanceEngCmd')}
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
                          {t('journal.sysLine', {
                            name: t(`system.${sysId}`),
                            level: sys.level,
                            pct: Math.round(sys.integrity * 100),
                          })}
                          {sys.status === 'offline' ? ' [OFFLINE]' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <p className="hail-term-plain-line">
                  {t('journal.cmdLine', { name: t(`system.${selectedSysId}`) })}{' '}
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
                    {t('journal.repairCmd', { cost: repairCost })}
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
                        {t('journal.upgradeCmd', { level: targetLvl, cost: baseUpCost })}
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
                      {t('journal.cargoO2Water', {
                        oxygen: gameState.resources.oxygenKg.toFixed(1),
                        water: gameState.resources.waterL.toFixed(1),
                        grey: gameState.resources.wasteWaterL.toFixed(1),
                      })}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {t('journal.cargoStock', {
                        mre: gameState.resources.mrePacks,
                        medkit: gameState.resources.medkits,
                        parts: gameState.resources.partsKg.toFixed(1),
                        battery: gameState.resources.batteryKWh.toFixed(1),
                      })}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {t('journal.cargoRover', {
                        status: localizeEnumLabel('roverStatus', roverStatus, locale),
                        radio: waitingRadioCount,
                      })}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {t('journal.cargoSupplyLabel')}{' '}
                      {gameState.logistics.activeOrder
                        ? t('journal.cargoInFlight', { sol: gameState.logistics.activeOrder.arrivalSol })
                        : gameState.logistics.padCooldownSols > 0
                          ? t('journal.cargoCooldown', { sols: gameState.logistics.padCooldownSols })
                          : t('journal.cargoReady')}
                    </span>
                  </li>
                  <li>
                    <span className="hail-term-prompt">&gt;</span>
                    <span>
                      {t('journal.cargoNavLabel')}{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('comms')}
                      >
                        {t('journal.navCommsCmd')}
                      </button>{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('expedition')}
                      >
                        {t('journal.navRoverCmd')}
                      </button>{' '}
                      <button
                        type="button"
                        className="hail-term-text-link"
                        onClick={() => onOpenPanel('launch')}
                      >
                        {t('journal.navLaunchCmd')}
                      </button>
                    </span>
                  </li>
                </ol>
              </div>
            )}
          </div>

          {(tab === 'log' || tab === 'crew' || tab === 'systems') && (
            <footer className="hail-jnl-bottombar">
              <span className="hail-term-meta-line">{t('journal.arrowHint')}</span>
              <div className="hail-keycap-pair">
                <button
                  type="button"
                  className="hail-keycap-btn"
                  aria-label={t('journal.prevAria')}
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
                  aria-label={t('journal.nextAria')}
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
