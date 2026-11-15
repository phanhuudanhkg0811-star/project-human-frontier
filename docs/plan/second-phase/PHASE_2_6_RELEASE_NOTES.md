# PHASE 2.6 RELEASE NOTES — MOON COMPLETE (`2.0.0-moon32`)

**Release Version:** `2.0.0-moon32`  
**Save Schema Compatibility:** `SaveEnvelope v4` (`APP_VERSION = '1.4.0'`, preserves Phase 1 saves in place)  
**E2E Evidence:** `reports/phase-2-6/browser/results.json` (40/40 checks passing across 8 critical journeys in Chrome Headless CDP)

---

## 1. Moon Complete Summary (Phase 2.0 – 2.6)

- **Entry & First-Launch Protection (Phase 2.1–2.2):** Dedicated Title / Continue / Setup / Recovery Screen gating app startup (`App.tsx`) with animated lunar-night backdrop, fail-closed `E_SAVE_CORRUPTED` recovery, Save v4 metadata preview, quick VI/EN + audio/reduced-motion toggles, and a 6-scene (~75s) `IntroCinematic` supporting Back/Pause/Next/Skip and mid-intro session resume.
- **Versioned Onboarding & Action-Driven Tours (Phase 2.1, 2.3):** Versioned `phf_onboarding_v1` storage with corrupt/version-mismatch isolation and Phase 1 Save v4 migration, `driver.js` lifecycle adapter with overlay/focus cleanup, 11-step Cockpit Discovery Tour, 9-step action-driven Guided Sol 1 Tour, and independent ephemeral Tutorial sandbox replay.
- **Moon 32-Sol Narrative Milestones & Finale (Phase 2.4):** Four Milestone Presentations (`Sol 1 Arrival`, `Sol 7 Golden Crisis`, `Sol 15 Lunar Sunset`, `Sol 29 Lunar Sunrise`), Sol 7 Night Cutscene dual-branch consequence framing (`saved-rover` / `prioritized-wrs`), Sol 32 Victory/Defeat `Campaign Finale` insights, and compact NASA DONKI Space Weather profile selector with expandable telemetry drawer.
- **Conditional Rich Debrief & Anti-Spam Contextual Hints (Phase 2.5):** Collapsible Sol debrief breakdown on anomaly/night/high-strain Sols and prioritized anti-spam contextual hints (`Snooze Sol`, `Dismiss Forever`, `Disable Hints`).
- **Hardening, Accessibility & E2E (Phase 2.6):**
  - `TitleScreen` overwrite prompt supports `Escape` dismissal + focus restoration back to `New Mission`; modal dialogs keep focus trapped & restore trigger focus.
  - Responsive mobile `390×844` CSS enforces `>= 44×44px` touch targets across `Driver.js` popover controls, contextual hint links, and title prompt buttons with `0px` horizontal overflow.
  - Automated Playwright-free Chrome Headless CDP verification (`npm run verify:e2e:p2`) passes all 8 critical journeys across `1440×900`, `1280×720`, `390×844`, `VI/EN`, keyboard navigation, and `prefers-reduced-motion`.

## 2. Verification Summary

- `npm run lint` (`oxlint`): 0 warnings, 0 errors.
- `npm run typecheck` (`tsc --noEmit`): exit 0.
- `npm test` (`node --test`): passes all unit, determinism, scenario, onboarding, narrative, debrief/hints, and Phase 2.6 hardening tests.
- `npm run build` & `npm run budget:check`: production bundle builds cleanly within JS/CSS/total budgets.
- `npm run verify:e2e:p2` (`scripts/verify-phase-2-6-e2e.mjs`): 40/40 assertions PASS (`0` runtime exceptions, `0` console errors, deterministic replay `stateHash` match on Sol 32 Victory).

## 3. Recommended Live Demo Flow

1. Launch cleanly on **Title Screen** (`Start -> Intro Scene 1..6 -> Mission Setup`), expand 1 NASA DONKI detail drawer, start `Cadet` (`seed: 205099`).
2. Step through **Cockpit Discovery Tour** (or skip via `×` / `Escape`) -> inspect **Sol 1 Arrival Milestone** -> follow Urgent Briefing hint to play Sol 1.
3. Highlight **Sol 7 Golden Crisis Milestone** & **Sol 7 Debrief dual-branch framing**, toggle `EN / VI` and `Reduced Motion`, then showcase **Sol 32 Victory Finale + Export Replay Trace**.

## 4. Rollback Plan

- Deterministic simulation core (`src/domain/*`), catalogs (`src/data/*`), and `SaveEnvelope v4` (`src/persistence/saveAdapter.ts`) remain unchanged across Phase 2; any UI onboarding regression can be disabled cleanly by forcing `evaluateAutoStartTour` / `selectPendingCockpitMilestone` to return empty plans without touching saved player campaigns or replay determinism.
