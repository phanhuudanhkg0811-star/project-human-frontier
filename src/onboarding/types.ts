import type { GameState, SolPhase, UiState } from '../types/index.ts';

export type IntroStatus = 'unseen' | 'skipped' | 'completed';
export type CockpitTourStatus = 'unseen' | 'active' | 'skipped' | 'completed';
export type TourId = 'cockpit' | 'sol1';
export type TourVersion = 'moon-sol1-v1';
export type Sol1GuideStatus = 'unseen' | 'active' | 'skipped' | 'completed';

export type TourTargetId =
  | 'title-new-mission'
  | 'title-continue'
  | 'title-how-to-play'
  | 'telemetry-bar'
  | 'cockpit-window'
  | 'cockpit-crew-stage'
  | 'cockpit-fabricator'
  | 'open-briefing'
  | 'weather-status'
  | 'telemetry-donki'
  | 'event-choice'
  | 'starlog-confirm'
  | 'open-crew'
  | 'crew-assignment'
  | 'open-systems'
  | 'systems-panel'
  | 'open-comms'
  | 'open-rover'
  | 'open-end-sol'
  | 'primary-phase-cta'
  | 'resource-forecast'
  | 'end-sol'
  | 'debrief-brief'
  | 'hud-tutorial-trigger';

export interface OnboardingState {
  readonly onboardingVersion: number;
  readonly introStatus: IntroStatus;
  readonly cockpitTourStatus: CockpitTourStatus;
  readonly tourVersion: TourVersion;
  readonly activeTour: TourId | null;
  readonly activeStepId: string | null;
  readonly sol1GuideStatus: Sol1GuideStatus;
  readonly contextualHintsEnabled: boolean;
  readonly dismissedHintIds: readonly string[];
  readonly hintLastShownSol: Readonly<Record<string, number>>;
  readonly hintShowCounts: Readonly<Record<string, number>>;
  readonly hintSnoozedSol?: Readonly<Record<string, number>>;
  readonly hintLastSeverity?: Readonly<Record<string, string>>;
}

export type OnboardingNoticeCode = 'E_ONBOARDING_CORRUPT' | 'E_ONBOARDING_VERSION' | null;

export interface OnboardingDecodeResult {
  readonly state: OnboardingState;
  readonly migrated: boolean;
  readonly resetToDefault: boolean;
  readonly noticeCode: OnboardingNoticeCode;
}

export type TourPopoverSide = 'top' | 'right' | 'bottom' | 'left';

export interface TourStepDefinition {
  readonly stepId: string;
  readonly targetId: TourTargetId;
  readonly fallbackTargetId?: TourTargetId;
  readonly phase: SolPhase | 'any';
  readonly decorationOnly: false;
  readonly side?: TourPopoverSide;
  readonly waitForElementMs?: number;
  readonly allowContinueWithoutAction: boolean;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly testEvent: string;
  readonly isCompleted?: (gameState: GameState, uiState: Pick<UiState, 'activeModal'>) => boolean;
}

export type DriverDestroyReason =
  | 'done'
  | 'skip'
  | 'escape'
  | 'unmount'
  | 'campaign-reset'
  | 'terminal'
  | 'missing-target'
  | 'replaced';

export interface DriverStepText {
  readonly title: string;
  readonly description: string;
  readonly nextBtnText?: string;
  readonly prevBtnText?: string;
  readonly doneBtnText?: string;
  readonly closeBtnLabel?: string;
}

