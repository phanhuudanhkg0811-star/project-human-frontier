import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { loadSimulation, simulationRoot as root } from './load-simulation.mjs';

const evidence = path.join(root, 'reports/phase-1-4/browser');
fs.mkdirSync(evidence, { recursive: true });
const server = await createServer({ root, cacheDir: path.join(os.tmpdir(), `phase14-vite-${process.pid}`), server: { host: '127.0.0.1', port: 5194, strictPort: true, hmr: false } });
await server.listen();
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9244',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-ui-'))}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const core = await loadSimulation();
const bundle = core.loadContentBundle();
const results = { method: 'All campaign actions use rendered UI buttons, with read-only localStorage snapshots. No state injection or store.dispatch from DevTools.', contentHash: core.contentHash(bundle), checks: [], errors: [], screenshots: [], campaigns: [] };
let ws;
let call;
let evaluate;
try {
  let pages;
  for (let i = 0; i < 60; i++) { try { pages = await (await fetch('http://127.0.0.1:9244/json/list')).json(); if (pages.length) break; } catch {} await pause(200); }
  assert.ok(pages?.length, 'Chrome is available (override CHROME_PATH on other machines)');
  ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') results.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(next, (message) => { clearTimeout(timer); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result); });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  const check = (name, value) => { assert.ok(value, name); results.checks.push(name); console.log(`PASS ${name}`); };
  const click = async (expression) => {
    try { await evaluate(`(() => { const el = ${expression}; if (!el || el.disabled) throw Error('Missing or disabled control: ' + ${JSON.stringify(expression)}); el.scrollIntoView({block:'center'}); el.focus(); el.click(); })()`); }
    catch (error) { throw new Error(`${error.message}\nSelector: ${expression}`); }
    await pause(35);
  };
  const button = (text, scope = 'document') => `[...(${scope}).querySelectorAll('button')].find(el => el.textContent.includes(${JSON.stringify(text)}))`;
  const screenshot = async (name) => { const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(evidence, name), Buffer.from(shot.data, 'base64')); results.screenshots.push(name); };
  const state = () => evaluate("JSON.parse(localStorage.getItem('human-frontier:moon32:save-v1') || 'null')?.state");
  const viewport = (width, height, mobile = false) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const close = async () => { if (await evaluate('!!document.querySelector(".mission-dialog[open]")')) await click(`document.querySelector('.mission-dialog[open] button[aria-label="Đóng cửa sổ"]')`); };
  const open = async (type, text) => {
    if (await evaluate(`!!document.querySelector('.mission-dialog--${type}[open]')`)) return;
    await close();
    await click(button(text, "document.querySelector('.hail-action-band')"));
  };
  const select = async (label, text) => {
    await click(`[...document.querySelectorAll('.hail-select-field')].find(el => el.querySelector('.hail-select-label')?.textContent.includes(${JSON.stringify(label)})).querySelector('button')`);
    await click(`[...document.querySelectorAll('[role="option"]')].find(el => el.textContent.includes(${JSON.stringify(text)}))`);
  };
  const start = async () => {
    if ((await state())?.campaign.status === 'victory' || (await state())?.campaign.status === 'defeat') await click(button('Chọn cấu hình cho ván mới'));
    else await open('launch', 'Chiến dịch');
    await select('Độ khó', 'Cadet');
    await evaluate("(() => { const input = document.querySelector('input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'205099'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await click(button('Bắt đầu Chiến dịch Mới'));
    const fresh = await state();
    check('New mission is clean Sol 1 with requested seed', fresh.clock.sol === 1 && fresh.campaign.seed === 205099 && fresh.rover.missionHistory.length === 0 && fresh.history.summaries.length === 0);
  };
  const action = async (command, current) => {
    if (command.type === 'phase/advance') { await close(); await click("document.querySelector('.hail-action-band button.is-primary')"); }
    else if (command.type === 'event/resolve') {
      await open('starlog', 'Giao ban');
      const label = bundle.events.find((event) => event.id === command.eventId).choices.find((choice) => choice.id === command.choiceId).label;
      await click(button(label, "document.querySelector('.hail-event-choice')?.parentElement ?? document"));
    } else if (command.type === 'crew/assign' && ['repair-system', 'upgrade-system'].includes(command.task)) {
      await open('menu', 'Hệ thống');
      const index = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'].indexOf(command.targetSystemId);
      await click(button(command.task === 'repair-system' ? 'Sửa (' : 'Nâng (', `document.querySelectorAll('.hail-sys-card')[${index}]`));
    } else if (command.type === 'crew/assign' && command.task === 'rest') {
      await open('character', 'Crew');
      await click(button('Nghỉ', `document.querySelector('.mission-dialog img[alt="${current.crew[command.crewId].name}"]').closest('div.p-3')`));
    } else if (command.type === 'crew/use-medkit') {
      await open('character', 'Crew'); await select('Người nhận Medkit', current.crew[command.targetCrewId].name); await click(button('Tự dùng'));
    } else if (command.type === 'fabricator/queue') {
      await open('crafting', '3D Fab');
      const name = bundle.recipes.items.find((recipe) => recipe.id === command.itemId).name;
      await click(button('In', `[...document.querySelectorAll('.mission-dialog strong')].find(el => el.textContent === ${JSON.stringify(name)}).closest('div.p-3')`));
    } else if (command.type === 'comms/order-cargo') {
      await open('comms', 'CAPCOM');
      for (const pack of bundle.balance.logistics.packs) {
        const row = `[...document.querySelectorAll('.mission-dialog div')].find(el => el.textContent === ${JSON.stringify(pack.name)}).parentElement.parentElement`;
        for (let i = 0; i < 4; i++) { const minus = `[...(${row}).querySelectorAll('button')].find(el => el.textContent === '-')`; if (await evaluate(`!(${minus}).disabled`)) await click(minus); }
      }
      for (const pack of bundle.balance.logistics.packs) for (let i = 0; i < (command.slots[pack.id] ?? 0); i++) {
        const row = `[...document.querySelectorAll('.mission-dialog div')].find(el => el.textContent === ${JSON.stringify(pack.name)}).parentElement.parentElement`;
        await click(`[...(${row}).querySelectorAll('button')].find(el => el.textContent === '+')`);
      }
      await click(button('Phóng tàu hàng'));
    } else if (command.type === 'rover/schedule') {
      await open('expedition', 'Rover');
      const expedition = bundle.campaign.expeditions.find((entry) => entry.id === command.expeditionId);
      await click(button(expedition.name, "document.querySelector('.hail-site-tabs')"));
      for (const equipment of command.equipmentIds) await click(`[...document.querySelectorAll('.mission-dialog button')].find(el => el.textContent.includes(${JSON.stringify(equipment + ' (')}))`);
      await click(button('Lập lịch Rover tới'));
    } else if (command.type === 'rover/recover-signal') { await open('expedition', 'Rover'); await click(button('Khôi phục tín hiệu')); }
    else if (command.type === 'rationing/set-wrs') { await open('end', 'End-Sol'); await click(button('WRS:')); }
    else if (command.type === 'rationing/toggle-mre') { await open('end', 'End-Sol'); await click(`document.querySelectorAll('.hail-ration-crew-pill')[${['cmd', 'eng', 'doc', 'geo'].indexOf(command.crewId)}].querySelector('button')`); }
    else if (command.type === 'sol/end') { await open('end', 'End-Sol'); await click(button('Gạt cần Chốt Sol')); }
    else if (command.type === 'debrief/dismiss') await click(button('Thức dậy vào Sol'));
    else throw new Error(`No UI mapping for ${JSON.stringify(command)}`);
    const next = await state();
    assert.ok(next.revision > current.revision, `UI accepted ${JSON.stringify(command)} at Sol ${current.clock.sol}/${current.clock.phase}: revision ${current.revision} → ${next.revision}`);
    return next;
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidence });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await viewport(1440, 900);
  await call('Page.navigate', { url: 'http://127.0.0.1:5194' });
  for (let i = 0; i < 120 && !await evaluate("!!document.querySelector('.hail-action-band')"); i++) await pause(250);
  check('Phase 1.5 ambient canvas is mounted in the observation window', await evaluate("document.querySelector('.hail-ambient-canvas')?.width > 0 && document.querySelector('.hail-ambient-canvas')?.height > 0"));
  check('Phase 1.5 quick controls expose language, audio, and tutorial actions', await evaluate("document.querySelectorAll('.hail-utility-controls button').length === 3"));
  await click(`document.querySelector('.hail-utility-controls button[aria-label="VI / EN"]')`);
  check('Phase 1.5 switches the critical HUD to English', await evaluate("[...document.querySelectorAll('.hail-action-band button')].some(el => el.textContent.includes('Briefing')) && document.querySelector('.hail-telemetry')?.textContent.includes('Battery')"));
  await click(`document.querySelector('.hail-utility-controls button[aria-label="VI / EN"]')`);
  check('Phase 1.5 returns the critical HUD to Vietnamese', await evaluate("[...document.querySelectorAll('.hail-action-band button')].some(el => el.textContent.includes('Giao ban')) && document.querySelector('.hail-telemetry')?.textContent.includes('Pin')"));
  await click(`document.querySelector('.hail-utility-controls button[aria-label="Hướng dẫn (?)"]')`);
  check('Phase 1.5 tutorial opens only on request', await evaluate("!!document.querySelector('.mission-dialog--tutorial[open]')"));
  await close();
  await click(`document.querySelector('.hail-utility-controls button[aria-label="Tắt âm thanh"]')`);
  check('Phase 1.5 persists the muted audio preference', await evaluate("JSON.parse(localStorage.getItem('phf_ui_prefs_v1')).audioMuted === true"));
  await click(`document.querySelector('.hail-utility-controls button[aria-label="Bật âm thanh"]')`);
  for (const scenario of ['A', 'B', 'oxygen', 'water']) {
    await start();
    const policy = ['A', 'B'].includes(scenario) ? core.createPolicy('balanced', scenario) : core.createDefeatPolicy(scenario);
    let current = await state();
    let steps = 0;
    let reloaded = false;
    while (current.campaign.status === 'active') {
      assert.ok(steps < 1200, 'Browser action budget');
      const command = policy.nextCommand(current, bundle, steps++);
      assert.ok(command, 'Policy has a legal next action');
      current = await action(command, current);
      if (scenario === 'A' && current.clock.phase === 'debrief' && current.clock.sol === bundle.campaign.training.reportSol) {
        check('Training report appears after End-Sol 12 without terminating campaign', await evaluate("document.querySelector('[aria-label=\"Training Report\"]')?.textContent.includes('Đạt')"));
        await screenshot('training-sol12.png');
      }
      if (scenario === 'A' && [14, 28].includes(current.clock.sol) && current.clock.phase === 'debrief') await screenshot(`transition-sol${current.clock.sol}.png`);
      if (scenario === 'A' && !reloaded && current.clock.sol === 15 && current.clock.phase === 'rationing') {
        const hash = core.stateHash(current);
        await close(); await call('Page.reload'); await pause(1400);
        current = await state(); check('Lunar Night reload preserves exact state', core.stateHash(current) === hash);
        reloaded = true;
      }
    }
    const expected = scenario === 'A' || scenario === 'B' ? 'victory' : 'defeat';
    check(`${scenario}: terminal report renders correct outcome`, current.campaign.status === expected && await evaluate("!!document.querySelector('[aria-label=\"NASA Cadet Report Card\"]')"));
    await screenshot(`${scenario}-desktop-report.png`);
    if (scenario === 'A') {
      await viewport(390, 844, true); await pause(200);
      check('Mobile report has no horizontal overflow', await evaluate("document.querySelector('.hail-night-cutscene').getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth"));
      await screenshot('A-mobile-report.png');
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      check('Keyboard focus remains in terminal dialog', await evaluate("document.querySelector('.hail-night-cutscene').contains(document.activeElement)"));
      await viewport(1440, 900);
    }
    await click(button('Export Replay Trace')); await click(button('Export Save Snapshot')); await pause(300);
    const trace = JSON.parse(fs.readFileSync(path.join(evidence, 'moon32-replay-205099.json'), 'utf8'));
    check(`${scenario}: exported replay verifies the exact UI result`, core.stateHash(core.replayCampaign(trace, bundle)) === core.stateHash(current));
    fs.renameSync(path.join(evidence, 'moon32-replay-205099.json'), path.join(evidence, `${scenario}-ui-replay.json`));
    const saveName = path.join(evidence, `moon32-save-205099-sol${current.clock.sol}.json`);
    const raw = fs.readFileSync(saveName, 'utf8');
    const loaded = core.loadGameState(bundle, { getItem: () => raw, setItem() {}, removeItem() {} });
    check(`${scenario}: exported snapshot checksum and state match UI`, loaded.status === 'ok' && core.stateHash(loaded.state) === core.stateHash(current));
    fs.renameSync(saveName, path.join(evidence, `${scenario}-ui-save.json`));
    results.campaigns.push({ scenario, steps, outcome: current.campaign.outcome, finalHash: core.stateHash(current), completedSols: current.history.summaries.length });
    console.log(`Completed UI campaign ${scenario}: ${current.campaign.status}`);
  }
  await click(button('Chơi lại cùng seed'));
  const restarted = await state();
  check('Same-scenario restart clears prior history, cargo, jobs, events and report', restarted.clock.sol === 1 && restarted.history.summaries.length === 0 && restarted.rover.missionHistory.length === 0 && restarted.campaign.outcome === null && !restarted.logistics.activeOrder && !restarted.fabricator.activeJob);
  await open('launch', 'Chiến dịch');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(100);
  check('Escape closes settings and returns focus', await evaluate("!document.querySelector('.mission-dialog[open]') && document.activeElement.textContent.includes('Chiến dịch')"));
  check('No browser runtime exceptions', results.errors.length === 0);
} catch (error) {
  results.failure = error.message;
  console.error(error.message);
  if (call) { try { const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(evidence, 'failure.png'), Buffer.from(shot.data, 'base64')); } catch {} }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  ws?.close(); chrome.kill(); await server.close();
}
