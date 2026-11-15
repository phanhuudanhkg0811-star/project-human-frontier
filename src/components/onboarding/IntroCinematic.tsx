import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FastForward, Pause, Play } from 'lucide-react';
import { startMusic, syncMusicMuted } from '../../audio/sfx.ts';
import { playSfx as playSynthSfx } from '../../audio/soundEngine.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import {
  clampIntroSceneIndex,
  INTRO_SCENES,
  type IntroVisualKey,
} from '../../onboarding/introScenes.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { HAIL_CREW_VISUALS, HAIL_ENV, HAIL_EQUIPMENT, HAIL_INVENTORY, HAIL_ROVER, HAIL_SVG } from '../cabin/hailAssets.ts';
import { SafeImage } from '../common/SafeImage.tsx';

function getScenePreloadUrls(): string[] {
  return [
    HAIL_ENV.spaceDeep,
    HAIL_ENV.lunarDay,
    HAIL_ENV.cockpitShell,
    HAIL_EQUIPMENT.fabricatorIdle,
    HAIL_INVENTORY.oxygenCell,
    HAIL_INVENTORY.waterPack,
    HAIL_INVENTORY.mrePack,
    HAIL_ROVER.active,
    HAIL_ENV.lunarCrater,
    HAIL_ENV.lunarPsr,
    HAIL_ENV.lunarNight,
    HAIL_EQUIPMENT.consoleDesk,
    HAIL_CREW_VISUALS.cmd.portrait,
    HAIL_CREW_VISUALS.eng.portrait,
    HAIL_CREW_VISUALS.doc.portrait,
    HAIL_CREW_VISUALS.geo.portrait,
  ];
}

function IntroSceneArtwork({ visualKey }: { visualKey: IntroVisualKey }) {
  switch (visualKey) {
    case 'outpost':
      return (
        <div className="phf-intro-art-frame">
          <SafeImage src={HAIL_ENV.spaceDeep} alt="" className="phf-intro-art-bg" draggable={false} />
          <SafeImage src={HAIL_ENV.lunarDay} alt="" className="phf-intro-art-mid" draggable={false} />
        </div>
      );
    case 'crew':
      return (
        <div className="phf-intro-art-frame">
          <SafeImage src={HAIL_ENV.cockpitShell} alt="" className="phf-intro-art-bg" draggable={false} />
          <div className="phf-intro-crew-strip">
            <SafeImage src={HAIL_CREW_VISUALS.cmd.portrait} alt="" className="phf-intro-portrait" draggable={false} />
            <SafeImage src={HAIL_CREW_VISUALS.eng.portrait} alt="" className="phf-intro-portrait" draggable={false} />
            <SafeImage src={HAIL_CREW_VISUALS.doc.portrait} alt="" className="phf-intro-portrait" draggable={false} />
            <SafeImage src={HAIL_CREW_VISUALS.geo.portrait} alt="" className="phf-intro-portrait" draggable={false} />
          </div>
        </div>
      );
    case 'resources':
      return (
        <div className="phf-intro-art-frame">
          <SafeImage src={HAIL_ENV.cockpitShell} alt="" className="phf-intro-art-bg" draggable={false} />
          <div className="phf-intro-resource-strip">
            <SafeImage src={HAIL_EQUIPMENT.fabricatorIdle} alt="" className="phf-intro-equip" draggable={false} />
            <SafeImage src={HAIL_INVENTORY.oxygenCell} alt="" className="phf-intro-item" draggable={false} />
            <SafeImage src={HAIL_INVENTORY.waterPack} alt="" className="phf-intro-item" draggable={false} />
            <SafeImage src={HAIL_INVENTORY.mrePack} alt="" className="phf-intro-item" draggable={false} />
          </div>
        </div>
      );
    case 'rover':
      return (
        <div className="phf-intro-art-frame">
          <SafeImage src={HAIL_ENV.lunarCrater} alt="" className="phf-intro-art-bg" draggable={false} />
          <SafeImage src={HAIL_ENV.lunarPsr} alt="" className="phf-intro-art-inset" draggable={false} />
          <SafeImage src={HAIL_ROVER.active} alt="" className="phf-intro-rover-sprite" draggable={false} />
        </div>
      );
    case 'night':
      return (
        <div className="phf-intro-art-frame is-lunar-night">
          <SafeImage src={HAIL_ENV.spaceDeep} alt="" className="phf-intro-art-bg" draggable={false} />
          <SafeImage src={HAIL_ENV.lunarNight} alt="" className="phf-intro-art-mid" draggable={false} />
          <SafeImage src={HAIL_EQUIPMENT.consoleDesk} alt="" className="phf-intro-console" draggable={false} />
        </div>
      );
    case 'command':
      return (
        <div className="phf-intro-art-frame">
          <SafeImage src={HAIL_ENV.cockpitShell} alt="" className="phf-intro-art-bg" draggable={false} />
          <img src={HAIL_SVG.badgeNasaStem} alt="" className="phf-intro-badge" draggable={false} />
        </div>
      );
  }
}

