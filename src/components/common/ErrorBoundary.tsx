import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '../../i18n/useI18n.ts';
import { downloadArtifact } from '../../persistence/downloadArtifact.ts';
import { clearSavedGame, SAVE_STORAGE_KEY } from '../../persistence/saveAdapter.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Locale } from '../../i18n/types.ts';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

function getSafeLocale(): Locale {
  try {
    return useUiStore.getState().locale;
  } catch {
    return 'vi';
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected UI error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Unhandled UI crash:', error, info.componentStack);
  }

  private handleExportSave = (): void => {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (raw) {
        downloadArtifact('moon32-emergency-save.json', raw, true);
      }
    } catch {
      // Storage access may be restricted; keep recovery buttons functional.
    }
  };

  private handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReset) {
      this.props.onReset();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleResetSave = (): void => {
    clearSavedGame();
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReset) {
      this.props.onReset();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const locale = getSafeLocale();
    let hasRawSave = false;
    try {
      hasRawSave = typeof window !== 'undefined' && Boolean(window.localStorage.getItem(SAVE_STORAGE_KEY));
    } catch {
      hasRawSave = false;
    }

    return (
      <div
        role="alert"
        className="min-h-screen w-full flex items-center justify-center bg-[#0B1218] text-[#E7E6DF] p-6"
      >
        <div className="max-w-lg w-full rounded-xl border border-rose-500/70 bg-[#16212B] p-6 shadow-2xl space-y-4">
          <p className="text-xs font-mono uppercase tracking-wider text-rose-300">
            {translate(locale, 'errorBoundary.eyebrow')}
          </p>
          <h1 className="text-xl font-bold text-white">
            {translate(locale, 'errorBoundary.title')}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {translate(locale, 'errorBoundary.description')}
          </p>
          {this.state.errorMessage && (
            <pre className="text-xs font-mono bg-black/40 border border-slate-700 rounded p-3 overflow-x-auto text-rose-200">
              {this.state.errorMessage}
            </pre>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {hasRawSave && (
              <button
                type="button"
                className="hail-btn"
                onClick={this.handleExportSave}
              >
                {translate(locale, 'errorBoundary.exportSave')}
              </button>
            )}
            <button
              type="button"
              className="hail-btn hail-btn--primary"
              onClick={this.handleReload}
            >
              {translate(locale, 'errorBoundary.reload')}
            </button>
            <button
              type="button"
              className="hail-btn hail-btn--warn"
              onClick={this.handleResetSave}
            >
              {translate(locale, 'errorBoundary.resetSave')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
