import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Download,
  Info,
  Languages,
  Play,
  RefreshCw,
  Rocket,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { startMusic, syncMusicMuted } from '../../audio/sfx.ts';
import { playSfx as playSynthSfx } from '../../audio/soundEngine.ts';
import { RELEASE_META } from '../../config/releaseMeta.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import {
  clearIntroSessionScene,
  INTRO_SCENES,
  readIntroSessionScene,
  type IntroSessionState,
} from '../../onboarding/introScenes.ts';
import { TOUR_TARGET_IDS } from '../../onboarding/targets.ts';
import { downloadArtifact } from '../../persistence/downloadArtifact.ts';
import { SAVE_STORAGE_KEY } from '../../persistence/saveAdapter.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { HAIL_ENV, HAIL_SVG } from '../cabin/hailAssets.ts';

const STAR_COLORS = ['#ffffff', '#cfe8ff', '#fff1c9', '#9ff3e4'];

// Deterministic pseudo-random so the starfield is stable between renders.
const TITLE_STARS = (() => {
  let seed = 20501;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 110 }, () => ({
    x: rnd() * 100,
    y: rnd() * 78,
    size: rnd() < 0.12 ? 3 : rnd() < 0.5 ? 2 : 1.5,
    delay: rnd() * 6,
    dur: 2.5 + rnd() * 4,
    color: STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)],
  }));
})();