export function IntroCinematic() {
  const introSceneIndex = useUiStore((s) => s.introSceneIndex);
  const introMode = useUiStore((s) => s.introMode);
  const audioMuted = useUiStore((s) => s.audioMuted);
  const reducedMotionSetting = useUiStore((s) => s.reducedMotion);
  const setIntroSceneIndex = useUiStore((s) => s.setIntroSceneIndex);
  const finishIntroToSetup = useUiStore((s) => s.finishIntroToSetup);
  const { t } = useI18n();

  const [isPaused, setIsPaused] = useState(false);
  const [osReducedMotion, setOsReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const isReducedMotion = reducedMotionSetting || osReducedMotion;
  const safeIndex = clampIntroSceneIndex(introSceneIndex);
  const scene = INTRO_SCENES[safeIndex];
  const totalScenes = INTRO_SCENES.length;
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === totalScenes - 1;

  // Listen to OS prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setOsReducedMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Lazy-preload intro scene assets after entering intro (never blocking Title FCP)
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const src of getScenePreloadUrls()) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  // Keep music synced with mute preference after user gesture into Intro
  useEffect(() => {
    syncMusicMuted(audioMuted);
    if (!audioMuted) {
      startMusic(0.28);
    }
  }, [audioMuted]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    playSynthSfx('click');
    setIntroSceneIndex(safeIndex - 1);
  }, [isFirst, safeIndex, setIntroSceneIndex]);

  const handleNext = useCallback(() => {
    playSynthSfx(isLast ? 'confirm' : 'click');
    if (isLast) {
      finishIntroToSetup('completed');
      return;
    }
    setIntroSceneIndex(safeIndex + 1);
  }, [isLast, safeIndex, setIntroSceneIndex, finishIntroToSetup]);

  const handleSkip = useCallback(() => {
    playSynthSfx('click');
    finishIntroToSetup('skipped');
  }, [finishIntroToSetup]);

  // Timed auto-advance within 60-90s budget unless paused
  useEffect(() => {
    if (isPaused) return;
    const timer = window.setTimeout(() => {
      if (isLast) {
        finishIntroToSetup('completed');
      } else {
        setIntroSceneIndex(safeIndex + 1);
      }
    }, scene.durationSec * 1000);
    return () => window.clearTimeout(timer);
  }, [isPaused, isLast, safeIndex, scene.durationSec, setIntroSceneIndex, finishIntroToSetup]);

  // Safe keyboard navigation (Escape -> Skip, Left/Right -> Back/Next)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleSkip();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNext();
      } else if (event.key === 'ArrowLeft' && !isFirst) {
        event.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSkip, handleNext, handleBack, isFirst]);

  return (
    <main className={`phf-intro-viewport ${isReducedMotion ? 'is-reduced-motion' : ''}`}>
      <section
        role="region"
        aria-label={t('intro.regionLabel')}
        className="phf-intro-stage"
      >
        {/* 1. Screen-reader ordered Progress Header */}
        <header className="phf-intro-progress-bar">
          <div className="phf-intro-step-row">
            <span className="phf-intro-step-badge font-mono">
              {t('intro.stepProgress', { current: safeIndex + 1, total: totalScenes })}
            </span>
            <span className="phf-intro-duration font-mono">
              {t('intro.timerSeconds', { seconds: scene.durationSec })}
            </span>
            {isPaused && (
              <span className="phf-intro-paused-pill font-mono">{t('intro.pausedBadge')}</span>
            )}
          </div>
          <div className="phf-intro-dots" aria-hidden="true">
            {INTRO_SCENES.map((item, idx) => (
              <span
                key={item.id}
                className={`phf-intro-dot ${idx === safeIndex ? 'is-active' : idx < safeIndex ? 'is-done' : ''}`}
              />
            ))}
          </div>
        </header>

        {/* 2. Title & Caption Copy (Always visible even when audio is muted) */}
        <article className="phf-intro-copy" key={scene.id}>
          <h2 className="phf-intro-heading">{t(scene.titleKey)}</h2>
          <p className="phf-intro-body">{t(scene.bodyKey)}</p>
          {audioMuted && <p className="phf-intro-muted-note">{t('intro.mutedNote')}</p>}
        </article>

        {/* 3. Playback Controls (Back / Pause / Next / Skip) */}
        <div className="phf-intro-controls">
          <div className="phf-intro-controls-left">
            <button
              type="button"
              className="hail-btn phf-intro-btn"
              disabled={isFirst}
              onClick={handleBack}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span>{t('intro.back')}</span>
            </button>

            <button
              type="button"
              className="hail-btn phf-intro-btn"
              aria-pressed={isPaused}
              onClick={() => {
                playSynthSfx('click');
                setIsPaused((prev) => !prev);
              }}
            >
              {isPaused ? (
                <Play className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Pause className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{isPaused ? t('intro.resume') : t('intro.pause')}</span>
            </button>

            <button
              type="button"
              className="hail-btn hail-btn--accent phf-intro-btn"
              onClick={handleNext}
            >
              <span>
                {isLast
                  ? introMode === 'first-run'
                    ? t('intro.toSetup')
                    : t('intro.finishReplay')
                  : t('intro.next')}
              </span>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="hail-btn phf-intro-btn phf-intro-skip"
            onClick={handleSkip}
          >
            <FastForward className="w-4 h-4" aria-hidden="true" />
            <span>{t('intro.skip')}</span>
          </button>
        </div>

        {/* 4. Visual Artwork Placed Last in DOM for Clean Screen Reader Order; CSS order puts it on top */}
        <div className="phf-intro-visual" aria-hidden="true">
          <IntroSceneArtwork visualKey={scene.visualKey} />
        </div>
      </section>
    </main>
  );
}
