import { Compass, Cpu, Film, Map, Moon, Radio, Utensils } from 'lucide-react';
import { startMusic, syncMusicMuted } from '../../audio/sfx.ts';
import { playSfx as playSynthSfx } from '../../audio/soundEngine.ts';
import { TUTORIAL_STEPS } from '../../data/tutorialSteps.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { HAIL_SVG } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

function StepIcon({ icon }: { icon: (typeof TUTORIAL_STEPS)[number]['icon'] }) {
  switch (icon) {
    case 'briefing':
      return <Compass className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />;
    case 'engineering':
      return <Cpu className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />;
    case 'comms':
      return <Radio className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />;
    case 'rationing':
      return <Utensils className="w-4 h-4 text-sky-300 shrink-0" aria-hidden="true" />;
    case 'lunar-night':
      return <Moon className="w-4 h-4 text-indigo-300 shrink-0" aria-hidden="true" />;
  }
}

export function TutorialModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const appScreen = useUiStore((s) => s.appScreen);
  const audioMuted = useUiStore((s) => s.audioMuted);
  const contextualHintsEnabled = useUiStore((s) => s.onboarding.contextualHintsEnabled);
  const tutorialStep = useUiStore((s) => s.tutorialStep);
  const tutorialCompleted = useUiStore((s) => s.tutorialCompleted);
  const setTutorialStep = useUiStore((s) => s.setTutorialStep);
  const completeTutorial = useUiStore((s) => s.completeTutorial);
  const resetTutorial = useUiStore((s) => s.resetTutorial);
  const openIntro = useUiStore((s) => s.openIntro);
  const enterCockpit = useUiStore((s) => s.enterCockpit);
  const startCockpitTour = useUiStore((s) => s.startCockpitTour);
  const setContextualHintsEnabled = useUiStore((s) => s.setContextualHintsEnabled);
  const enterSol1Sandbox = useGameStore((s) => s.enterSol1Sandbox);

  const totalSteps = TUTORIAL_STEPS.length;
  const safeIndex = Math.min(Math.max(0, tutorialStep), totalSteps - 1);
  const current = TUTORIAL_STEPS[safeIndex];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === totalSteps - 1;

  return (
    <MissionDialog
      title={t('tutorial.title')}
      eyebrow={t('tutorial.eyebrow')}
      art={HAIL_SVG.badgeNasaStem}
      panelType="tutorial"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        {/* Step Navigation Dots */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t('tutorial.title')}>
            {TUTORIAL_STEPS.map((step, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTutorialStep(index)}
                  className={`hail-btn px-2.5 py-1 text-xs font-mono ${active ? 'hail-btn--accent' : ''}`}
                >
                  {step.stepNumber}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-cyan-300">
              {t('tutorial.stepBadge', { current: safeIndex + 1, total: totalSteps })}
            </span>
            {tutorialCompleted && (
              <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px]">
                {t('tutorial.completedBadge')}
              </span>
            )}
          </div>
        </div>

        {/* Step Card */}
        <article className="p-3.5 rounded-lg bg-slate-900/80 border border-cyan-500/35 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <StepIcon icon={current.icon} />
            <h3 className="text-sm font-bold text-white">{current.title[locale]}</h3>
          </div>
          <p className="text-[11px] font-mono text-cyan-300 bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5">
            {current.cockpitArea[locale]}
          </p>
          <p className="text-xs text-slate-200 leading-relaxed">{current.summary[locale]}</p>

          <div className="mt-1">
            <div className="text-[11px] font-semibold text-amber-300 mb-1">
              {t('tutorial.checklistLabel')}
            </div>
            <ul className="list-disc pl-5 flex flex-col gap-1 text-xs text-slate-300">
              {current.checklist[locale].map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="p-2.5 rounded bg-sky-950/50 border border-sky-500/35 text-xs text-sky-100">
            <strong className="text-sky-300">{t('tutorial.stemLabel')}: </strong>
            {current.stemTip[locale]}
          </div>
        </article>

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setTutorialStep(safeIndex - 1)}
              className="hail-btn text-xs"
            >
              {t('tutorial.prevStep')}
            </button>
            {tutorialCompleted && !isFirst && (
              <button
                type="button"
                onClick={resetTutorial}
                className="hail-btn text-xs"
              >
                {t('tutorial.replayStep')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playSynthSfx('click');
                syncMusicMuted(audioMuted);
                if (!audioMuted) startMusic(0.28);
                openIntro('replay', appScreen === 'cockpit' ? 'cockpit' : 'title', 0);
              }}
              className="hail-btn text-xs flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('tutorial.replayIntro')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSynthSfx('click');
                const origin = appScreen === 'title' ? 'title' : 'cockpit';
                enterSol1Sandbox(origin);
                if (appScreen !== 'cockpit') {
                  enterCockpit();
                }
                startCockpitTour(undefined, {
                  returnToTutorialOrigin: origin,
                });
                onClose();
              }}
              className="hail-btn text-xs flex items-center gap-1.5"
            >
              <Map className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('onboarding.cockpit.replayCockpit')}</span>
            </button>
            <button
              type="button"
              aria-pressed={contextualHintsEnabled}
              onClick={() => {
                playSynthSfx('click');
                setContextualHintsEnabled(!contextualHintsEnabled);
              }}
              className="hail-btn text-xs"
            >
              {contextualHintsEnabled
                ? t('onboarding.controls.hintsOn')
                : t('onboarding.controls.hintsOff')}
            </button>
          </div>

          {!isLast ? (
            <button
              type="button"
              onClick={() => setTutorialStep(safeIndex + 1)}
              className="hail-btn hail-btn--accent text-xs font-bold"
            >
              {t('tutorial.nextStep')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                completeTutorial();
                onClose();
              }}
              className="hail-btn hail-btn--accent text-xs font-bold"
            >
              {t('tutorial.finishStep')}
            </button>
          )}
        </div>
      </div>
    </MissionDialog>
  );
}
