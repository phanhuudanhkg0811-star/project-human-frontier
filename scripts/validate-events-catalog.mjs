import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import esbuild from 'esbuild';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiledSchemas = new WeakMap();

/** Structural coverage only: flags, crew, rover and RNG still require engine traces. */
function coverageReport(events) {
  const bySol = Array.from({ length: 32 }, (_, index) => ({ sol: index + 1, eventIds: [] }));
  const categories = {};
  for (const event of events) {
    categories[event.category] = (categories[event.category] ?? 0) + 1;
    for (const row of bySol) {
      if (event.when.some((condition) => {
        const withinRange = row.sol >= (condition.sol ?? condition.solMin ?? 1)
          && row.sol <= (condition.sol ?? condition.solMax ?? 32);
        const night = row.sol >= 15 && row.sol <= 28;
        return withinRange && (condition.isLunarNight === undefined || condition.isLunarNight === night);
      })) row.eventIds.push(event.id);
    }
  }
  return {
    count: events.length,
    categories,
    bySol,
    uncoveredSols: bySol.filter((row) => row.eventIds.length === 0).map((row) => row.sol),
    fixedMilestones: events.filter((event) => event.mandatory)
      .flatMap((event) => event.when.filter((condition) => condition.sol !== undefined)
        .map((condition) => ({ sol: condition.sol, eventId: event.id }))),
    note: 'Potential Sol coverage only; does not prove reachability through flags, crew, rover, priority or RNG.',
  };
}

/** Pure validation entry point. File access is injected so negative cases use isolated fixtures. */
export function validateEventCatalog({ events, briefs, schema, artManifest, assetExists, release = false }) {
  const errors = [];
  const error = (eventId, field, message) => errors.push({ eventId, field, message });
  let validate = compiledSchemas.get(schema);
  if (!validate) {
    const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strictRequired: false });
    validate = ajv.compile(schema);
    compiledSchemas.set(schema, validate);
  }
  if (!validate(events)) {
    for (const issue of validate.errors ?? []) {
      const index = Number(issue.instancePath.split('/')[1]);
      error(events?.[index]?.id ?? '<catalog>', issue.instancePath || '/', `${issue.message} ${JSON.stringify(issue.params)}`);
    }
    return { ok: false, errors, coverage: null };
  }

  const eventMap = new Map();
  const briefIds = new Set();
  for (const brief of briefs) {
    if (briefIds.has(brief.id)) error('<briefs>', brief.id, 'Duplicate Science Brief ID.');
    briefIds.add(brief.id);
  }
  for (const event of events) {
    if (eventMap.has(event.id)) error(event.id, 'id', 'Duplicate event ID.');
    eventMap.set(event.id, event);
  }
  for (const event of events) {
    const choiceIds = new Set();
    for (const [index, choice] of event.choices.entries()) {
      if (choiceIds.has(choice.id)) error(event.id, `choices[${index}].id`, `Duplicate choice ID: ${choice.id}.`);
      choiceIds.add(choice.id);
    }
    if (event.scienceBriefId !== null && !briefIds.has(event.scienceBriefId)) {
      error(event.id, 'scienceBriefId', `Unknown Science Brief: ${event.scienceBriefId}.`);
    }
    const artPath = Object.hasOwn(artManifest, event.art) ? artManifest[event.art] : null;
    if (!artPath) error(event.id, 'art', `Missing art manifest entry: ${event.art}.`);
    else if (!assetExists(artPath)) error(event.id, 'art', `Image file does not exist: ${artPath}.`);

    for (const [index, condition] of event.when.entries()) {
      const field = `when[${index}]`;
      if (condition.solMin !== undefined && condition.solMax !== undefined && condition.solMin > condition.solMax) {
        error(event.id, field, 'solMin must be <= solMax.');
      }
      for (const key of ['eventSeen', 'eventNotSeen']) {
        if (condition[key] !== undefined && !eventMap.has(condition[key])) {
          error(event.id, `${field}.${key}`, `Unknown event: ${condition[key]}.`);
        }
      }
      if (condition.choiceMade) {
        const referenced = eventMap.get(condition.choiceMade.eventId);
        if (!referenced?.choices.some((choice) => choice.id === condition.choiceMade.choiceId)) {
          error(event.id, `${field}.choiceMade`, `Unknown event/choice: ${condition.choiceMade.eventId}/${condition.choiceMade.choiceId}.`);
        }
      }
      for (const [resource, minimum] of Object.entries(condition.minResource ?? {})) {
        const maximum = condition.maxResource?.[resource];
        if (maximum !== undefined && minimum > maximum) error(event.id, field, `Impossible resource range for ${resource}.`);
      }
    }
    const effectLists = event.choices.map((choice, index) => ({ field: `choices[${index}].effects`, effects: choice.effects }));
    effectLists.push({ field: 'onExpireEffects', effects: event.onExpireEffects ?? [] });
    for (const { field, effects } of effectLists) {
      for (const [index, effect] of effects.entries()) {
        if (effect.kind === 'schedule-follow-up' && !eventMap.has(effect.eventId)) {
          error(event.id, `${field}[${index}].eventId`, `Unknown follow-up event: ${effect.eventId}.`);
        }
      }
    }
  }
  if (release && (events.length < 18 || events.length > 24)) {
    error('<catalog>', 'length', `Release requires 18–24 events; found ${events.length}.`);
  }
  return { ok: errors.length === 0, errors, coverage: coverageReport(events) };
}

