import type { Config as DriverJsConfig } from 'driver.js';
import { tourSelector } from './targets.ts';
import type {
  DriverAdapter,
  DriverBackendConfig,
  DriverBackendFactory,
  DriverBackendInstance,
  DriverDestroyReason,
  DriverStartOptions,
  TourStepDefinition,
  TourTargetId,
} from './types.ts';

function normalizeDriverProgressTemplate(template: string | undefined): string {
  const raw = template?.trim() || '{{current}} / {{total}}';
  return raw.replace(/\{+(current|total)\}+/g, '{{$1}}');
}

function isReducedMotionEffective(explicitReduced: boolean): boolean {
  if (explicitReduced) return true;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

function isElementUsable(element: Element | null): element is Element {
  if (!element) return false;
  if (!element.isConnected) return false;
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
    if (element.hasAttribute('hidden')) return false;
    const rect = element.getBoundingClientRect();
    // In JSDOM/test environments getBoundingClientRect() returns 0x0; only reject explicit display:none.
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    void rect;
  }
  return true;
}

const MODAL_INTERIOR_TARGETS: ReadonlySet<TourTargetId> = new Set([
  'weather-status',
  'event-choice',
  'starlog-confirm',
  'crew-assignment',
  'systems-panel',
  'resource-forecast',
  'end-sol',
  'debrief-brief',
]);

function isInsideOpenDialog(element: Element | null): boolean {
  if (!element || typeof element.closest !== 'function') return false;
  return element.closest('dialog[open]') !== null;
}

let registeredBrowserBackend: DriverBackendFactory | null = null;

export function registerBrowserDriverBackend(factory: DriverBackendFactory): void {
  registeredBrowserBackend = factory;
}

export function toDriverJsConfig(config: DriverBackendConfig): DriverJsConfig {
  return {
    animate: config.animate,
    smoothScroll: config.smoothScroll,
    allowKeyboardControl: config.allowKeyboardControl,
    allowClose: config.allowClose,
    overlayClickBehavior: config.overlayClickBehavior,
    stagePadding: config.stagePadding,
    stageRadius: config.stageRadius,
    popoverClass: config.popoverClass,
    showProgress: config.showProgress,
    progressText: config.progressText,
    steps: config.steps.map((step) => ({
      element: step.element,
      disableActiveInteraction: step.disableActiveInteraction,
      allowPageInteraction: step.allowPageInteraction,
      focus: step.focus,
      popover: step.popover
        ? {
          title: step.popover.title,
          description: step.popover.description,
          side: step.popover.side,
          align: step.popover.align,
          showButtons: step.popover.showButtons ? [...step.popover.showButtons] : undefined,
          popoverClass: step.popover.popoverClass,
          nextBtnText: step.popover.nextBtnText,
          prevBtnText: step.popover.prevBtnText,
          doneBtnText: step.popover.doneBtnText,
          closeBtnLabel: step.popover.closeBtnLabel,
          onNextClick: step.popover.onNextClick,
          onPrevClick: step.popover.onPrevClick,
          onCloseClick: step.popover.onCloseClick,
        }
        : undefined,
      onHighlightStarted: step.onHighlightStarted
        ? (el) => step.onHighlightStarted?.(el)
        : undefined,
      onHighlighted: step.onHighlighted
        ? (el) => step.onHighlighted?.(el)
        : undefined,
    })),
    onDestroyStarted: config.onDestroyStarted
      ? (el, step, opts) => config.onDestroyStarted?.(el, step, opts)
      : undefined,
    onDestroyed: config.onDestroyed
      ? (el, step, opts) => config.onDestroyed?.(el, step, opts)
      : undefined,
  };
}

async function createDefaultDriverBackend(
  config: DriverBackendConfig
): Promise<DriverBackendInstance> {
  if (registeredBrowserBackend) {
    return registeredBrowserBackend(config);
  }
  const { driver } = await import('driver.js');
  return driver(toDriverJsConfig(config));
}

function emitTestEvent(testEvent: string, stepId: string, targetId: TourTargetId): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(testEvent, { detail: { stepId, targetId } }));
  } catch {
    // Non-DOM runtimes ignore CustomEvent dispatch errors cleanly.
  }
}

