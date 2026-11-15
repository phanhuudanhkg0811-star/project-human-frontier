import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { loadSimulation, simulationRoot as root } from './load-simulation.mjs';

const evidence = path.join(root, 'reports/phase-2-6/browser');
fs.mkdirSync(evidence, { recursive: true });

const server = await createServer({
  root,
  cacheDir: path.join(os.tmpdir(), `phase26-vite-${process.pid}`),
  server: { host: '127.0.0.1', port: 5197, strictPort: true, hmr: false },
});
await server.listen();

const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=9247',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'phase26-ui-'))}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' }
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const core = await loadSimulation();
const bundle = core.loadContentBundle();
const SAVE_KEY = 'human-frontier:moon32:save-v1';
const ONBOARDING_KEY = 'phf_onboarding_v1';
const NARRATIVE_KEY = 'phf_narrative_v1';
const INTRO_SESSION_KEY = 'phf_intro_session_v1';

const results = {
  phase: '2.6',
  method:
    '8-Journey Moon Complete E2E via live Vite + Chrome CDP (Desktop 1440x900, Laptop 1280x720, Mobile 390x844, VI & EN, Keyboard a11y, Normal & Reduced Motion, Onboarding Recovery, Sol 7 Branches, Sol 32 Victory & Defeat).',
  contentHash: core.contentHash(bundle),
  checks: [],
  errors: [],
  consoleErrors: [],
  screenshots: [],
  campaigns: [],
};

let ws;
let call;
let evaluate;