export async function loadCatalogInputs(root = repositoryRoot) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'src/data', name), 'utf8'));
  // Import the actual typed manifest; never maintain a second list or parse TS with regex.
  const compiled = await esbuild.build({
    entryPoints: [path.join(root, 'src/components/cabin/hailAssets.ts')],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
  });
  const manifest = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const publicRoot = path.resolve(root, 'public');
  return {
    events: read('events.json'), briefs: read('nasa-briefs.json'), schema: read('events.schema.json'),
    artManifest: manifest.HAIL_EVENT_ART,
    assetExists: (url) => {
      if (!url.startsWith('/assets/')) return false;
      const file = path.resolve(publicRoot, url.slice(1));
      if (!file.startsWith(`${publicRoot}${path.sep}`)) return false;
      return fs.existsSync(file) && fs.statSync(file).isFile();
    },
  };
}

export async function runCatalogCli(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--release' && arg !== '--json')) {
    console.error('Usage: node scripts/validate-events-catalog.mjs [--release] [--json]');
    return 2;
  }
  try {
    const report = validateEventCatalog({ ...await loadCatalogInputs(), release: args.includes('--release') });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Event catalog: ${report.ok ? 'PASS' : 'FAIL'} (${args.includes('--release') ? 'release' : 'structure/references'})`);
      for (const issue of report.errors) console.error(`[${issue.eventId}] ${issue.field}: ${issue.message}`);
      if (report.coverage) {
        console.log(`Events: ${report.coverage.count}; categories: ${JSON.stringify(report.coverage.categories)}`);
        for (const [label, start, end] of [['Training', 1, 6], ['Sol 7', 7, 7], ['Preparation', 8, 14], ['Lunar Night', 15, 28], ['Recovery', 29, 32]]) {
          const rows = report.coverage.bySol.filter((row) => row.sol >= start && row.sol <= end);
          console.log(`${label} (${start}–${end}): ${rows.filter((row) => row.eventIds.length > 0).length}/${rows.length} Sols with potential events`);
        }
        console.log(`Uncovered Sols: ${report.coverage.uncoveredSols.join(', ') || 'none'}`);
        console.log(report.coverage.note);
        if (!args.includes('--release')) console.log('Run with --release after Core/Content merges to enforce the 18–24 event gate.');
      }
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(`Catalog validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runCatalogCli();
}
