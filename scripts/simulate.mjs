import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadSimulation, simulationRoot } from './load-simulation.mjs';

try {
  const args = process.argv.slice(2);
  const allowed = ['--output', '--seed-start', '--runs', '--policy', '--difficulty', '--profile', '--branch', '--matrix', '--suite'];
  if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !allowed.includes(arg))) throw new Error('Usage: npm run simulate -- [--policy balanced] [--runs 1] [--seed-start 205099] [--difficulty cadet] [--profile ID] [--branch A|B] [--matrix smoke | --suite references] [--output directory]');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  const seedStart = Number(options['--seed-start'] ?? 205099);
  const runs = Number(options['--runs'] ?? (options['--matrix'] ? 108 : 1));
  if (!Number.isSafeInteger(seedStart) || !Number.isSafeInteger(seedStart + runs - 1) || !Number.isInteger(runs) || runs < 1 || runs > 1000) throw new Error('Invalid seed or run count (1–1000).');
  const core = await loadSimulation();
  const bundle = core.loadContentBundle();
  const policyId = options['--policy'] ?? 'balanced';
  const difficulty = options['--difficulty'] ?? 'cadet';
  const profile = options['--profile'] ?? bundle.donki.samples[0].id;
  const branch = options['--branch'] ?? 'A';
  if (![...core.POLICY_IDS, 'baseline'].includes(policyId)) throw new Error('Unknown policy.');
  if (!Object.keys(bundle.campaign.difficultyProfiles).includes(difficulty)) throw new Error('Unknown difficulty.');
  if (!bundle.donki.samples.some((sample) => sample.id === profile)) throw new Error('Unknown DONKI profile.');
  if (!['A', 'B'].includes(branch)) throw new Error('Unknown Sol 7 branch.');
  if (options['--matrix'] && options['--matrix'] !== 'smoke') throw new Error('Unknown matrix.');
  if (options['--suite'] && options['--suite'] !== 'references') throw new Error('Unknown suite.');
  if (options['--matrix'] && options['--suite']) throw new Error('Choose a matrix or reference suite.');
  if (options['--matrix'] && runs !== 108) throw new Error('Smoke matrix requires exactly 108 runs.');
  const tasks = [];
  if (options['--matrix']) {
    for (const id of core.POLICY_IDS) for (const diff of Object.keys(bundle.campaign.difficultyProfiles)) for (const sample of bundle.donki.samples) for (const index of [0, 1]) {
      tasks.push({ name: `${id}-${diff}-${sample.id}-${index}`, seed: seedStart + tasks.length, difficulty: diff, donkiProfileId: sample.id, policy: core.createPolicy(id, index === 0 ? 'A' : 'B') });
    }
  } else if (options['--suite']) {
    for (const preference of ['A', 'B']) tasks.push({ name: `victory-${preference.toLowerCase()}`, seed: seedStart, difficulty, donkiProfileId: profile, policy: core.createPolicy('balanced', preference) });
    for (const reason of ['oxygen', 'water']) tasks.push({ name: `defeat-${reason}`, seed: seedStart, difficulty, donkiProfileId: profile, policy: core.createDefeatPolicy(reason) });
  } else for (let i = 0; i < runs; i++) tasks.push({ name: `${policyId}-${branch.toLowerCase()}-${seedStart + i}`, seed: seedStart + i, difficulty, donkiProfileId: profile, policy: policyId === 'baseline' ? core.baselinePolicy : core.createPolicy(policyId, branch) });

  const directory = path.resolve(simulationRoot, options['--output'] ?? `reports/phase-1-4/${options['--matrix'] ? 'smoke' : options['--suite'] ? 'references' : 'runs'}`);
  fs.mkdirSync(directory, { recursive: true });
  const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: simulationRoot, encoding: 'utf8' }).trim();
  const workingTreeDirty = execFileSync('git', ['status', '--porcelain'], { cwd: simulationRoot, encoding: 'utf8' }).trim().length > 0;
  const reports = [];
  for (const [index, task] of tasks.entries()) {
    const result = core.runCampaign(bundle, task, task.policy, 128, buildId);
    let status = result.status;
    let error = result.error;
    try { core.replayCampaign(result.trace, bundle); }
    catch (cause) { status = 'simulation-error'; error = `${error ?? ''} Replay: ${cause.message}`.trim(); }
    const traceName = `${task.name}.json`;
    const keepTrace = Boolean(options['--suite']) || tasks.length === 1 || status === 'simulation-error';
    if (keepTrace) fs.writeFileSync(path.join(directory, traceName), JSON.stringify(result.trace, null, 2) + '\n');
    const wrs = core.selectCampaignReport(result.state, bundle).wrs;
    reports.push({ name: task.name, policy: task.policy.id, status, error, ...result.metrics, wrs,
      trace: keepTrace ? traceName : null, finalHash: result.trace.finalHash });
    if (tasks.length > 10 && (index + 1) % 18 === 0) console.log(`Verified ${index + 1}/${tasks.length} campaigns.`);
  }
  const count = (key, entries) => Object.fromEntries([...new Set(entries.map((run) => run[key] ?? 'none'))].map((value) => [value, entries.filter((run) => (run[key] ?? 'none') === value).length]));
  const summarize = (entries) => ({ samples: entries.length, outcomes: count('outcome', entries), failureReasons: count('reasonCode', entries.filter((run) => run.outcome === 'defeat')), simulationErrors: entries.filter((run) => run.status === 'simulation-error').length });
  const percentiles = (values) => {
    const sorted = values.toSorted((a, b) => a - b);
    return { samples: sorted.length, min: sorted[0], p10: sorted[Math.floor((sorted.length - 1) * .1)], median: sorted[Math.floor((sorted.length - 1) * .5)], p90: sorted[Math.floor((sorted.length - 1) * .9)], max: sorted.at(-1) };
  };
  const report = { stage: 'Phase 1.4', buildId, workingTreeDirty,
    versions: { content: bundle.balance.contentVersion, model: bundle.balance.modelVersion, catalog: bundle.catalog.catalogVersion, ranking: bundle.campaign.ranking.version },
    contentHash: core.contentHash(bundle), summary: summarize(reports),
    groups: Object.fromEntries(['policy', 'difficulty', 'donkiProfileId'].map((key) => [key, Object.fromEntries([...new Set(reports.map((run) => run[key]))].map((value) => [value, summarize(reports.filter((run) => run[key] === value))]))])),
    finalResourcePercentiles: Object.fromEntries(['batteryKWh', 'waterL', 'oxygenKg', 'partsKg', 'mrePacks'].map((key) => [key, percentiles(reports.map((run) => run.finalResources[key]))])), reports };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const columns = ['name', 'policy', 'seed', 'difficulty', 'donkiProfileId', 'requestedBranch', 'actualBranch', 'status', 'outcome', 'rank', 'completedSols', 'completedExpeditions', 'blackouts', 'rejectedCommands', 'reasonCode', 'error', 'trace', 'finalHash'];
  const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  fs.writeFileSync(path.join(directory, 'report.csv'), [columns, ...reports.map((run) => columns.map((column) => run[column]))].map((row) => row.map(csvCell).join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ directory, ...report.summary, references: options['--suite'] ? reports.map(({ name, outcome, reasonCode, rank, completedExpeditions }) => ({ name, outcome, reasonCode, rank, completedExpeditions })) : undefined }, null, 2));
  if (reports.some((run) => run.status === 'simulation-error')) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