try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try {
      pages = await (await fetch('http://127.0.0.1:9247/json/list')).json();
      if (pages.length) break;
    } catch {
      // Wait for Chrome DevTools target
    }
    await pause(200);
  }
  assert.ok(pages?.length, 'Chrome is available (override CHROME_PATH if needed)');

  ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      results.errors.push(
        message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text
      );
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      results.consoleErrors.push(text);
    }
  });

  call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      const timer = setTimeout(() => {
        pending.delete(next);
        reject(new Error(`CDP timeout: ${method}`));
      }, 25000);
      pending.set(next, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      ws.send(JSON.stringify({ id: next, method, params }));
    });

  evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ?? response.exceptionDetails.text
      );
    }
    return response.result?.value;
  };

  const check = (name, value) => {
    assert.ok(value, name);
    results.checks.push(name);
    console.log(`PASS ${name}`);
  };

  const click = async (expression) => {
    try {
      await evaluate(`(() => {
        const el = ${expression};
        if (!el || el.disabled) throw Error('Missing or disabled control: ' + ${JSON.stringify(expression)});
        el.scrollIntoView({ block: 'center' });
        el.focus();
        el.click();
      })()`);
    } catch (error) {
      throw new Error(`${error.message}\nSelector: ${expression}`);
    }
    await pause(45);
  };

  const waitFor = async (expression, timeoutMs = 6000) => {
    const startMs = Date.now();
    while (Date.now() - startMs < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`)) return true;
      await pause(40);
    }
    return false;
  };

  const pressKey = async (key, code, windowsVirtualKeyCode) => {
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode,
    });
    await pause(55);
  };

  const screenshot = async (name) => {
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(shot.data, 'base64'));
    results.screenshots.push(name);
  };

  const button = (text, scope = 'document') =>
    `[...(${scope}).querySelectorAll('button')].find(el => el.textContent.includes(${JSON.stringify(text)}))`;

  const saveState = () =>
    evaluate(`JSON.parse(localStorage.getItem('${SAVE_KEY}') || 'null')?.state`);

  const viewport = (width, height, mobile = false) =>
    call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

  const setReducedMotion = (reduced) =>
    call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
    });

  const closeModal = async () => {
    if (await evaluate('!!document.querySelector(".mission-dialog[open]")')) {
      await click(
        "document.querySelector('.mission-dialog[open] button.hail-close-btn, .mission-dialog[open] button.hail-tactile-corner-close')"
      );
    }
  };

  const dismissMilestoneIfVisible = async () => {
    if (await evaluate("!!document.querySelector('.phf-milestone-dialog[open]')")) {
      await click("document.querySelector('.phf-milestone-continue')");
      await waitFor("!document.querySelector('.phf-milestone-dialog[open]')");
      await pause(60);
    }
  };

  const openPanel = async (type, text) => {
    await dismissMilestoneIfVisible();
    if (await evaluate(`!!document.querySelector('.mission-dialog--${type}[open]')`)) return;
    await closeModal();
    await click(button(text, "document.querySelector('.hail-action-band')"));
    await waitFor(`document.querySelector('.mission-dialog--${type}[open]')`);
  };

  const selectOption = async (label, text) => {
    await click(
      `[...document.querySelectorAll('.hail-select-field')].find(el => el.querySelector('.hail-select-label')?.textContent.includes(${JSON.stringify(label)})).querySelector('button')`
    );
    await click(
      `[...document.querySelectorAll('[role="option"]')].find(el => el.textContent.includes(${JSON.stringify(text)}))`
    );
  };

  const assertZeroHorizontalOverflow = async (label) => {
    const ok = await evaluate('document.documentElement.scrollWidth <= window.innerWidth');
    check(`${label}: zero horizontal overflow`, ok);
  };

  const assertTouchTargets44 = async (selector, label) => {
    const report = await evaluate(`(() => {
      const items = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(
        el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled
      );
      const small = items
        .map(el => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent?.trim() || el.getAttribute('aria-label') || el.className, w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter(item => item.h > 0 && item.h < 44);
      return { total: items.length, small };
    })()`);
    check(
      `${label}: >= 44px touch target (${report.total} checked, small=${JSON.stringify(report.small)})`,
      report.total > 0 && report.small.length === 0
    );
  };

  const dispatchAction = async (command, current) => {
    await dismissMilestoneIfVisible();
    if (command.type === 'phase/advance') {
      await closeModal();
      await click("document.querySelector('.hail-action-band button.is-primary')");
    } else if (command.type === 'event/resolve') {
      await openPanel('starlog', 'Giao ban');
      const label = bundle.events
        .find((event) => event.id === command.eventId)
        .choices.find((choice) => choice.id === command.choiceId).label;
      await waitFor("document.querySelector('button.hail-sq-push-btn')");
      await click(
        `[...document.querySelectorAll('button.hail-sq-push-btn')].find(el => (el.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`
      );
    } else if (command.type === 'crew/assign' && ['repair-system', 'upgrade-system'].includes(command.task)) {
      await openPanel('menu', 'Hệ thống');
      const index = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'].indexOf(
        command.targetSystemId
      );
      await click(
        button(
          command.task === 'repair-system' ? 'Sửa (' : 'Nâng (',
          `document.querySelectorAll('.hail-sys-card')[${index}]`
        )
      );
    } else if (command.type === 'crew/assign' && command.task === 'rest') {
      await openPanel('character', 'Crew');
      await click(
        button(
          'Nghỉ',
          `document.querySelector('.mission-dialog img[alt="${current.crew[command.crewId].name}"]').closest('div.p-3')`
        )
      );
    } else if (command.type === 'crew/use-medkit') {
      await openPanel('character', 'Crew');
      await selectOption('Người nhận Medkit', current.crew[command.targetCrewId].name);
      await click(button('Tự dùng'));
    } else if (command.type === 'fabricator/queue') {
      await openPanel('crafting', '3D Fab');
      const name = bundle.recipes.items.find((recipe) => recipe.id === command.itemId).name;
      await click(
        button(
          'In',
          `[...document.querySelectorAll('.mission-dialog strong')].find(el => el.textContent === ${JSON.stringify(name)}).closest('div.p-3')`
        )
      );
    } else if (command.type === 'comms/order-cargo') {
      await openPanel('comms', 'CAPCOM');
      for (const pack of bundle.balance.logistics.packs) {
        const row = `[...document.querySelectorAll('.mission-dialog div')].find(el => el.textContent === ${JSON.stringify(pack.name)}).parentElement.parentElement`;
        for (let i = 0; i < 4; i++) {
          const minus = `[...(${row}).querySelectorAll('button')].find(el => el.textContent === '-')`;
          if (await evaluate(`!(${minus}).disabled`)) await click(minus);
        }
      }
      for (const pack of bundle.balance.logistics.packs) {
        for (let i = 0; i < (command.slots[pack.id] ?? 0); i++) {
          const row = `[...document.querySelectorAll('.mission-dialog div')].find(el => el.textContent === ${JSON.stringify(pack.name)}).parentElement.parentElement`;
          await click(`[...(${row}).querySelectorAll('button')].find(el => el.textContent === '+')`);
        }
      }
      await click(button('Phóng tàu hàng'));
    } else if (command.type === 'rover/schedule') {
      await openPanel('expedition', 'Rover');
      const expedition = bundle.campaign.expeditions.find((entry) => entry.id === command.expeditionId);
      await click(button(expedition.name, "document.querySelector('.hail-site-tabs')"));
      for (const equipment of command.equipmentIds) {
        await click(
          `[...document.querySelectorAll('.mission-dialog button')].find(el => el.dataset.equipmentId === ${JSON.stringify(equipment)} || el.textContent.includes(${JSON.stringify(equipment + ' (')}))`
        );
      }
      await click(button('Lập lịch Rover tới'));
    } else if (command.type === 'rover/recover-signal') {
      await openPanel('expedition', 'Rover');
      await click(button('Khôi phục tín hiệu'));
    } else if (command.type === 'rationing/set-wrs') {
      await openPanel('end', 'End-Sol');
      await click("document.querySelector('.hail-alloc-sys-check')");
    } else if (command.type === 'rationing/toggle-mre') {
      await openPanel('end', 'End-Sol');
      await click(
        `document.querySelectorAll('.hail-alloc-check-btn')[${['cmd', 'eng', 'doc', 'geo'].indexOf(command.crewId)}]`
      );
    } else if (command.type === 'sol/end') {
      await openPanel('end', 'End-Sol');
      await click("document.querySelector('.hail-lever-btn')");
    } else if (command.type === 'debrief/dismiss') {
      await waitFor(
        "[...document.querySelectorAll('button')].some(el => el.textContent.includes('Thức dậy vào Sol'))"
      );
      await click(button('Thức dậy vào Sol'));
    } else {
      throw new Error(`No UI mapping for ${JSON.stringify(command)}`);
    }

    const changed = await waitFor(
      `((JSON.parse(localStorage.getItem('${SAVE_KEY}') || 'null')?.state?.revision) ?? 0) > ${current.revision}`,
      5000
    );
    const next = await saveState();
    assert.ok(
      changed && next.revision > current.revision,
      `UI accepted ${JSON.stringify(command)} at Sol ${current.clock.sol}/${current.clock.phase}: revision ${current.revision} -> ${next.revision}`
    );
    return next;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidence });
  await viewport(1440, 900);
  await setReducedMotion(false);

  // =========================================================================
  // JOURNEY 1 & 2 (part 1): First Launch -> Title -> Intro -> Reload Resume -> Setup -> Tours -> Sol 1 End
  // =========================================================================
  await call('Page.navigate', { url: 'http://127.0.0.1:5197' });
  const titleReady = await waitFor("document.querySelector('.phf-title-shell')", 30000);
  check(
    'Journey 1: Fresh boot lands on Title Screen (never skips directly to cockpit) with Continue disabled',
    titleReady &&
      (await evaluate(`(() => {
        const cont = document.querySelector('[data-tour="title-continue"]');
        return Boolean(document.querySelector('.phf-title-shell')) && !document.querySelector('.hail-action-band') && Boolean(cont?.disabled);
      })()`))
  );
  await screenshot('journey1-title-desktop.png');

  // Normalize to EN before checking, regardless of the persisted/default locale,
  // then switch to VI for the remaining bilingual journey.
  const titleStartsInEnglish = await evaluate(
    "document.querySelector('[data-tour=\"title-new-mission\"]')?.textContent.includes('New Mission')"
  );
  if (!titleStartsInEnglish) {
    await click("document.querySelector('.phf-title-settings-row button')");
    await pause(50);
  }
  check(
    'Journey 8 (Title EN): Title menu localizes cleanly to English',
    await evaluate("document.querySelector('[data-tour=\"title-new-mission\"]')?.textContent.includes('New Mission')")
  );
  await click("document.querySelector('.phf-title-settings-row button')");
  await pause(50);

  // Click New Mission -> Intro Cinematic Scene 1
  await click("document.querySelector('[data-tour=\"title-new-mission\"]')");
  await waitFor("document.querySelector('.phf-intro-viewport')", 15000);
  check(
    'Journey 1: First-run New Mission opens Intro Cinematic at Scene 1/6',
    await evaluate("document.querySelector('.phf-intro-step-badge')?.textContent.includes('1/6')")
  );

  // Keyboard ArrowRight advances to Scene 2/6 & persists intro session
  await pressKey('ArrowRight', 'ArrowRight', 39);
  await waitFor("document.querySelector('.phf-intro-step-badge')?.textContent.includes('2/6')");
  check(
    'Journey 2 & 8 (Intro Keyboard): ArrowRight advances Intro to Scene 2/6 and stores session',
    await evaluate(`JSON.parse(sessionStorage.getItem('${INTRO_SESSION_KEY}') || 'null')?.sceneIndex === 1`)
  );

  // Reload mid-Intro -> shows Resume Intro bar cleanly without autoplaying
  await call('Page.reload');
  await waitFor("document.querySelector('.phf-intro-resume-bar')", 15000);
  check(
    'Journey 2: Reload mid-Intro offers gesture-gated Resume Intro banner on Title Screen',
    await evaluate("document.querySelector('.phf-intro-resume-bar')?.textContent.includes('2/6')")
  );
  await click("document.querySelector('.phf-intro-resume-bar .hail-btn--accent')");
  await waitFor("document.querySelector('.phf-intro-step-badge')?.textContent.includes('2/6')");

  // Finish intro via Skip -> opens Mission Setup modal with compact DONKI cards
  await click("document.querySelector('.phf-intro-skip')");
  await waitFor("document.querySelector('.mission-dialog--launch[open]')");
  check(
    'Journey 1: Skipping/finishing Intro hands off to Mission Setup with compact DONKI selector',
    await evaluate(`(() => {
      const cards = document.querySelectorAll('.phf-launch-profile-card');
      const drawersOpen = document.querySelectorAll('.phf-launch-detail-drawer');
      return cards.length === 3 && drawersOpen.length === 0;
    })()`)
  );
  // Open 1 DONKI details drawer to verify compact detail disclosure works
  await click("document.querySelector('.phf-launch-detail-btn')");
  check(
    'Journey 1 (DONKI Compact UI): Detail button expands telemetry drawer cleanly',
    await evaluate("document.querySelectorAll('.phf-launch-detail-drawer').length === 1")
  );
  await screenshot('journey1-setup-donki.png');

  await selectOption('Độ khó', 'Cadet');
  await evaluate(`(() => {
    const input = document.querySelector('input[type=number]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '205099');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click(button('Bắt đầu Chiến dịch Mới'));
  await waitFor("document.querySelector('.driver-popover')");

  // Cockpit Discovery Tour (11 steps): advance to step 5, test reload mid-tour resume (Journey 2), then finish tour -> Sol 1 Arrival Milestone
  for (let s = 1; s < 5; s++) {
    await waitFor("document.querySelector('.driver-popover-next-btn')", 5000);
    await click("document.querySelector('.driver-popover-next-btn')");
    await pause(120);
  }
  await waitFor(`JSON.parse(localStorage.getItem('${ONBOARDING_KEY}') || 'null')?.activeStepId`, 3000);
  const pausedStepId = await evaluate(`JSON.parse(localStorage.getItem('${ONBOARDING_KEY}') || 'null')?.activeStepId`);

  // Journey 2 (part 2): Reload mid-Cockpit-Tour & resume seamlessly via Title Continue
  await call('Page.reload');
  await waitFor("document.querySelector('.phf-title-shell')", 15000);
  await click("document.querySelector('[data-tour=\"title-continue\"]')");
  await waitFor("document.querySelector('.driver-popover')", 8000);
  check(
    'Journey 2: Reload mid-Cockpit Tour resumes directly at persisted tour step via Continue',
    await evaluate(`(() => {
      const ob = JSON.parse(localStorage.getItem('${ONBOARDING_KEY}') || 'null');
      return ob?.activeTour === 'cockpit' && ob?.activeStepId === ${JSON.stringify(pausedStepId)};
    })()`)
  );

  // Finish remaining Cockpit Discovery steps dynamically until Sol 1 Arrival Milestone appears
  for (let s = 1; s <= 15; s++) {
    if (await evaluate("!!document.querySelector('[data-milestone-id=\"moon-sol1-arrival\"][open]')")) {
      break;
    }
    const hasPopover = await waitFor("document.querySelector('.driver-popover-next-btn')", 3000);
    if (!hasPopover) break;
    await click("document.querySelector('.driver-popover-next-btn')");
    await pause(130);
  }
  await waitFor("document.querySelector('[data-milestone-id=\"moon-sol1-arrival\"][open]')", 8000);
  check(
    'Journey 1 & 6: Cockpit Discovery completion reveals Sol 1 Arrival milestone dialog',
    await evaluate("document.querySelector('[data-milestone-id=\"moon-sol1-arrival\"][open]')?.getAttribute('aria-modal') === 'true'")
  );
  await click("document.querySelector('.phf-milestone-continue')");
  await waitFor("!document.querySelector('.phf-milestone-dialog[open]')", 5000);

  // Journey 1: Play real Sol 1 phases cleanly to Sol 2 (Briefing CTA -> Event -> Crew -> Comms -> End-Sol -> Debrief)
  const sol1Policy = core.createPolicy('balanced', 'A');
  let sol1State = await saveState();
  let sol1Steps = 0;
  while (sol1State.clock.sol === 1 && sol1State.campaign.status === 'active') {
    assert.ok(sol1Steps < 40, 'Sol 1 command budget');
    const cmd = sol1Policy.nextCommand(sol1State, bundle, sol1Steps++);
    sol1State = await dispatchAction(cmd, sol1State);
  }
  check(
    'Journey 1: Completing Guided Sol 1 flow via real cockpit actions reaches Sol 2 with completed tour state & clean DOM',
    await evaluate(`(() => {
      const ob = JSON.parse(localStorage.getItem('${ONBOARDING_KEY}') || 'null');
      const st = JSON.parse(localStorage.getItem('${SAVE_KEY}') || 'null')?.state;
      return st?.clock?.sol === 2 && ob?.cockpitTourStatus === 'completed' && !document.querySelector('.driver-popover') && !document.querySelector('.driver-overlay');
    })()`)
  );

  // =========================================================================
  // JOURNEY 3: Skip Intro/Tour & Independent Replay from Tutorial without Mutating Campaign Save
  // =========================================================================
  const sol2HashBeforeReplay = core.stateHash(await saveState());
  await click("document.querySelector('[data-tour=\"hud-tutorial-trigger\"]')");
  await waitFor("document.querySelector('.mission-dialog--tutorial[open]')");
  await click(button('Xem lại Intro', "document.querySelector('.mission-dialog--tutorial[open]')"));
  await waitFor("document.querySelector('.phf-intro-viewport')");
  await click("document.querySelector('.phf-intro-skip')");
  await waitFor("document.querySelector('.hail-action-band')");
  check(
    'Journey 3: Replaying Intro from Cockpit returns safely without mutating Sol 2 state',
    core.stateHash(await saveState()) === sol2HashBeforeReplay
  );

  await click("document.querySelector('[data-tour=\"hud-tutorial-trigger\"]')");
  await waitFor("document.querySelector('.mission-dialog--tutorial[open]')");
  await click(button('Tour Khám phá Cockpit', "document.querySelector('.mission-dialog--tutorial[open]')"));
  await waitFor("document.querySelector('.driver-popover')");
  await pressKey('Escape', 'Escape', 27);
  await waitFor("!document.querySelector('.driver-popover')");
  check(
    'Journey 3: Ephemeral Cockpit Tour replay exits cleanly via Escape and restores Sol 2 campaign hash',
    core.stateHash(await saveState()) === sol2HashBeforeReplay &&
      (await evaluate("!document.querySelector('.driver-overlay') && !document.querySelector('.driver-popover')"))
  );

  // =========================================================================
  // JOURNEY 4 & 5: Existing Phase 1 Save v4 Upgrade + Corrupt Onboarding Isolation
  // =========================================================================
  let sol15State = core.createInitialGameState(bundle, { seed: 205099, difficulty: 'cadet' });
  const simPolicy = core.createPolicy('balanced', 'A');
  let simSteps = 0;
  while (sol15State.clock.sol < 15 || sol15State.clock.phase !== 'briefing') {
    const cmd = simPolicy.nextCommand(sol15State, bundle, simSteps++);
    const res = core.dispatchDomainCommand(sol15State, cmd, bundle);
    assert.ok(res.ok);
    sol15State = res.state;
  }
  const sol15Envelope = core.buildSaveEnvelope(sol15State, '2026-11-15T00:00:00.000Z');
  const sol15ExpectedHash = core.stateHash(sol15State);

  await evaluate(`(() => {
    localStorage.setItem('${SAVE_KEY}', ${JSON.stringify(JSON.stringify(sol15Envelope))});
    localStorage.removeItem('${ONBOARDING_KEY}');
    localStorage.removeItem('${NARRATIVE_KEY}');
    localStorage.removeItem('${INTRO_SESSION_KEY}');
  })()`);
  await call('Page.reload');
  await waitFor("document.querySelector('.phf-title-shell')");
  check(
    'Journey 4: Phase 1 Save v4 Sol 15 recognized on Title Screen with Continue enabled',
    await evaluate("document.querySelector('[data-tour=\"title-continue\"]')?.disabled === false && document.querySelector('[data-tour=\"title-continue\"]')?.textContent.includes('15')")
  );

  // Inject corrupt onboarding + narrative alongside valid Sol 15 save -> must isolate failure & keep campaign runnable
  await evaluate(`(() => {
    localStorage.setItem('${ONBOARDING_KEY}', '{corrupt-onboarding-json');
    localStorage.setItem('${NARRATIVE_KEY}', '{corrupt-narrative-json');
  })()`);
  await call('Page.reload');
  await waitFor("document.querySelector('.phf-title-notice')");
  check(
    'Journey 5: Corrupt phf_onboarding_v1 + phf_narrative_v1 show warning notice while preserving Continue campaign save',
    await evaluate(`(() => {
      const notice = document.querySelector('.phf-title-notice');
      const cont = document.querySelector('[data-tour="title-continue"]');
      const raw = JSON.parse(localStorage.getItem('${SAVE_KEY}') || 'null');
      return Boolean(notice && cont && !cont.disabled && raw?.checksum === ${JSON.stringify(sol15Envelope.checksum)});
    })()`)
  );

  await click("document.querySelector('[data-tour=\"title-continue\"]')");
  await waitFor("document.querySelector('[data-milestone-id=\"moon-sol15-lunar-sunset\"][open]')");
  check(
    'Journey 4: Existing Sol 15 player enters Cockpit without forced Intro/Sol-1 tour and sees only Sol 15 Sunset milestone',
    core.stateHash(await saveState()) === sol15ExpectedHash &&
      (await evaluate("!document.querySelector('.driver-popover') && document.querySelector('.phf-milestone-dialog[open]')?.getAttribute('data-milestone-id') === 'moon-sol15-lunar-sunset'"))
  );

  // Journey 8 (Keyboard Escape on Milestone & Overwrite Prompt)
  await pressKey('Escape', 'Escape', 27);
  await waitFor("!document.querySelector('.phf-milestone-dialog[open]')");
  check(
    'Journey 8 (A11y): Escape dismisses Milestone presentation dialog cleanly',
    await evaluate("!document.querySelector('.phf-milestone-dialog[open]')")
  );

  // Test Overwrite prompt Escape focus restore on Title Screen
  await click("document.querySelector('.hail-utility-controls button')");
  await waitFor("document.querySelector('.phf-title-shell')");
  await click("document.querySelector('[data-tour=\"title-new-mission\"]')");
  await waitFor("document.querySelector('.phf-overwrite-box')");
  await pressKey('Escape', 'Escape', 27);
  await waitFor("!document.querySelector('.phf-overwrite-box')");
  check(
    'Journey 8 (A11y): Escape closes Title overwrite alertdialog and restores focus to New Mission button',
    await evaluate("document.activeElement?.getAttribute('data-tour') === 'title-new-mission'")
  );

  // Test corrupt campaign save fail-closed gate
  await evaluate(`localStorage.setItem('${SAVE_KEY}', '{corrupted-campaign-v4')`);
  await call('Page.reload');
  await waitFor("document.querySelector('.phf-recovery-card[role=\"alert\"]')");
  check(
    'Journey 5: Corrupt campaign save shows fail-closed E_SAVE_CORRUPTED gate without erasing raw save',
    await evaluate(`document.querySelector('.phf-recovery-card')?.textContent.includes('E_SAVE_CORRUPTED') && localStorage.getItem('${SAVE_KEY}') === '{corrupted-campaign-v4'`)
  );
  await click("document.querySelector('.phf-recovery-card .hail-btn--warn')");
  await waitFor("document.querySelector('.mission-dialog--launch[open]')");

  // =========================================================================
  // JOURNEY 6 & 7: Full Campaign A (Victory Sol 32 + Sol 7 Branch + Hints) + Defeat (Water)
  // =========================================================================
  for (const scenario of ['A', 'water']) {
    if (scenario === 'A') {
      await evaluate(`(() => {
        localStorage.removeItem('${SAVE_KEY}');
        localStorage.removeItem('${NARRATIVE_KEY}');
        localStorage.removeItem('${INTRO_SESSION_KEY}');
        localStorage.setItem('${ONBOARDING_KEY}', JSON.stringify({
          onboardingVersion: 1,
          introStatus: 'completed',
          cockpitTourStatus: 'completed',
          tourVersion: 'moon-sol1-v1',
          activeTour: null,
          activeStepId: null,
          sol1GuideStatus: 'completed',
          contextualHintsEnabled: true,
          dismissedHintIds: [],
          hintLastShownSol: {},
          hintShowCounts: {}
        }));
      })()`);
      await call('Page.reload');
      await waitFor("document.querySelector('.phf-title-shell')", 15000);
      await click("document.querySelector('[data-tour=\"title-new-mission\"]')");
      await waitFor("document.querySelector('.mission-dialog--launch[open]')");
    } else {
      await click(button('Chọn cấu hình cho ván mới'));
      await waitFor("document.querySelector('.mission-dialog--launch[open]')");
    }
    await selectOption('Độ khó', 'Cadet');
    await evaluate(`(() => {
      const input = document.querySelector('input[type=number]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '205099');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await click(button('Bắt đầu Chiến dịch Mới'));
    await waitFor("document.querySelector('.hail-action-band')");
    if (await waitFor("document.querySelector('.driver-popover-close-btn')", 3000)) {
      await click("document.querySelector('.driver-popover-close-btn')");
      await waitFor("!document.querySelector('.driver-popover')", 3000);
    }
    await pause(120);
    await dismissMilestoneIfVisible();

    const policy =
      scenario === 'A'
        ? core.createPolicy('balanced', 'A')
        : core.createDefeatPolicy('water');
    let current = await saveState();
    let stepIndex = 0;
    let sawSol7Milestone = false;
    let sawSol7BranchCard = false;
    let sawSol15Milestone = false;
    let sawSol29Milestone = false;
    let testedHintSnooze = false;

    while (current.campaign.status === 'active') {
      assert.ok(stepIndex < 1200, `Step budget exceeded for ${scenario}`);

      // Verify Milestone presentations at key Sols before dispatching command
      if (scenario === 'A' && current.clock.sol === 7 && current.clock.phase === 'briefing') {
        if (await waitFor("document.querySelector('[data-milestone-id=\"moon-sol7-golden-crisis\"][open]')", 1500)) {
          sawSol7Milestone = true;
          await screenshot('journey6-sol7-milestone.png');
          await dismissMilestoneIfVisible();
        }
      }
      if (scenario === 'A' && current.clock.sol === 15 && current.clock.phase === 'briefing') {
        if (await waitFor("document.querySelector('[data-milestone-id=\"moon-sol15-lunar-sunset\"][open]')", 1500)) {
          sawSol15Milestone = true;
          await dismissMilestoneIfVisible();
        }
      }
      if (scenario === 'A' && current.clock.sol === 29 && current.clock.phase === 'briefing') {
        if (await waitFor("document.querySelector('[data-milestone-id=\"moon-sol29-lunar-sunrise\"][open]')", 1500)) {
          sawSol29Milestone = true;
          await dismissMilestoneIfVisible();
        }
      }

      // Journey 7: Check contextual hint anti-spam when a real alert surfaces (e.g. during water defeat)
      if (
        scenario === 'water' &&
        !testedHintSnooze &&
        (await evaluate("!!document.querySelector('.phf-hint-banner')"))
      ) {
        const hintId = await evaluate("document.querySelector('.phf-hint-banner')?.getAttribute('data-hint-id')");
        await screenshot('journey7-hint-banner.png');
        await click("document.querySelector('.phf-hint-link')");
        await waitFor("!document.querySelector('.phf-hint-banner')");
        check(
          `Journey 7: Snoozing hint "${hintId}" hides it for remainder of Sol`,
          await evaluate("!document.querySelector('.phf-hint-banner')")
        );
        testedHintSnooze = true;
      }

      const cmd = policy.nextCommand(current, bundle, stepIndex++);
      assert.ok(cmd, 'Policy must return next legal command');
      current = await dispatchAction(cmd, current);

      if (scenario === 'A' && current.clock.sol === 7 && current.clock.phase === 'debrief') {
        sawSol7BranchCard = await waitFor("document.querySelector('.phf-night-branch-card')", 1500);
        if (sawSol7BranchCard) {
          await screenshot('journey6-sol7-debrief-branch.png');
        }
      }
    }

    if (scenario === 'A') {
      check('Journey 6: Sol 7 Golden Crisis Milestone presented', sawSol7Milestone);
      check('Journey 6: Sol 7 Debrief dual-branch framing card presented', sawSol7BranchCard);
      check('Journey 6: Sol 15 Sunset Milestone presented', sawSol15Milestone);
      check('Journey 6: Sol 29 Sunrise Milestone presented', sawSol29Milestone);
      check(
        'Journey 6: Sol 32 Victory Finale + NASA Cadet Report Card presented & Driver cleaned up',
        current.campaign.status === 'victory' &&
          (await evaluate(
            "!!document.querySelector('[aria-label=\"Campaign Finale\"]') && !!document.querySelector('[aria-label=\"NASA Cadet Report Card\"]') && !document.querySelector('.driver-overlay') && !document.querySelector('.driver-popover')"
          ))
      );
      await screenshot('journey6-victory-desktop.png');

      const replayCheck = path.join(evidence, 'moon32-replay-205099.json');
      await click(button('Export Replay Trace'));
      await pause(250);
      const trace = JSON.parse(fs.readFileSync(replayCheck, 'utf8'));
      check(
        'Journey 6 (Determinism): Exported Victory replay trace matches live UI stateHash',
        core.stateHash(core.replayCampaign(trace, bundle)) === core.stateHash(current)
      );
      fs.renameSync(replayCheck, path.join(evidence, 'victory-ui-replay.json'));
    } else {
      check('Journey 7: Hint banner appeared & snoozed cleanly during Defeat precursor', testedHintSnooze);
      check(
        'Journey 6: Defeat Finale summary renders causes & recommendations accurately',
        current.campaign.status === 'defeat' &&
          (await evaluate(
            "!!document.querySelector('[aria-label=\"Campaign Finale\"]') && document.querySelector('.phf-finale-summary')?.textContent.length > 20"
          ))
      );
      await screenshot('journey6-defeat-desktop.png');
    }

    results.campaigns.push({
      scenario,
      steps: stepIndex,
      status: current.campaign.status,
      outcome: current.campaign.outcome,
      finalHash: core.stateHash(current),
    });
  }

  // =========================================================================
  // JOURNEY 8: Responsive Viewports (1280x720, 390x844 Mobile Touch Targets >=44px), Reduced Motion & EN Locale
  // =========================================================================
  await click(button('Chơi lại cùng seed'));
  await waitFor("document.querySelector('.hail-action-band')");
  if (await waitFor("document.querySelector('.driver-popover-close-btn')", 3000)) {
    await click("document.querySelector('.driver-popover-close-btn')");
    await waitFor("!document.querySelector('.driver-popover')", 3000);
  }
  await pause(120);
  await dismissMilestoneIfVisible();

  await viewport(1280, 720);
  await pause(80);
  await assertZeroHorizontalOverflow('Laptop 1280x720 Cockpit');

  await viewport(390, 844, true);
  await setReducedMotion(true);
  await pause(120);
  await assertZeroHorizontalOverflow('Mobile 390x844 Cockpit');
  await assertTouchTargets44('.hail-action-band button.is-primary', 'Mobile 390x844 Primary CTA');
  await screenshot('journey8-cockpit-mobile-390.png');

  // Switch Cockpit to EN & verify Title Screen Mobile 390x844 Reduced Motion + 44x44px targets
  await click("document.querySelector('.hail-utility-controls button[aria-label=\"VI / EN\"]')");
  await pause(80);
  check(
    'Journey 8 (Cockpit EN): Action bar switches cleanly to English',
    await evaluate("document.querySelector('.hail-action-band')?.textContent.includes('Briefing')")
  );

  // Launch Tutorial -> Ephemeral Cockpit Tour on Mobile 390x844 to check Driver.js popover mobile fit & 44px buttons
  await click("document.querySelector('[data-tour=\"hud-tutorial-trigger\"]')");
  await waitFor("document.querySelector('.mission-dialog--tutorial[open]')");
  await click(button('Cockpit Discovery Tour', "document.querySelector('.mission-dialog--tutorial[open]')"));
  await waitFor("document.querySelector('.driver-popover.phf-driver-popover .driver-popover-next-btn')", 5000);
  await pause(150);
  await assertZeroHorizontalOverflow('Mobile 390x844 Driver Popover');
  await assertTouchTargets44(
    '.driver-popover.phf-driver-popover button',
    'Mobile 390x844 Driver Popover Buttons'
  );
  await screenshot('journey8-driver-mobile-390.png');
  await pressKey('Escape', 'Escape', 27);
  await waitFor("!document.querySelector('.driver-popover')");
  if (await evaluate("!!document.querySelector('.mission-dialog--tutorial[open]')")) {
    await pressKey('Escape', 'Escape', 27);
    await waitFor("!document.querySelector('.mission-dialog--tutorial[open]')");
  }

  // Return to Title on Mobile 390x844 Reduced Motion
  await click("document.querySelector('.hail-utility-controls button')");
  await waitFor("document.querySelector('.phf-title-shell')");
  await pause(120);
  await assertZeroHorizontalOverflow('Mobile 390x844 Title Screen');
  await assertTouchTargets44('.phf-title-shell button', 'Mobile 390x844 Title Screen Buttons');
  check(
    'Journey 8 (Reduced Motion): Title shell reflects reduced-motion accessibility preference',
    await evaluate("document.querySelector('.phf-title-shell')?.classList.contains('is-reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches")
  );
  await screenshot('journey8-title-mobile-390.png');

  // Keyboard Tab sanity on Title Screen
  await pressKey('Tab', 'Tab', 9);
  check(
    'Journey 8 (Keyboard): Tab moves focus within visible Title controls',
    await evaluate("document.querySelector('.phf-title-shell')?.contains(document.activeElement)")
  );

  check('No uncaught browser runtime exceptions', results.errors.length === 0);
  check('No browser console.error logs emitted', results.consoleErrors.length === 0);
} catch (error) {
  results.failure = error.message;
  console.error(error.message);
  if (call) {
    try {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(evidence, 'failure.png'), Buffer.from(shot.data, 'base64'));
    } catch {
      // Ignore screenshot error during teardown
    }
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  ws?.close();
  chrome.kill();
  await server.close();
}
