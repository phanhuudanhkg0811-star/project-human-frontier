import { Suspense, lazy, type ComponentType } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { TitleScreen } from './components/onboarding/TitleScreen.tsx';
import { useUiStore } from './store/uiStore.ts';

function lazyNamed<TProps>(loader: () => Promise<ComponentType<TProps>>) {
  return lazy(async () => ({ default: await loader() }));
}

const IntroCinematic = lazyNamed(() =>
  import('./components/onboarding/IntroCinematic.tsx').then((m) => m.IntroCinematic)
);
const HailGameViewport = lazyNamed(() =>
  import('./components/HailGameViewport.tsx').then((m) => m.HailGameViewport)
);
const MissionLaunchModal = lazyNamed(() =>
  import('./components/modals/MissionLaunchModal.tsx').then((m) => m.MissionLaunchModal)
);
const TutorialModal = lazyNamed(() =>
  import('./components/modals/TutorialModal.tsx').then((m) => m.TutorialModal)
);
const AboutCreditsModal = lazyNamed(() =>
  import('./components/modals/AboutCreditsModal.tsx').then((m) => m.AboutCreditsModal)
);

export default function App() {
  const appScreen = useUiStore((s) => s.appScreen);
  const activeModal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1b242b]">
      <ErrorBoundary>
        {appScreen === 'title' && (
          <>
            <TitleScreen />
            <Suspense fallback={null}>
              {activeModal === 'launch' && <MissionLaunchModal onClose={closeModal} />}
              {activeModal === 'tutorial' && <TutorialModal onClose={closeModal} />}
              {activeModal === 'about' && <AboutCreditsModal onClose={closeModal} />}
            </Suspense>
          </>
        )}

        {appScreen === 'intro' && (
          <Suspense fallback={null}>
            <IntroCinematic />
          </Suspense>
        )}

        {appScreen === 'cockpit' && (
          <Suspense fallback={null}>
            <HailGameViewport />
          </Suspense>
        )}
      </ErrorBoundary>
    </div>
  );
}