export interface DriverStartOptions {
  readonly tourId: TourId;
  readonly steps: readonly TourStepDefinition[];
  readonly startStepId?: string | null;
  readonly reducedMotion: boolean;
  readonly resolveText: (step: TourStepDefinition) => DriverStepText;
  readonly canAdvanceStep?: (step: TourStepDefinition) => boolean;
  readonly shouldWaitForTarget?: (step: TourStepDefinition) => boolean;
  readonly resolveElementOverride?: (step: TourStepDefinition) => Element | null;
  readonly resolveSelectorOverride?: (step: TourStepDefinition) => string | null;
  readonly onBeforeStepMove?: (step: TourStepDefinition) => Promise<void> | void;
  readonly progressText?: string;
  readonly onStepChange?: (stepId: string, targetId: TourTargetId) => void;
  readonly onComplete?: () => void;
  readonly onDismiss?: (reason: DriverDestroyReason, lastStepId: string | null) => void;
}

export interface DriverBackendInstance {
  isActive: () => boolean;
  drive: (stepIndex?: number) => void;
  moveTo: (stepIndex: number) => void;
  destroy: () => void;
  getActiveIndex?: () => number | undefined;
  updatePopover?: (patch: { showButtons?: Array<'next' | 'previous' | 'close'> }) => void;
}

export interface DriverBackendStepConfig {
  readonly element?: string | (() => Element);
  readonly disableActiveInteraction?: boolean;
  readonly allowPageInteraction?: boolean;
  readonly focus?: 'popover' | 'element' | 'none';
  readonly popover?: {
    readonly title?: string;
    readonly description?: string;
    readonly side?: TourPopoverSide;
    readonly align?: 'start' | 'center' | 'end';
    readonly showButtons?: ReadonlyArray<'next' | 'previous' | 'close'>;
    readonly popoverClass?: string;
    readonly nextBtnText?: string;
    readonly prevBtnText?: string;
    readonly doneBtnText?: string;
    readonly closeBtnLabel?: string;
    readonly onNextClick?: () => void;
    readonly onPrevClick?: () => void;
    readonly onCloseClick?: () => void;
  };
  readonly onHighlightStarted?: (element: unknown) => void;
  readonly onHighlighted?: (element: unknown) => void;
}

export interface DriverBackendConfig {
  readonly animate: boolean;
  readonly smoothScroll: boolean;
  readonly allowKeyboardControl: boolean;
  readonly allowClose: boolean;
  readonly overlayClickBehavior: 'none' | 'close' | 'nextStep';
  readonly stagePadding: number;
  readonly stageRadius: number;
  readonly popoverClass: string;
  readonly showProgress: boolean;
  readonly progressText?: string;
  readonly steps: readonly DriverBackendStepConfig[];
  readonly onDestroyStarted?: (element: unknown, step: unknown, opts: { reason?: string }) => void;
  readonly onDestroyed?: (element: unknown, step: unknown, opts: { reason?: string }) => void;
}

export type DriverBackendFactory = (config: DriverBackendConfig) => Promise<DriverBackendInstance> | DriverBackendInstance;

export interface DriverAdapter {
  start: (options: DriverStartOptions) => Promise<boolean>;
  resume: (options: DriverStartOptions) => Promise<boolean>;
  move: (stepId: string) => boolean;
  destroy: (reason?: DriverDestroyReason) => void;
  isActive: () => boolean;
  getActiveStepId: () => string | null;
  waitForElement: (selector: string, timeoutMs?: number) => Promise<Element | null>;
}

export type ContextualHintCategory =
  | 'critical-safety'
  | 'debrief-followup'
  | 'workflow'
  | 'educational';

export type HintCtaPanel =
  | 'starlog'
  | 'menu'
  | 'character'
  | 'comms'
  | 'expedition'
  | 'end'
  | 'crafting';

export interface ContextualHintView {
  readonly id: string;
  readonly category: ContextualHintCategory;
  readonly priority: number;
  readonly severityKey: string;
  readonly severityRank: number;
  readonly escalatedFromPrior: boolean;
  readonly allowNeverRemindAgain: boolean;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly reasonKey?: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly ctaTargetId: TourTargetId;
  readonly fallbackTargetId?: TourTargetId;
  readonly ctaPanel: HintCtaPanel;
  readonly ctaLabelKey: string;
}
