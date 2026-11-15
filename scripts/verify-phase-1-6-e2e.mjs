import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { loadSimulation, simulationRoot as root } from './load-simulation.mjs';

const evidence = path.join(root, 'reports/phase-1-6/browser');
fs.mkdirSync(evidence, { recursive: true });

const server = await createServer({
  root,
  cacheDir: path.join(os.tmpdir(), `phase16-vite-${process.pid}`),
  server: { host: '127.0.0.1', port: 5196, strictPort: true, hmr: false },
});
await server.listen();

const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=9246',
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'phase16-ui-'))}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' }
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const core = await loadSimulation();
const bundle = core.loadContentBundle();
const results = {
  phase: '1.6',
  method: 'Option B 5-flow E2E via live Vite + Chrome CDP (Desktop 1440x900, Laptop 1280x720, Mobile 390x844, VI & EN, Corrupt Save Recovery, Keyboard a11y).',
  contentHash: core.contentHash(bundle),
  checks: [],
  errors: [],
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
      pages = await (await fetch('http://127.0.0.1:9246/json/list')).json();
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
  });

  call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      const timer = setTimeout(() => {
        pending.delete(next);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20000);
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
    await pause(35);
  };

  const button = (text, scope = 'document') =>
    `[...(${scope}).querySelectorAll('button')].find(el => el.textContent.includes(${JSON.stringify(text)}))`;
  const screenshot = async (name) => {
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(shot.data, 'base64'));
    results.screenshots.push(name);
  };
  const state = () =>
    evaluate("JSON.parse(localStorage.getItem('human-frontier:moon32:save-v1') || 'null')?.state");
  const viewport = (width, height, mobile = false) =>
    call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

  const close = async () => {
    if (await evaluate('!!document.querySelector(".mission-dialog[open]")')) {
      await click(
        "document.querySelector('.mission-dialog[open] button.hail-close-btn, .mission-dialog[open] button.hail-tactile-corner-close')"
      );
    }
  };

  const waitFor = async (expression, timeoutMs = 4000) => {
    const startMs = Date.now();
    while (Date.now() - startMs < timeoutMs) {
      if (await evaluate(`Boolean(${expression})`)) return true;
      await pause(30);
    }
    return false;
  };

  const open = async (type, text) => {
    if (await evaluate(`!!document.querySelector('.mission-dialog--${type}[open]')`)) return;
    await close();
    await click(button(text, "document.querySelector('.hail-action-band')"));
    await waitFor(`document.querySelector('.mission-dialog--${type}[open]')`);
  };

  const select = async (label, text) => {
    await click(
      `[...document.querySelectorAll('.hail-select-field')].find(el => el.querySelector('.hail-select-label')?.textContent.includes(${JSON.stringify(label)})).querySelector('button')`
    );
    await click(
      `[...document.querySelectorAll('[role="option"]')].find(el => el.textContent.includes(${JSON.stringify(text)}))`
    );
  };

  const pressKey = async (key, code, windowsVirtualKeyCode) => {
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode,
    });
    await pause(45);
  };

  const assertSingleRowActionBar = async (label) => {
    const metrics = await evaluate(`(() => {
      const band = document.querySelector('.hail-action-band');
      if (!band) return null;
      const buttons = [...band.querySelectorAll('button')];
      const tops = buttons.map(b => Math.round(b.getBoundingClientRect().top));
      const primary = band.querySelector('button.is-primary');
      const primaryRect = primary ? primary.getBoundingClientRect() : null;
      return {
        buttonCount: buttons.length,
        minTop: Math.min(...tops),
        maxTop: Math.max(...tops),
        primaryHeight: primaryRect ? Math.round(primaryRect.height) : 0,
        bandScrollHeight: band.scrollHeight,
        bandClientHeight: band.clientHeight,
      };
    })()`);
    check(
      `${label}: bottom action band stays on 1 horizontal row without wrapping`,
      metrics && metrics.buttonCount === 10 && metrics.maxTop - metrics.minTop <= 4 && metrics.primaryHeight <= 46
    );
  };

  const start = async (seed = 205099) => {
    if ((await state())?.campaign.status === 'victory' || (await state())?.campaign.status === 'defeat') {
      await click(button('Chọn cấu hình cho ván mới'));
    } else {
      await open('launch', 'Chiến dịch');
    }
    await select('Độ khó', 'Cadet');
    await evaluate(`(() => {
      const input = document.querySelector('input[type=number]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${seed}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await click(button('Bắt đầu Chiến dịch Mới'));
    const fresh = await state();
    check(
      `Flow 1: Clean Sol 1 start with seed ${seed}`,
      fresh.clock.sol === 1 &&
        fresh.campaign.seed === seed &&
        fresh.rover.missionHistory.length === 0 &&
        fresh.history.summaries.length === 0
    );
  };

  const action = async (command, current) => {
    if (command.type === 'phase/advance') {
      await close();
      await click("document.querySelector('.hail-action-band button.is-primary')");
    } else if (command.type === 'event/resolve') {
      await open('starlog', 'Giao ban');
      const label = bundle.events
        .find((event) => event.id === command.eventId)
        .choices.find((choice) => choice.id === command.choiceId).label;
      await waitFor("document.querySelector('button.hail-sq-push-btn')");
      await click(
        `[...document.querySelectorAll('button.hail-sq-push-btn')].find(el => (el.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`
      );
    } else if (command.type === 'crew/assign' && ['repair-system', 'upgrade-system'].includes(command.task)) {
      await open('menu', 'Hệ thống');
      const index = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'].indexOf(command.targetSystemId);
      await click(button(command.task === 'repair-system' ? 'Sửa (' : 'Nâng (', `document.querySelectorAll('.hail-sys-card')[${index}]`));
    } else if (command.type === 'crew/assign' && command.task === 'rest') {
      await open('character', 'Crew');
      await click(
        button(
          'Nghỉ',
          `document.querySelector('.mission-dialog img[alt="${current.crew[command.crewId].name}"]').closest('div.p-3')`
        )
      );
    } else if (command.type === 'crew/use-medkit') {
      await open('character', 'Crew');
      await select('Người nhận Medkit', current.crew[command.targetCrewId].name);
      await click(button('Tự dùng'));
    } else if (command.type === 'fabricator/queue') {
      await open('crafting', '3D Fab');
      const name = bundle.recipes.items.find((recipe) => recipe.id === command.itemId).name;
      await click(
        button(
          'In',
          `[...document.querySelectorAll('.mission-dialog strong')].find(el => el.textContent === ${JSON.stringify(name)}).closest('div.p-3')`
        )
      );
    } else if (command.type === 'comms/order-cargo') {
      await open('comms', 'CAPCOM');
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
      await open('expedition', 'Rover');
      const expedition = bundle.campaign.expeditions.find((entry) => entry.id === command.expeditionId);
      await click(button(expedition.name, "document.querySelector('.hail-site-tabs')"));
      for (const equipment of command.equipmentIds) {
        await click(
          `[...document.querySelectorAll('.mission-dialog button')].find(el => el.dataset.equipmentId === ${JSON.stringify(equipment)} || el.textContent.includes(${JSON.stringify(equipment + ' (')}))`
        );
      }
      await click(button('Lập lịch Rover tới'));
    } else if (command.type === 'rover/recover-signal') {
      await open('expedition', 'Rover');
      await click(button('Khôi phục tín hiệu'));
    } else if (command.type === 'rationing/set-wrs') {
      await open('end', 'End-Sol');
      await click("document.querySelector('.hail-alloc-sys-check')");
    } else if (command.type === 'rationing/toggle-mre') {
      await open('end', 'End-Sol');
      await click(
        `document.querySelectorAll('.hail-alloc-check-btn')[${['cmd', 'eng', 'doc', 'geo'].indexOf(command.crewId)}]`
      );
    } else if (command.type === 'sol/end') {
      await open('end', 'End-Sol');
      await click("document.querySelector('.hail-lever-btn')");
    } else if (command.type === 'debrief/dismiss') {
      await waitFor("[...document.querySelectorAll('button')].some(el => el.textContent.includes('Thức dậy vào Sol'))");
      await click(button('Thức dậy vào Sol'));
    } else {
      throw new Error(`No UI mapping for ${JSON.stringify(command)}`);
    }
    const changed = await waitFor(
      `((JSON.parse(localStorage.getItem('human-frontier:moon32:save-v1') || 'null')?.state?.revision) ?? 0) > ${current.revision}`,
      5000
    );
    const next = await state();
    assert.ok(
      changed && next.revision > current.revision,
      `UI accepted ${JSON.stringify(command)} at Sol ${current.clock.sol}/${current.clock.phase}: revision ${current.revision} -> ${next.revision}`
    );
    return next;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidence });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  // Flow 1 + Flow 5 (Desktop 1440x900 + Laptop 1280x720 single-row + VI/EN + About + Keyboard HailSelect/Esc)
  await viewport(1440, 900);
  await call('Page.navigate', { url: 'http://127.0.0.1:5196' });
  for (let i = 0; i < 120 && !(await evaluate("!!document.querySelector('.hail-action-band')")); i++) {
    await pause(200);
  }

  await assertSingleRowActionBar('Desktop 1440px VI');
  await viewport(1280, 720);
  await pause(80);
  await assertSingleRowActionBar('Laptop 1280px VI');

  await click("document.querySelector('.hail-utility-controls button[aria-label=\"VI / EN\"]')");
  await pause(60);
  await assertSingleRowActionBar('Laptop 1280px EN');
  check(
    'Flow 1 (EN): HUD and bottom bar phase hint localize to English cleanly',
    await evaluate(`(() => {
      const band = document.querySelector('.hail-action-band')?.textContent ?? '';
      const hint = document.querySelector('.hail-phase-hint')?.textContent ?? '';
      return band.includes('Briefing') && band.includes('Credits') && !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(hint);
    })()`)
  );
  await screenshot('desktop-1280-en-cockpit.png');

  // Open About / Credits modal in EN, check focus inside dialog & Escape focus restore
  await click(button('Credits', "document.querySelector('.hail-action-band')"));
  await waitFor("document.querySelector('.mission-dialog--about[open]')");
  await pause(60);
  check(
    'Flow 5 (A11y): About/Credits dialog opens, receives focus, and sets aria-modal',
    await evaluate(`(() => {
      const dlg = document.querySelector('.mission-dialog--about[open]');
      return Boolean(dlg && dlg.getAttribute('aria-modal') === 'true' && dlg.contains(document.activeElement));
    })()`)
  );
  await pressKey('Escape', 'Escape', 27);
  check(
    'Flow 5 (A11y): Escape closes About dialog and restores focus to Credits trigger',
    await evaluate("!document.querySelector('.mission-dialog[open]') && document.activeElement?.textContent?.includes('Credits')")
  );

  // Switch back to VI for deterministic simulation policy & verify HailSelect keyboard (ArrowDown + Enter)
  await viewport(1440, 900);
  await click("document.querySelector('.hail-utility-controls button[aria-label=\"VI / EN\"]')");
  await open('launch', 'Chiến dịch');
  await click("document.querySelector('.hail-select-trigger')");
  await pressKey('ArrowDown', 'ArrowDown', 40);
  check(
    'Flow 5 (A11y): HailSelect exposes aria-activedescendant during ArrowDown navigation',
    await evaluate("Boolean(document.querySelector('.hail-select-trigger')?.getAttribute('aria-activedescendant'))")
  );
  await pressKey('Enter', 'Enter', 13);
  check(
    'Flow 5 (A11y): HailSelect commits option on Enter and collapses listbox',
    await evaluate("document.querySelector('.hail-select-trigger')?.getAttribute('aria-expanded') === 'false'")
  );
  await close();

  // Flow 4: Corrupt Save Fail-Closed Recovery (inject corrupted localStorage, reload, export, reset)
  const corruptPayload = '{corrupted-save-payload-phase-1-6';
  await evaluate(`localStorage.setItem('human-frontier:moon32:save-v1', ${JSON.stringify(corruptPayload)})`);
  await call('Page.reload');
  for (let i = 0; i < 60 && !(await evaluate("!!document.querySelector('[role=\"alert\"]')")); i++) {
    await pause(150);
  }
  check(
    'Flow 4 (Recovery): Corrupt save triggers fail-closed banner and preserves raw bytes',
    await evaluate(`(() => {
      const alert = document.querySelector('[role="alert"]')?.textContent ?? '';
      const stored = localStorage.getItem('human-frontier:moon32:save-v1');
      return alert.includes('E_SAVE_CORRUPTED') && stored === ${JSON.stringify(corruptPayload)};
    })()`)
  );
  await screenshot('corrupt-save-recovery-banner.png');
  await click(button('Tạo Chiến dịch Mới', "document.querySelector('[role=\"alert\"]')"));
  await waitFor("!document.querySelector('[role=\"alert\"]')");
  check(
    'Flow 4 (Recovery): Reset from recovery banner clears alert and boots clean Sol 1 state',
    await evaluate("!document.querySelector('[role=\"alert\"]') && JSON.parse(localStorage.getItem('human-frontier:moon32:save-v1')).state.clock.sol === 1")
  );

  // Flow 2 & Flow 3: Campaign Walkthrough (A victory + water defeat), Mid-Campaign Save/Reload across phases, Training Report & Mobile 390x844
  for (const scenario of ['A', 'water']) {
    await start(205099);
    const policy =
      scenario === 'A'
        ? core.createPolicy('balanced', scenario)
        : core.createDefeatPolicy(scenario);
    let current = await state();
    let steps = 0;
    let reloaded = false;
    while (current.campaign.status === 'active') {
      assert.ok(steps < 1200, 'Browser action budget');
      const command = policy.nextCommand(current, bundle, steps++);
      assert.ok(command, 'Policy has a legal next action');
      current = await action(command, current);
      if (
        scenario === 'A' &&
        !reloaded &&
        current.clock.sol === 15 &&
        current.clock.phase === 'rationing'
      ) {
        const hash = core.stateHash(current);
        await close();
        await call('Page.reload');
        await pause(1200);
        current = await state();
        check('Flow 3: Lunar Night Sol 15 reload preserves exact stateHash', core.stateHash(current) === hash);
        reloaded = true;
      }
      if (scenario === 'A' && current.clock.sol === bundle.campaign.training.reportSol && current.clock.phase === 'debrief') {
        check(
          'Flow 2: Sol 12 training debrief renders accurately',
          await evaluate("document.querySelector('[aria-label=\"Training Report\"]')?.textContent.includes('Đạt')")
        );
      }
    }

    const expected = scenario === 'A' ? 'victory' : 'defeat';
    check(
      `Flow 2 (${scenario}): Terminal report renders ${expected}`,
      current.campaign.status === expected &&
        (await evaluate("!!document.querySelector('[aria-label=\"NASA Cadet Report Card\"]')"))
    );
    await screenshot(`terminal-${scenario}-desktop.png`);

    if (scenario === 'A') {
      await viewport(390, 844, true);
      await pause(150);
      check(
        'Flow 5 (Mobile 390x844): Terminal report has zero horizontal overflow & >= 44px CTA touch target',
        await evaluate(`(() => {
          const dlg = document.querySelector('.hail-night-cutscene');
          const btn = dlg?.querySelector('.night-actions button');
          const rect = btn?.getBoundingClientRect();
          return dlg && dlg.getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth && rect && rect.height >= 44;
        })()`)
      );
      await screenshot('terminal-A-mobile-390.png');
      await pressKey('Tab', 'Tab', 9);
      check(
        'Flow 5 (A11y): Keyboard Tab keeps focus within terminal dialog',
        await evaluate("document.querySelector('.hail-night-cutscene')?.contains(document.activeElement)")
      );
      await viewport(1440, 900);
    }

    await click(button('Export Replay Trace'));
    await click(button('Export Save Snapshot'));
    await pause(250);
    const trace = JSON.parse(fs.readFileSync(path.join(evidence, 'moon32-replay-205099.json'), 'utf8'));
    check(
      `Flow 3 (${scenario}): Exported replay verifies UI final hash`,
      core.stateHash(core.replayCampaign(trace, bundle)) === core.stateHash(current)
    );
    fs.renameSync(
      path.join(evidence, 'moon32-replay-205099.json'),
      path.join(evidence, `${scenario}-ui-replay.json`)
    );
    results.campaigns.push({
      scenario,
      steps,
      outcome: current.campaign.outcome,
      finalHash: core.stateHash(current),
    });
  }

  // Verify cockpit on Mobile 390x844 has zero horizontal overflow & >= 44px primary CTA
  await click(button('Chơi lại cùng seed'));
  await pause(120);
  await viewport(390, 844, true);
  await pause(150);
  check(
    'Flow 5 (Mobile 390x844): Cockpit has zero horizontal overflow & 44px primary button',
    await evaluate(`(() => {
      const btn = document.querySelector('.hail-action-band button.is-primary');
      return document.documentElement.scrollWidth <= innerWidth && btn && btn.getBoundingClientRect().height >= 44;
    })()`)
  );
  await screenshot('cockpit-mobile-390.png');

  check('No uncaught browser runtime exceptions', results.errors.length === 0);
} catch (error) {
  results.failure = error.message;
  console.error(error.message);
  if (call) {
    try {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(evidence, 'failure.png'), Buffer.from(shot.data, 'base64'));
    } catch {
      // Ignore failure screenshot capture error
    }
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  ws?.close();
  chrome.kill();
  await server.close();
}
