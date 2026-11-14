import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { HailGameViewport } from './components/HailGameViewport.tsx';

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1b242b]">
      <ErrorBoundary>
        <HailGameViewport />
      </ErrorBoundary>
    </div>
  );
}