function formatSavedTime(iso: string | null, locale: 'vi' | 'en'): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export function TitleScreen() {
  const {
    bundle,
    gameState,
    hasSavedCampaign,
    lastSavedAt,
    saveRecoveryError,
    migrationNotice,
    dismissMigrationNotice,
    clearCorruptedSaveForNewMission,
  } = useGameStore();

  const {
    locale,
    setLocale,
    audioMuted,
    toggleAudioMute,
    reducedMotion,
    setReducedMotion,
    onboarding,
    onboardingNoticeCode,
    dismissOnboardingNotice,
    openIntro,
    openModal,
    enterCockpit,
  } = useUiStore();

  const { t, localize, pickText } = useI18n();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [introSession, setIntroSession] = useState<IntroSessionState | null>(() =>
    readIntroSessionScene()
  );
  const newMissionBtnRef = useRef<HTMLButtonElement>(null);
  const cancelOverwriteBtnRef = useRef<HTMLButtonElement>(null);
  const focusRestoreRafRef = useRef<number | null>(null);

  const closeOverwritePrompt = useCallback((restoreFocus: boolean) => {
    setConfirmOverwrite(false);
    if (!restoreFocus) return;
    if (focusRestoreRafRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreRafRef.current);
    }
    focusRestoreRafRef.current = window.requestAnimationFrame(() => {
      focusRestoreRafRef.current = null;
      if (newMissionBtnRef.current?.isConnected) {
        newMissionBtnRef.current.focus();
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (focusRestoreRafRef.current !== null) {
        window.cancelAnimationFrame(focusRestoreRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!confirmOverwrite) return;
    const raf = window.requestAnimationFrame(() => {
      cancelOverwriteBtnRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverwritePrompt(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmOverwrite, closeOverwritePrompt]);

  const canContinue = hasSavedCampaign && !saveRecoveryError;
  const difficultyMeta = bundle.campaign.difficultyProfiles[gameState.campaign.difficulty];
  const difficultyLabel = difficultyMeta
    ? pickText(difficultyMeta.label, difficultyMeta.labelEn)
    : gameState.campaign.difficulty;
  const phaseLabel = t(`phase.${gameState.clock.phase}`);
  const formattedSavedAt = formatSavedTime(lastSavedAt, locale);

  const triggerUserAudio = () => {
    syncMusicMuted(audioMuted);
    if (!audioMuted) {
      startMusic(0.28);
    }
  };

  const handleContinueMission = () => {
    if (!canContinue) return;
    triggerUserAudio();
    playSynthSfx('confirm');
    enterCockpit();
  };

  const proceedToNewMission = () => {
    setConfirmOverwrite(false);
    triggerUserAudio();
    playSynthSfx('click');
    if (onboarding.introStatus === 'unseen') {
      openIntro('first-run', 'title', 0);
    } else {
      clearIntroSessionScene();
      setIntroSession(null);
      openModal('launch');
    }
  };

  const handleNewMissionClick = () => {
    playSynthSfx('click');
    if (canContinue) {
      setConfirmOverwrite(true);
      return;
    }
    proceedToNewMission();
  };

  const handleExportCorruptedSave = () => {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (raw) {
        downloadArtifact('moon32-original-save.json', raw, true);
      }
    } catch {
      // Ignore restricted storage environments safely.
    }
  };

  const handleRecoverToSetup = () => {
    playSynthSfx('click');
    clearCorruptedSaveForNewMission();
    openModal('launch');
  };

  const handleResumeIntroSession = () => {
    if (!introSession) return;
    triggerUserAudio();
    playSynthSfx('click');
    openIntro(introSession.mode, introSession.returnScreen, introSession.sceneIndex);
  };

  const handleRestartIntro = () => {
    triggerUserAudio();
    playSynthSfx('click');
    openIntro('first-run', 'title', 0);
  };

  const handleDismissIntroSession = () => {
    clearIntroSessionScene();
    setIntroSession(null);
  };

  return (
    <main className={`phf-title-shell ${reducedMotion ? 'is-reduced-motion' : ''}`}>
      <div className="phf-title-backdrop" aria-hidden="true">
        <div className="phf-sky-aurora" />
        <div className="phf-stars">
          {TITLE_STARS.map((s, i) => (
            <i
              key={i}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.dur}s`,
                background: s.color,
              }}
            />
          ))}
        </div>
        <span className="phf-shooting phf-shooting--1" />
        <span className="phf-shooting phf-shooting--2" />
        <span className="phf-shooting phf-shooting--3" />
        <div className="phf-moon-wrap">
          <div className="phf-moon-glow" />
          <img src={HAIL_ENV.titleMoon} alt="" className="phf-moon" draggable={false} />
        </div>
        <img src={HAIL_ENV.titleEarth} alt="" className="phf-earth" draggable={false} />
        <div className="phf-dust phf-dust--1" />
        <div className="phf-dust phf-dust--2" />
        <img src={HAIL_ENV.lunarNight} alt="" className="phf-horizon" draggable={false} />
        <div className="phf-horizon-fade" />
        <div className="phf-vignette" />
      </div>

      <div className="phf-title-container">
        <header className="phf-title-header">
          <div className="phf-title-brand">
            <img
              src={HAIL_SVG.badgeNasaStem}
              alt=""
              aria-hidden="true"
              className="phf-title-badge"
            />
            <div>
              <p className="phf-title-eyebrow">{t('title.eyebrow')}</p>
              <h1 className="phf-title-heading">PROJECT HUMAN FRONTIER</h1>
            </div>
          </div>
          <span className="phf-title-version font-mono">{RELEASE_META.releaseVersion}</span>
        </header>

        <p className="phf-title-subtitle">{t('title.subtitle')}</p>

        {/* Migration / Onboarding Notice */}
        {migrationNotice && (
          <div role="status" className="phf-title-notice">
            <span>{localize(migrationNotice, bundle)}</span>
            <button type="button" className="hail-btn text-xs" onClick={dismissMigrationNotice}>
              {t('title.dismissNotice')}
            </button>
          </div>
        )}
        {onboardingNoticeCode && (
          <div role="status" className="phf-title-notice">
            <span>
              {onboardingNoticeCode === 'E_ONBOARDING_CORRUPT'
                ? t('onboarding.notice.corrupt')
                : t('onboarding.notice.version')}
            </span>
            <button type="button" className="hail-btn text-xs" onClick={dismissOnboardingNotice}>
              {t('title.dismissNotice')}
            </button>
          </div>
        )}

        {/* Fail-Closed Save Recovery Gate */}
        {saveRecoveryError && (
          <section role="alert" className="phf-recovery-card">
            <div className="phf-recovery-header">
              <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0" aria-hidden="true" />
              <div>
                <h2>{t('recovery.heading')}</h2>
                <p className="text-xs text-rose-100/90 mt-1">
                  <strong>[{saveRecoveryError.code}]</strong>{' '}
                  {localize(saveRecoveryError.message, bundle)}
                </p>
                <p className="text-xs text-rose-200/80 mt-1">{t('recovery.hint')}</p>
              </div>
            </div>
            <div className="phf-recovery-actions">
              <button
                type="button"
                className="hail-btn text-xs flex items-center gap-1.5"
                onClick={handleExportCorruptedSave}
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                {t('cockpit.exportOriginal')}
              </button>
              <button
                type="button"
                className="hail-btn hail-btn--warn text-xs flex items-center gap-1.5"
                onClick={handleRecoverToSetup}
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                {t('recovery.clearAndNew')}
              </button>
            </div>
          </section>
        )}

        {/* Reload mid-Intro resume bar (gesture-gated, zero auto-play) */}
        {introSession && !saveRecoveryError && (
          <section role="status" className="phf-intro-resume-bar">
            <span className="text-xs text-cyan-100">
              {t('title.introResumeBanner', {
                scene: introSession.sceneIndex + 1,
                total: INTRO_SCENES.length,
              })}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="hail-btn hail-btn--accent text-xs"
                onClick={handleResumeIntroSession}
              >
                {t('title.introResumeBtn', { scene: introSession.sceneIndex + 1 })}
              </button>
              <button
                type="button"
                className="hail-btn text-xs"
                onClick={handleRestartIntro}
              >
                {t('title.introRestartBtn')}
              </button>
              <button
                type="button"
                className="hail-btn text-xs"
                onClick={handleDismissIntroSession}
              >
                {t('title.dismissNotice')}
              </button>
            </div>
          </section>
        )}

        {/* Primary Menu Actions */}
        <section className="phf-title-menu" aria-label="Mission Menu">
          <button
            type="button"
            className={`phf-title-btn ${canContinue ? 'is-primary' : 'is-disabled'}`}
            disabled={!canContinue}
            data-tour={TOUR_TARGET_IDS.TITLE_CONTINUE}
            onClick={handleContinueMission}
          >
            <div className="phf-title-btn-main">
              <Play className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{t('title.continueMission')}</span>
            </div>
            <span className="phf-title-btn-meta">
              {canContinue
                ? `${t('title.continueSummary', {
                    sol: String(gameState.clock.sol).padStart(2, '0'),
                    targetSol: bundle.campaign.targetSol,
                    phase: phaseLabel,
                    difficulty: difficultyLabel,
                  })}${formattedSavedAt ? ` · ${t('title.savedAt', { time: formattedSavedAt })}` : ''}`
                : t('title.noSaveHint')}
            </span>
          </button>

          <button
            ref={newMissionBtnRef}
            type="button"
            className={`phf-title-btn ${!canContinue && !saveRecoveryError ? 'is-primary' : ''}`}
            data-tour={TOUR_TARGET_IDS.TITLE_NEW_MISSION}
            onClick={handleNewMissionClick}
          >
            <div className="phf-title-btn-main">
              <Rocket className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{t('title.newMission')}</span>
            </div>
          </button>

          {/* Overwrite Confirmation Prompt */}
          {confirmOverwrite && (
            <div role="alertdialog" aria-labelledby="phf-overwrite-title" className="phf-overwrite-box">
              <h2 id="phf-overwrite-title" className="text-sm font-bold text-amber-200">
                {t('title.overwriteTitle')}
              </h2>
              <p className="text-xs text-slate-200 mt-1">
                {t('title.overwriteBody', {
                  sol: String(gameState.clock.sol).padStart(2, '0'),
                  targetSol: bundle.campaign.targetSol,
                })}
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <button
                  type="button"
                  className="hail-btn hail-btn--warn text-xs"
                  onClick={proceedToNewMission}
                >
                  {t('title.confirmOverwrite')}
                </button>
                <button
                  ref={cancelOverwriteBtnRef}
                  type="button"
                  className="hail-btn text-xs"
                  onClick={() => closeOverwritePrompt(true)}
                >
                  {t('title.cancelOverwrite')}
                </button>
              </div>
            </div>
          )}

          <div className="phf-title-secondary-grid">
            <button
              type="button"
              className="phf-title-subbtn"
              data-tour={TOUR_TARGET_IDS.TITLE_HOW_TO_PLAY}
              onClick={() => {
                playSynthSfx('click');
                openModal('tutorial');
              }}
            >
              <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('title.howToPlay')}</span>
            </button>

            <button
              type="button"
              className="phf-title-subbtn"
              onClick={() => {
                playSynthSfx('click');
                openModal('about');
              }}
            >
              <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('title.credits')}</span>
            </button>
          </div>
        </section>

        {/* Quick Accessibility & Audio Settings */}
        <section className="phf-title-settings" aria-label={t('title.settingsHeading')}>
          <span className="phf-title-settings-label">{t('title.settingsHeading')}</span>
          <div className="phf-title-settings-row">
            <button
              type="button"
              className="hail-btn text-xs flex items-center gap-1.5"
              onClick={() => {
                playSynthSfx('click');
                setLocale(locale === 'vi' ? 'en' : 'vi');
              }}
              aria-label={t('hud.language')}
            >
              <Languages className="w-4 h-4" aria-hidden="true" />
              <span>{locale === 'vi' ? 'VI / EN · Tiếng Việt' : 'EN / VI · English'}</span>
            </button>

            <button
              type="button"
              className="hail-btn text-xs flex items-center gap-1.5"
              aria-pressed={audioMuted}
              onClick={() => {
                const nextMuted = !audioMuted;
                toggleAudioMute();
                syncMusicMuted(nextMuted);
                if (!nextMuted) {
                  playSynthSfx('confirm');
                }
              }}
            >
              {audioMuted ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{audioMuted ? t('title.audioMuted') : t('title.audioOn')}</span>
            </button>

            <button
              type="button"
              className="hail-btn text-xs flex items-center gap-1.5"
              aria-pressed={reducedMotion}
              onClick={() => {
                playSynthSfx('click');
                setReducedMotion(!reducedMotion);
              }}
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{reducedMotion ? t('title.reducedMotionOn') : t('title.reducedMotionOff')}</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