function cleanupStrayDomNodes(): void {
  if (typeof document === 'undefined') return;
  for (const selector of ['.driver-overlay', '.driver-popover']) {
    document.querySelectorAll(selector).forEach((node) => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }
}

export function createDriverAdapter(
  backendFactory: DriverBackendFactory = createDefaultDriverBackend
): DriverAdapter {
  let backend: DriverBackendInstance | null = null;
  let currentOptions: DriverStartOptions | null = null;
  let activeStepId: string | null = null;
  let pendingReason: DriverDestroyReason | null = null;
  let waitAbort: AbortController | null = null;
  let previousFocus: HTMLElement | null = null;
  let moveToStepIndex: ((index: number) => void) | null = null;
  let runToken = 0;

  const abortWaits = () => {
    if (waitAbort) {
      waitAbort.abort();
      waitAbort = null;
    }
  };

  const waitForElement = (selector: string, timeoutMs = 1200): Promise<Element | null> => {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const immediate = document.querySelector(selector);
    if (isElementUsable(immediate)) {
      return Promise.resolve(immediate);
    }
    if (timeoutMs <= 0) {
      return Promise.resolve(null);
    }

    abortWaits();
    const controller = new AbortController();
    waitAbort = controller;

    return new Promise((resolve) => {
      let observer: MutationObserver | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (found: Element | null) => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (waitAbort === controller) {
          waitAbort = null;
        }
        resolve(found);
      };

      controller.signal.addEventListener('abort', () => finish(null), { once: true });

      if (typeof MutationObserver !== 'undefined' && document.body) {
        observer = new MutationObserver(() => {
          const match = document.querySelector(selector);
          if (isElementUsable(match)) {
            finish(match);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      }

      timer = setTimeout(() => {
        const match = document.querySelector(selector);
        finish(isElementUsable(match) ? match : null);
      }, Math.max(0, timeoutMs));
    });
  };

  const resolveStepTarget = async (
    step: TourStepDefinition,
    opts?: DriverStartOptions | null
  ): Promise<{ element: Element; targetId: TourTargetId } | null> => {
    const override = opts?.resolveElementOverride?.(step) ?? null;
    if (isElementUsable(override)) {
      return { element: override, targetId: step.targetId };
    }
    const shouldWait = opts?.shouldWaitForTarget ? opts.shouldWaitForTarget(step) : true;
    const waitMs = shouldWait ? (step.waitForElementMs ?? 1200) : 0;
    const overrideSelector = opts?.resolveSelectorOverride?.(step) ?? null;
    if (overrideSelector) {
      const overrideEl = await waitForElement(overrideSelector, step.waitForElementMs ?? 1500);
      if (overrideEl) {
        return { element: overrideEl, targetId: step.targetId };
      }
    }
    const primary = await waitForElement(tourSelector(step.targetId), waitMs);
    if (primary) {
      return { element: primary, targetId: step.targetId };
    }
    if (step.fallbackTargetId && typeof document !== 'undefined') {
      const fallback = await waitForElement(tourSelector(step.fallbackTargetId), 400);
      if (fallback) {
        return { element: fallback, targetId: step.fallbackTargetId };
      }
    }
    return null;
  };

  const destroy = (reason: DriverDestroyReason = 'unmount') => {
    runToken += 1;
    abortWaits();

    const hadActive = backend !== null || activeStepId !== null;
    const savedOptions = currentOptions;
    const lastStep = activeStepId;
    const savedFocus = previousFocus;

    pendingReason = reason;
    const currentBackend = backend;
    backend = null;
    currentOptions = null;
    activeStepId = null;
    previousFocus = null;
    moveToStepIndex = null;

    if (currentBackend) {
      try {
        currentBackend.destroy();
      } catch {
        // Ignore teardown exceptions from stale DOM instances.
      }
    }
    cleanupStrayDomNodes();

    if (savedFocus && savedFocus.isConnected && !isInsideOpenDialog(savedFocus)) {
      try {
        savedFocus.focus();
      } catch {
        // Focus restoration is best-effort only.
      }
    }

    if (hadActive && savedOptions) {
      if (reason === 'done') {
        savedOptions.onComplete?.();
      } else if (reason !== 'replaced') {
        savedOptions.onDismiss?.(reason, lastStep);
      }
    }
    pendingReason = null;
  };

  const findNextAvailableStep = async (
    steps: readonly TourStepDefinition[],
    startIndex: number,
    opts?: DriverStartOptions | null
  ): Promise<{ index: number; targetId: TourTargetId; element: Element } | null> => {
    for (let i = Math.max(0, startIndex); i < steps.length; i += 1) {
      const candidate = steps[i];
      await opts?.onBeforeStepMove?.(candidate);
      const resolved = await resolveStepTarget(candidate, opts);
      if (resolved) {
        return { index: i, ...resolved };
      }
      console.warn(
        `[onboarding] Skipping step "${candidate.stepId}": target "${candidate.targetId}"${candidate.fallbackTargetId ? ` and fallback "${candidate.fallbackTargetId}"` : ''
        } not found.`
      );
    }
    return null;
  };

  const startInternal = async (options: DriverStartOptions): Promise<boolean> => {
    if (options.steps.length === 0) return false;

    if (backend || activeStepId) {
      destroy('replaced');
    }

    const token = ++runToken;
    currentOptions = options;
    if (
      typeof document !== 'undefined' &&
      typeof HTMLElement !== 'undefined' &&
      document.activeElement instanceof HTMLElement
    ) {
      previousFocus = document.activeElement;
    }

    const requestedIndex = options.startStepId
      ? Math.max(
        0,
        options.steps.findIndex((step) => step.stepId === options.startStepId)
      )
      : 0;

    const firstAvailable = await findNextAvailableStep(options.steps, requestedIndex, options);
    if (token !== runToken) return false;

    if (!firstAvailable) {
      console.warn(
        `[onboarding] Stopping tour "${options.tourId}": no matching DOM target found from step "${options.startStepId ?? options.steps[0].stepId
        }".`
      );
      destroy('missing-target');
      return false;
    }

    let moveToken = 0;
    const moveToIndex = (index: number) => {
      if (!backend || !currentOptions) return;
      const clamped = Math.max(0, Math.min(currentOptions.steps.length - 1, index));
      const targetStep = currentOptions.steps[clamped];
      const localMoveToken = ++moveToken;
      // Set activeStepId synchronously before async modal cleanup so React effects never double-evaluate the prior step.
      activeStepId = targetStep.stepId;
      void (async () => {
        await currentOptions?.onBeforeStepMove?.(targetStep);
        if (token !== runToken || localMoveToken !== moveToken || !backend || !currentOptions) return;
        const resolved = await resolveStepTarget(targetStep, currentOptions);
        if (token !== runToken || localMoveToken !== moveToken || !backend || !currentOptions) return;
        if (!resolved) {
          console.warn(`[onboarding] Missing target for "${targetStep.stepId}".`);
          if (targetStep.allowContinueWithoutAction === false) {
            // Never silently skip a required interactive Sol 1 step; stay anchored on it safely.
            activeStepId = targetStep.stepId;
            backend.moveTo(clamped);
            return;
          }
          const nextAvailable = await findNextAvailableStep(
            currentOptions.steps,
            clamped + 1,
            currentOptions
          );
          if (token !== runToken || localMoveToken !== moveToken || !backend || !currentOptions) return;
          if (!nextAvailable) {
            destroy('missing-target');
            return;
          }
          activeStepId = currentOptions.steps[nextAvailable.index].stepId;
          backend.moveTo(nextAvailable.index);
          return;
        }
        activeStepId = targetStep.stepId;
        backend.moveTo(clamped);
      })();
    };
    moveToStepIndex = moveToIndex;

    const effectiveReducedMotion = isReducedMotionEffective(options.reducedMotion);

    const getShowButtonsForStep = (
      step: TourStepDefinition,
      index: number
    ): Array<'previous' | 'next' | 'close'> => {
      const canClickNext =
        step.allowContinueWithoutAction || (options.canAdvanceStep?.(step) ?? false);
      const buttons: Array<'previous' | 'next' | 'close'> = [];
      if (index > 0) buttons.push('previous');
      if (canClickNext) buttons.push('next');
      buttons.push('close');
      return buttons;
    };

    const stepConfigs: DriverBackendConfig['steps'] = options.steps.map((step, index) => {
      const copy = options.resolveText(step);
      const isLast = index === options.steps.length - 1;
      const showButtons = getShowButtonsForStep(step, index);

      return {
        element: () => {
          const override = options.resolveElementOverride?.(step) ?? null;
          if (isElementUsable(override)) return override;
          const overrideSelector = options.resolveSelectorOverride?.(step) ?? null;
          if (overrideSelector && typeof document !== 'undefined') {
            const matchedOverride = document.querySelector(overrideSelector);
            if (isElementUsable(matchedOverride)) return matchedOverride;
          }
          if (typeof document !== 'undefined') {
            const primary = document.querySelector(tourSelector(step.targetId));
            if (isElementUsable(primary)) return primary;
            if (step.fallbackTargetId) {
              const fallback = document.querySelector(tourSelector(step.fallbackTargetId));
              if (isElementUsable(fallback)) return fallback;
            }
          }
          return document.body;
        },
        allowPageInteraction: false,
        disableActiveInteraction: options.tourId === 'cockpit',
        focus: MODAL_INTERIOR_TARGETS.has(step.targetId) ? 'none' : 'popover',
        popover: {
          title: copy.title,
          description: copy.description,
          side: step.side ?? 'bottom',
          align: 'center',
          showButtons,
          popoverClass: 'phf-driver-popover',
          nextBtnText: isLast ? copy.doneBtnText ?? copy.nextBtnText : copy.nextBtnText,
          prevBtnText: copy.prevBtnText,
          doneBtnText: copy.doneBtnText,
          closeBtnLabel: copy.closeBtnLabel,
          onNextClick: () => {
            if (isLast) {
              destroy('done');
              return;
            }
            moveToIndex(index + 1);
          },
          onPrevClick: () => {
            if (index > 0) {
              moveToIndex(index - 1);
            }
          },
          onCloseClick: () => {
            destroy('skip');
          },
        },
        onHighlightStarted: (highlightedEl) => {
          activeStepId = step.stepId;
          if (
            options.tourId !== 'cockpit' &&
            typeof HTMLElement !== 'undefined' &&
            highlightedEl instanceof HTMLElement &&
            typeof highlightedEl.scrollIntoView === 'function'
          ) {
            try {
              highlightedEl.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
                behavior: effectiveReducedMotion ? 'auto' : 'smooth',
              });
            } catch {
              // Ignore JSDOM/unsupported scroll options cleanly.
            }
          }
          const usedTarget =
            typeof document !== 'undefined' && isElementUsable(document.querySelector(tourSelector(step.targetId)))
              ? step.targetId
              : step.fallbackTargetId ?? step.targetId;
          options.onStepChange?.(step.stepId, usedTarget);
          emitTestEvent(step.testEvent, step.stepId, usedTarget);
        },
        onHighlighted: () => {
          backend?.updatePopover?.({ showButtons: getShowButtonsForStep(step, index) });
        },
      };
    });

    const instance = await backendFactory({
      animate: options.tourId === 'cockpit' ? false : !effectiveReducedMotion,
      smoothScroll: options.tourId === 'cockpit' ? false : !effectiveReducedMotion,
      allowKeyboardControl: true,
      allowClose: true,
      overlayClickBehavior: 'none',
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'phf-driver-popover',
      showProgress: true,
      progressText: normalizeDriverProgressTemplate(options.progressText),
      steps: stepConfigs,
      onDestroyStarted: (_el, _step, opts) => {
        if (pendingReason !== null) return;
        const reason: DriverDestroyReason =
          opts.reason === 'escape'
            ? 'escape'
            : opts.reason === 'done'
              ? 'done'
              : 'skip';
        destroy(reason);
      },
      onDestroyed: () => {
        if (pendingReason === null && backend !== null) {
          destroy('skip');
        }
      },
    });

    if (token !== runToken) {
      try {
        instance.destroy();
      } catch {
        // Stale async load discarded cleanly.
      }
      return false;
    }

    backend = instance;
    activeStepId = options.steps[firstAvailable.index].stepId;
    instance.drive(firstAvailable.index);
    return true;
  };

  return {
    start: (options) => startInternal(options),
    resume: (options) => startInternal(options),
    move: (stepId) => {
      if (!backend || !currentOptions) return false;
      const index = currentOptions.steps.findIndex((step) => step.stepId === stepId);
      if (index < 0) return false;
      const step = currentOptions.steps[index];
      activeStepId = stepId;
      const overrideNow = currentOptions.resolveElementOverride?.(step) ?? null;
      const overrideSelector = currentOptions.resolveSelectorOverride?.(step) ?? null;
      const overrideSelectorEl =
        overrideSelector && typeof document !== 'undefined'
          ? document.querySelector(overrideSelector)
          : null;
      const primaryNow =
        typeof document !== 'undefined' ? document.querySelector(tourSelector(step.targetId)) : null;
      if (
        isElementUsable(overrideNow) ||
        (overrideSelector ? isElementUsable(overrideSelectorEl) : isElementUsable(primaryNow)) ||
        !moveToStepIndex
      ) {
        backend.moveTo(index);
      } else {
        moveToStepIndex(index);
      }
      return true;
    },
    destroy,
    isActive: () => Boolean(backend && backend.isActive()),
    getActiveStepId: () => activeStepId,
    waitForElement,
  };
}

export const onboardingDriver: DriverAdapter = createDriverAdapter();
